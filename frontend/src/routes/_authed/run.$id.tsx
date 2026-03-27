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
import { useCreateRun, useCreateStackRun } from '../../api/mutations/runs.ts';
import { useRunStream } from '../../hooks/use-run-stream.ts';
import { usePRComments } from '../../api/queries/comments.ts';
import { usePRDiff } from '../../api/queries/diff.ts';
import { useApprovePR } from '../../api/mutations/approve.ts';
import { useReplyToComment, useResolveThread } from '../../api/mutations/comments.ts';
import { ReviewBrief } from '../../components/run/review-brief.tsx';
import { FindingList } from '../../components/run/finding-list.tsx';
import { DiffViewer } from '../../components/diff/diff-viewer.tsx';
import { StaleBanner } from '../../components/run/stale-banner.tsx';
import { PostBar } from '../../components/run/post-bar.tsx';
import { ChatPanel } from '../../components/run/chat-panel.tsx';

function RunPage() {
  const { id } = Route.useParams();
  const router = useRouter();

  // View mode toggle — default to diff so annotations are visible as sidebar
  const [viewMode, setViewMode] = useState<'findings' | 'diff'>('diff');

  // Stack PR filter state (null = show all)
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);

  // Data fetching
  const { data: run, isLoading: runLoading, error: runError } = useRun(id);
  const { data: findingsData } = useFindings(id);

  const isComplete =
    run?.status === 'completed' || run?.status === 'partial';

  const { data: commentsData } = usePRComments(
    run?.pr.id ?? '',
    !!isComplete,
  );

  // For stack reviews, fetch the selected PR's diff; otherwise fall back to root PR
  const diffPrId = selectedPrId ?? run?.pr.id ?? '';
  const { data: diffData } = usePRDiff(
    diffPrId,
    !!isComplete,
  );

  // Mutations
  const updateFinding = useUpdateFinding(id);
  const bulkAction = useBulkAction(id);
  const postToGithub = usePostToGithub(id);
  const exportFindings = useExportFindings(id);
  const createRun = useCreateRun();
  const createStackRun = useCreateStackRun();
  const approvePR = useApprovePR(run?.pr.id ?? '');
  const replyToComment = useReplyToComment(run?.pr.id ?? '');
  const resolveThread = useResolveThread(run?.pr.id ?? '');

  const queryClient = useQueryClient();

  // SSE stream for live output
  const isInProgress = run?.status === 'queued' || run?.status === 'running';
  const stream = useRunStream(id, isInProgress ?? false);

  // Findings state management
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [rawOutputExpanded, setRawOutputExpanded] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const cliOutputRef = useRef<HTMLPreElement>(null);

  // Chat panel state
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);

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

  // Filtered findings for stack PR filter
  const filteredFindings = selectedPrId
    ? sortedFindings.filter((f) => f.pr_id === selectedPrId)
    : sortedFindings;

  // Compute per-PR finding counts for the stack navigator
  const prFindingCounts = new Map<string, number>();
  if (run?.stack_prs) {
    for (const f of findings) {
      if (f.pr_id) {
        prFindingCounts.set(f.pr_id, (prFindingCounts.get(f.pr_id) ?? 0) + 1);
      }
    }
  }

  // Stale detection
  const isStale =
    run != null && run.pr.head_sha !== run.head_sha;

  // Whether we're in read-only mode (already posted)
  const isReadOnly = run?.has_post ?? false;

  // Approve state
  const [isApproved, setIsApproved] = useState(false);

  // Clamp focused index
  useEffect(() => {
    if (focusedIndex >= filteredFindings.length && filteredFindings.length > 0) {
      setFocusedIndex(filteredFindings.length - 1);
    }
  }, [filteredFindings.length, focusedIndex]);

  // Reset focus when PR filter changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [selectedPrId]);

  // Auto-scroll CLI output
  const liveOutput = stream.cliOutput || run?.cli_output || '';
  useEffect(() => {
    if (cliOutputRef.current) {
      cliOutputRef.current.scrollTop = cliOutputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  // Get focused finding
  const getFocusedFinding = useCallback((): FindingItem | undefined => {
    return filteredFindings[focusedIndex];
  }, [filteredFindings, focusedIndex]);

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

  const handleReplyToComment = useCallback(
    (commentId: number, body: string) => replyToComment.mutate({ commentId, body }),
    [replyToComment],
  );
  const handleResolveThread = useCallback(
    (commentId: number, threadNodeId: string, resolved: boolean) =>
      resolveThread.mutate({ commentId, threadNodeId, resolved }),
    [resolveThread],
  );

  const handleDiscuss = useCallback(
    (prefill: string) => setPendingChatMessage(prefill),
    [],
  );

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

  const handleApprove = useCallback(() => {
    if (isStale || run?.is_self_review) return;
    if (
      !window.confirm(
        'Approve this PR on GitHub? This will submit an approval review.',
      )
    ) {
      return;
    }
    approvePR.mutate(undefined, {
      onSuccess: () => setIsApproved(true),
    });
  }, [approvePR, isStale, run?.is_self_review]);

  const handleRerun = useCallback(() => {
    if (!run) return;
    const onSuccess = (data: { id: string }) => {
      void router.navigate({ to: `/run/${data.id}` as '/' });
    };
    if (run.stack_id) {
      createStackRun.mutate({ stackId: run.stack_id }, { onSuccess });
    } else {
      createRun.mutate(
        { prId: run.pr.id, isSelfReview: run.is_self_review },
        { onSuccess },
      );
    }
  }, [run, createRun, createStackRun, router]);

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
            Math.min(prev + 1, filteredFindings.length - 1),
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
    filteredFindings.length,
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
        <div className="text-muted-foreground text-sm">Loading run...</div>
      </div>
    );
  }

  // --- Error state ---
  if (runError || !run) {
    return (
      <div className="p-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Inbox
        </Link>
        <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
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
      <div className="px-6 py-4 border-b border-border flex items-center gap-4 flex-wrap">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono text-muted-foreground">
            {repoLabel}
          </span>
          <span className="text-foreground text-sm truncate">
            #{run.pr.github_pr_number} {run.pr.title}
          </span>
          {run.pr.stack_id &&
            run.pr.stack_position != null &&
            run.pr.stack_size != null && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
                Stack {run.pr.stack_position}/{run.pr.stack_size}
              </span>
            )}
          {run.stack_id && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
              Stack Review
            </span>
          )}
          {run.is_self_review && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-400">
              SELF
            </span>
          )}
          {run.pr.is_draft && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
              Draft
            </span>
          )}
        </div>

        {/* Status */}
        <RunStatusBadge status={run.status} />

        {/* Re-run button */}
        {(isComplete || isFailed) && !isReadOnly && (
          <SplitButton
            label={createRun.isPending || createStackRun.isPending ? 'Starting...' : 'Re-run Review'}
            onClick={handleRerun}
            disabled={createRun.isPending || createStackRun.isPending}
            menuItems={[
              { label: 'Customize & Re-run...', onClick: () => setShowCustomize(true) },
            ]}
          />
        )}
      </div>

      {/* Stack PRs — vertical Graphite-style navigator */}
      {run.stack_id && run.stack_prs && run.stack_prs.length > 0 && (
        <div className="border-b border-border bg-purple-500/[0.03]">
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stack</span>
              <span className="text-xs text-muted-foreground">
                {run.stack_prs.length} PRs
              </span>
              {selectedPrId && (
                <button
                  type="button"
                  onClick={() => setSelectedPrId(null)}
                  className="ml-auto text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="relative pl-5">
              {/* Vertical connector line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              {/* PRs — highest position (top of stack) first */}
              {[...run.stack_prs].reverse().map((sp) => {
                const isSelected = selectedPrId === sp.id;
                const count = prFindingCounts.get(sp.id) ?? 0;
                return (
                  <div key={sp.id} className="relative flex items-start gap-3 pb-3">
                    {/* Dot */}
                    <div className="absolute -left-5 top-1">
                      <div
                        className={`w-[9px] h-[9px] rounded-full border-2 ${
                          isSelected
                            ? 'bg-purple-400 border-purple-400'
                            : 'bg-background border-muted-foreground/40'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPrId(isSelected ? null : sp.id)}
                      className={`group flex items-center gap-2 py-0.5 text-xs transition-colors text-left ${
                        isSelected
                          ? 'text-purple-300'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="font-mono text-muted-foreground group-hover:text-foreground">
                        #{sp.github_pr_number}
                      </span>
                      <span className={`truncate max-w-md ${isSelected ? 'font-medium' : ''}`}>
                        {sp.title}
                      </span>
                      {isComplete && count > 0 && (
                        <span className={`shrink-0 text-[10px] rounded-full px-1.5 py-0.5 ${
                          isSelected
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
              {/* Base branch (trunk) */}
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-5 top-1">
                  <div className="w-[9px] h-[9px] rounded-full border-2 bg-background border-muted-foreground/40" />
                </div>
                <span className="text-xs text-muted-foreground py-0.5">
                  {run.pr.base_branch}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="px-6 py-6 space-y-6">
        {/* Stale banner */}
        {isStale && (
          <StaleBanner
            onRerun={handleRerun}
            isRerunning={createRun.isPending || createStackRun.isPending}
          />
        )}

        {/* In progress state */}
        {isInProgress && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 py-4">
              <Spinner />
              <span className="text-muted-foreground text-sm">
                {stream.phaseMessage ?? 'Review in progress...'}
              </span>
            </div>

            {liveOutput && (
              <div className="rounded-lg border border-border bg-background overflow-hidden">
                <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium">
                  Live Output
                </div>
                <pre
                  ref={cliOutputRef}
                  className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
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
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            <p className="font-medium">Review failed</p>
            {run.error_message && (
              <p className="mt-1 text-destructive/80">{run.error_message}</p>
            )}
          </div>
        )}

        {/* Completed state: findings */}
        {isComplete && (
          <>
            {findingsData === undefined && (
              <div className="flex items-center gap-3 py-4">
                <Spinner />
                <span className="text-muted-foreground text-sm">Loading findings...</span>
              </div>
            )}

            {/* Raw Output */}
            {run.cli_output && (
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setRawOutputExpanded(!rawOutputExpanded)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
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
                  <pre className="px-4 pb-4 text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                    {run.cli_output}
                  </pre>
                )}
              </div>
            )}

            {/* View Prompt */}
            {run.prompt && (
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
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
                  <pre className="px-4 pb-4 text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                    {run.prompt}
                  </pre>
                )}
              </div>
            )}

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                type="button"
                onClick={() => setViewMode('findings')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'findings'
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Findings ({selectedPrId ? filteredFindings.length : counts.total})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'diff'
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Diff
              </button>
            </div>

            {viewMode === 'findings' && (
              <>
                {/* Keyboard shortcuts help */}
                {!isReadOnly && filteredFindings.length > 0 && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        j
                      </kbd>
                      /
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        k
                      </kbd>{' '}
                      navigate
                    </span>
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        a
                      </kbd>{' '}
                      accept
                    </span>
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        r
                      </kbd>{' '}
                      reject
                    </span>
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        e
                      </kbd>{' '}
                      edit
                    </span>
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        Shift+R
                      </kbd>{' '}
                      reject nitpicks
                    </span>
                    <span>
                      <kbd className="bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                        Shift+P
                      </kbd>{' '}
                      post/export
                    </span>
                  </div>
                )}

                <FindingList
                  findings={filteredFindings}
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
                  stackPrs={selectedPrId ? undefined : run.stack_prs}
                />
              </>
            )}

            {viewMode === 'diff' && (
              diffData ? (
                <DiffViewer
                  files={diffData.files}
                  findings={selectedPrId ? filteredFindings : findings}
                  commentThreads={commentsData?.threads}
                  issueComments={commentsData?.issue_comments}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onStartEdit={handleStartEdit}
                  editingId={editingId}
                  editBody={editBody}
                  onEditBodyChange={setEditBody}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                  onReplyToComment={handleReplyToComment}
                  onResolveThread={handleResolveThread}
                  onDiscuss={handleDiscuss}
                />
              ) : (
                <div className="flex items-center gap-3 py-4">
                  <Spinner />
                  <span className="text-muted-foreground text-sm">Loading diff...</span>
                </div>
              )
            )}
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
          onApprove={handleApprove}
          isApproving={approvePR.isPending}
          isApproved={isApproved}
        />
      )}

      {/* Chat panel */}
      {isComplete && (
        <ChatPanel
          runId={id}
          sessionId={run?.session_id ?? null}
          isComplete={isComplete}
          pendingMessage={pendingChatMessage}
          onPendingMessageConsumed={() => setPendingChatMessage(null)}
        />
      )}

      {/* Customize & Re-run modal */}
      <PromptPreviewModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        prId={run?.pr.id ?? ''}
        stackId={run?.stack_id ?? undefined}
        onRun={(prompt) => {
          if (!run) return;
          const onSuccess = (data: { id: string }) => {
            setShowCustomize(false);
            void router.navigate({ to: `/run/${data.id}` as '/' });
          };
          if (run.stack_id) {
            createStackRun.mutate({ stackId: run.stack_id, prompt }, { onSuccess });
          } else {
            createRun.mutate(
              { prId: run.pr.id, isSelfReview: run.is_self_review, prompt },
              { onSuccess },
            );
          }
        }}
        isRunning={createRun.isPending || createStackRun.isPending}
        linearTicketId={run?.pr.linear_ticket_id}
        notionUrl={run?.pr.notion_url}
      />
    </div>
  );
}

// --- Helper components ---

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-muted text-muted-foreground',
    running: 'bg-primary/20 text-primary',
    completed: 'bg-green-500/10 text-green-400',
    partial: 'bg-yellow-500/10 text-yellow-400',
    failed: 'bg-destructive/10 text-destructive',
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
      className="animate-spin h-5 w-5 text-primary"
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
