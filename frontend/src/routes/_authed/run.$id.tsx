import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { SplitButton } from '../../components/common/split-button.tsx';
import { PromptPreviewModal } from '../../components/common/prompt-preview-modal.tsx';
import { useRun } from '../../api/queries/runs.ts';
import { useFindings } from '../../api/queries/findings.ts';
import type { FindingItem } from '../../api/queries/findings.ts';
import {
  useUpdateFinding,
  useBulkAction,
  usePostToGithub,
  useExportFindings,
} from '../../api/mutations/findings.ts';
import { useCreateRun } from '../../api/mutations/runs.ts';
import { useRunStream } from '../../hooks/use-run-stream.ts';
import { usePRComments } from '../../api/queries/comments.ts';
import { ReviewBrief } from '../../components/run/review-brief.tsx';
import { FindingList } from '../../components/run/finding-list.tsx';
import { StaleBanner } from '../../components/run/stale-banner.tsx';
import { PostBar } from '../../components/run/post-bar.tsx';

function RunPage() {
  const { id } = Route.useParams();
  const router = useRouter();

  // Data fetching
  const { data: run, isLoading: runLoading, error: runError } = useRun(id);
  const { data: findingsData } = useFindings(id);
  const { data: commentsData } = usePRComments(
    run?.pr.id ?? '',
    !!(run?.has_post),
  );

  // Mutations
  const updateFinding = useUpdateFinding(id);
  const bulkAction = useBulkAction(id);
  const postToGithub = usePostToGithub(id);
  const exportFindings = useExportFindings(id);
  const createRun = useCreateRun();

  const queryClient = useQueryClient();

  // SSE stream for live output
  const isInProgress = run?.status === 'queued' || run?.status === 'running';
  const stream = useRunStream(id, isInProgress ?? false);

  // Invalidate findings when run completes
  useEffect(() => {
    if (run?.status === 'completed' || run?.status === 'partial') {
      void queryClient.invalidateQueries({ queryKey: ['findings', id] });
    }
  }, [run?.status, id, queryClient]);

  // Findings state management
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [rawOutputExpanded, setRawOutputExpanded] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const cliOutputRef = useRef<HTMLPreElement>(null);

  // Post feedback state
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const findings = findingsData?.findings ?? [];
  const counts = findingsData?.counts ?? {
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    edited: 0,
    posted: 0,
  };

  // Sorted findings for keyboard nav
  const sortedFindings = [...findings].sort(
    (a, b) => a.toolkit_order - b.toolkit_order,
  );

  // Stale detection
  const isStale =
    run != null && run.pr.head_sha !== run.head_sha;

  // Whether the run is completed (or partial — still reviewable)
  const isComplete =
    run?.status === 'completed' || run?.status === 'partial';

  // Whether we're in read-only mode (already posted)
  const isReadOnly = run?.has_post ?? false;

  // Clamp focused index
  useEffect(() => {
    if (focusedIndex >= sortedFindings.length && sortedFindings.length > 0) {
      setFocusedIndex(sortedFindings.length - 1);
    }
  }, [sortedFindings.length, focusedIndex]);

  // Auto-scroll CLI output
  const liveOutput = stream.cliOutput || run?.cli_output || '';
  useEffect(() => {
    if (cliOutputRef.current) {
      cliOutputRef.current.scrollTop = cliOutputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  // Get focused finding
  const getFocusedFinding = useCallback((): FindingItem | undefined => {
    return sortedFindings[focusedIndex];
  }, [sortedFindings, focusedIndex]);

  // Action handlers
  const handleAccept = useCallback(
    (findingId: string) => {
      if (isReadOnly) return;
      updateFinding.mutate({ findingId, status: 'accepted' });
    },
    [updateFinding, isReadOnly],
  );

  const handleReject = useCallback(
    (findingId: string) => {
      if (isReadOnly) return;
      updateFinding.mutate({ findingId, status: 'rejected' });
    },
    [updateFinding, isReadOnly],
  );

  const handleStartEdit = useCallback(
    (findingId: string) => {
      if (isReadOnly) return;
      const finding = findings.find((f) => f.id === findingId);
      if (finding) {
        setEditingId(findingId);
        setEditBody(finding.edited_body ?? finding.body);
      }
    },
    [findings, isReadOnly],
  );

  const handleEditSave = useCallback(() => {
    if (editingId) {
      updateFinding.mutate(
        { findingId: editingId, status: 'edited', edited_body: editBody },
        { onSuccess: () => setEditingId(null) },
      );
    }
  }, [editingId, editBody, updateFinding]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditBody('');
  }, []);

  const handleRejectNitpicks = useCallback(() => {
    if (isReadOnly) return;
    bulkAction.mutate({
      action: 'reject',
      filter: { severity: 'nitpick' },
    });
  }, [bulkAction, isReadOnly]);

  const handlePost = useCallback(() => {
    if (isReadOnly || isStale) return;
    if (
      !window.confirm(
        'Post accepted findings to GitHub as a PR review? This cannot be undone.',
      )
    ) {
      return;
    }
    setPostError(null);
    postToGithub.mutate(undefined, {
      onSuccess: (data) => {
        setPostSuccess(`Posted ${data.posted_count} findings to GitHub`);
      },
      onError: (err) => {
        setPostError(err instanceof Error ? err.message : 'Failed to post to GitHub');
      },
    });
  }, [postToGithub, isReadOnly, isStale]);

  // Auto-dismiss success banner after 5s
  useEffect(() => {
    if (!postSuccess) return;
    const timer = setTimeout(() => setPostSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [postSuccess]);

  const handleExport = useCallback(() => {
    if (isReadOnly || isStale) return;
    if (!window.confirm('Export accepted findings as markdown?')) return;
    exportFindings.mutate(undefined, {
      onSuccess: (data) => {
        // Copy to clipboard
        void navigator.clipboard.writeText(data.markdown);
        alert(
          `Exported ${data.findings_count} findings. Markdown copied to clipboard.`,
        );
      },
    });
  }, [exportFindings, isReadOnly, isStale]);

  const handleRerun = useCallback(() => {
    if (!run) return;
    createRun.mutate(
      { prId: run.pr.id, isSelfReview: run.is_self_review },
      {
        onSuccess: (data) => {
          void router.navigate({ to: `/run/${data.id}` as '/' });
        },
      },
    );
  }, [run, createRun, router]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isComplete || isReadOnly) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable shortcuts when editor is open
      if (editingId !== null) return;

      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
          e.preventDefault();
          setFocusedIndex((prev) =>
            Math.min(prev + 1, sortedFindings.length - 1),
          );
          break;
        case 'k':
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'a': {
          e.preventDefault();
          const f = getFocusedFinding();
          if (f && (f.status === 'pending' || f.status === 'edited')) handleAccept(f.id);
          break;
        }
        case 'r': {
          e.preventDefault();
          const f = getFocusedFinding();
          if (f && (f.status === 'pending' || f.status === 'edited')) handleReject(f.id);
          break;
        }
        case 'e': {
          e.preventDefault();
          const f = getFocusedFinding();
          if (f && (f.status === 'pending' || f.status === 'edited')) handleStartEdit(f.id);
          break;
        }
        case 'R':
          if (e.shiftKey) {
            e.preventDefault();
            handleRejectNitpicks();
          }
          break;
        case 'P':
          if (e.shiftKey) {
            e.preventDefault();
            if (run?.is_self_review) {
              handleExport();
            } else {
              handlePost();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isComplete,
    isReadOnly,
    editingId,
    sortedFindings.length,
    getFocusedFinding,
    handleAccept,
    handleReject,
    handleStartEdit,
    handleRejectNitpicks,
    handlePost,
    handleExport,
    run?.is_self_review,
  ]);

  // --- Loading state ---
  if (runLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-500 text-sm">Loading run...</div>
      </div>
    );
  }

  // --- Error state ---
  if (runError || !run) {
    return (
      <div className="p-6">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
          &larr; Back to Inbox
        </Link>
        <div className="mt-6 rounded-lg border border-red-800 bg-red-500/10 p-4 text-red-400 text-sm">
          {runError instanceof Error
            ? runError.message
            : 'Failed to load run.'}
        </div>
      </div>
    );
  }

  // --- Status helpers ---
  const isFailed = run.status === 'failed';
  const repoLabel = `${run.pr.repo.github_owner}/${run.pr.repo.github_name}`;

  return (
    <div className="pb-20">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-4 flex-wrap">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
          &larr; Back
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono text-gray-500">
            {repoLabel}
          </span>
          <span className="text-gray-200 text-sm truncate">
            #{run.pr.github_pr_number} {run.pr.title}
          </span>
          {run.pr.stack_id &&
            run.pr.stack_position != null &&
            run.pr.stack_size != null && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
                Stack {run.pr.stack_position}/{run.pr.stack_size}
              </span>
            )}
          {run.is_self_review && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-400">
              SELF
            </span>
          )}
          {run.pr.is_draft && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-500/20 text-gray-400">
              Draft
            </span>
          )}
        </div>

        {/* Status */}
        <RunStatusBadge status={run.status} />

        {/* Re-run button */}
        {(isComplete || isFailed) && !isReadOnly && (
          <SplitButton
            label={createRun.isPending ? 'Starting...' : 'Re-run Review'}
            onClick={handleRerun}
            disabled={createRun.isPending}
            menuItems={[
              { label: 'Customize & Re-run...', onClick: () => setShowCustomize(true) },
            ]}
          />
        )}
      </div>

      {/* Main content */}
      <div className="px-6 py-6 space-y-6">
        {/* Stale banner */}
        {isStale && (
          <StaleBanner
            onRerun={handleRerun}
            isRerunning={createRun.isPending}
          />
        )}

        {/* In progress state */}
        {isInProgress && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 py-4">
              <Spinner />
              <span className="text-gray-400 text-sm">
                {stream.phaseMessage ?? 'Review in progress...'}
              </span>
            </div>

            {liveOutput && (
              <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-500 font-medium">
                  Live Output
                </div>
                <pre
                  ref={cliOutputRef}
                  className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
                >
                  {liveOutput}
                </pre>
              </div>
            )}

            {run.risk_signals && (
              <ReviewBrief brief={null} riskSignals={run.risk_signals} />
            )}
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="rounded-lg border border-red-800 bg-red-500/10 p-4 text-red-400 text-sm">
            <p className="font-medium">Review failed</p>
            {run.error_message && (
              <p className="mt-1 text-red-400/80">{run.error_message}</p>
            )}
          </div>
        )}

        {/* Completed state: findings */}
        {isComplete && (
          <>
            {findingsData === undefined && (
              <div className="flex items-center gap-3 py-4">
                <Spinner />
                <span className="text-gray-400 text-sm">Loading findings...</span>
              </div>
            )}

            {/* Raw Output */}
            {run.cli_output && (
              <div className="rounded-lg border border-gray-800">
                <button
                  type="button"
                  onClick={() => setRawOutputExpanded(!rawOutputExpanded)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors text-left"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${rawOutputExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Raw Output
                </button>
                {rawOutputExpanded && (
                  <pre className="px-4 pb-4 text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                    {run.cli_output}
                  </pre>
                )}
              </div>
            )}

            {/* View Prompt */}
            {run.prompt && (
              <div className="rounded-lg border border-gray-800">
                <button
                  type="button"
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors text-left"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${promptExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  View Prompt
                </button>
                {promptExpanded && (
                  <pre className="px-4 pb-4 text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                    {run.prompt}
                  </pre>
                )}
              </div>
            )}

            {/* Keyboard shortcuts help */}
            {!isReadOnly && sortedFindings.length > 0 && (
              <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    j
                  </kbd>
                  /
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    k
                  </kbd>{' '}
                  navigate
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    a
                  </kbd>{' '}
                  accept
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    r
                  </kbd>{' '}
                  reject
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    e
                  </kbd>{' '}
                  edit
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    Shift+R
                  </kbd>{' '}
                  reject nitpicks
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                    Shift+P
                  </kbd>{' '}
                  post/export
                </span>
              </div>
            )}

            <FindingList
              findings={sortedFindings}
              focusedIndex={focusedIndex}
              onAccept={handleAccept}
              onReject={handleReject}
              onStartEdit={handleStartEdit}
              editingId={editingId}
              editBody={editBody}
              onEditBodyChange={setEditBody}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
              commentThreads={commentsData?.threads}
            />
          </>
        )}
      </div>

      {/* Post bar — only show when run is complete and has findings */}
      {isComplete && counts.total > 0 && (
        <PostBar
          counts={counts}
          isSelfReview={run.is_self_review}
          isStale={isStale}
          hasPost={run.has_post}
          onPost={handlePost}
          onExport={handleExport}
          onRejectNitpicks={handleRejectNitpicks}
          isPosting={postToGithub.isPending || exportFindings.isPending}
          postError={postError}
          postSuccess={postSuccess}
          onDismissError={() => setPostError(null)}
        />
      )}

      {/* Customize & Re-run modal */}
      <PromptPreviewModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        prId={run?.pr.id ?? ''}
        onRun={(prompt) => {
          if (!run) return;
          createRun.mutate(
            { prId: run.pr.id, isSelfReview: run.is_self_review, prompt },
            {
              onSuccess: (data) => {
                setShowCustomize(false);
                void router.navigate({ to: `/run/${data.id}` as '/' });
              },
            },
          );
        }}
        isRunning={createRun.isPending}
        linearTicketId={run?.pr.linear_ticket_id}
        notionUrl={run?.pr.notion_url}
      />
    </div>
  );
}

// --- Helper components ---

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-gray-500/20 text-gray-400',
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    partial: 'bg-yellow-500/20 text-yellow-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const labels: Record<string, string> = {
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    partial: 'Partial',
    failed: 'Failed',
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.queued}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-blue-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export const Route = createFileRoute('/_authed/run/$id')({
  component: RunPage,
});
