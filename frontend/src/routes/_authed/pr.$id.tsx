import { useState, useEffect, useCallback } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { usePullRequest } from '../../api/queries/prs.ts';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { useCreateRun } from '../../api/mutations/runs.ts';
import { useUpdatePr } from '../../api/mutations/prs.ts';
import { api } from '../../api/client.ts';
import { useQuery } from '@tanstack/react-query';
import { SplitButton } from '../../components/common/split-button.tsx';
import { PromptPreviewModal } from '../../components/common/prompt-preview-modal.tsx';
import { formatDateTime } from '../../lib/format-date.ts';
import { usePRDiff } from '../../api/queries/diff.ts';
import { usePRComments } from '../../api/queries/comments.ts';
import { DiffViewer } from '../../components/diff/diff-viewer.tsx';
import { useReplyToComment, useResolveThread } from '../../api/mutations/comments.ts';

function PrDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [selfReview, setSelfReview] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  const [editLinear, setEditLinear] = useState('');
  const [editNotion, setEditNotion] = useState('');
  const [runsExpanded, setRunsExpanded] = useState(false);

  const { data: pr, isLoading, error } = usePullRequest(id);
  const { data: stackPrs } = useQuery({
    queryKey: ['prs', id, 'stack'],
    queryFn: async () => {
      const res = await api.get<{ stack: PullRequestListItem[] }>(`/prs/${id}/stack`);
      return res.stack;
    },
    enabled: !!pr?.stack_id,
  });

  const { data: diffData, isLoading: diffLoading } = usePRDiff(id, true);
  const { data: commentsData } = usePRComments(id, true);

  const createRun = useCreateRun();
  const updatePr = useUpdatePr();
  const replyToComment = useReplyToComment(id);
  const resolveThread = useResolveThread(id);

  useEffect(() => {
    if (pr) {
      setEditLinear(pr.linear_ticket_id ?? '');
      setEditNotion(pr.notion_url ?? '');
    }
  }, [pr]);

  const handleReplyToComment = useCallback(
    (commentId: number, body: string) => replyToComment.mutate({ commentId, body }),
    [replyToComment],
  );
  const handleResolveThread = useCallback(
    (commentId: number, threadNodeId: string, resolved: boolean) =>
      resolveThread.mutate({ commentId, threadNodeId, resolved }),
    [resolveThread],
  );

  const handleRunReview = () => {
    createRun.mutate(
      { prId: id, isSelfReview: selfReview },
      {
        onSuccess: (data) => {
          void router.navigate({ to: `/run/${data.id}` as '/' });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-500 text-sm">Loading pull request...</div>
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="p-6">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
          &larr; Back to Inbox
        </Link>
        <div className="mt-6 rounded-lg border border-red-800 bg-red-500/10 p-4 text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to load pull request.'}
        </div>
      </div>
    );
  }

  const repoLabel = `${pr.repo.github_owner}/${pr.repo.github_name}`;
  const sortedRuns = [...pr.runs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="pb-20">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-4 flex-wrap">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
          &larr; Back
        </Link>
        <span className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
          {repoLabel}
        </span>
        <PrStatusBadge status={pr.status} />

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={selfReview}
              onChange={(e) => setSelfReview(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Self-review
          </label>
          <SplitButton
            label={createRun.isPending ? 'Starting...' : 'Run Review'}
            onClick={handleRunReview}
            disabled={createRun.isPending}
            menuItems={[
              { label: 'Customize & Run...', onClick: () => setShowCustomize(true) },
            ]}
          />
        </div>
      </div>

      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-xl font-semibold text-gray-100">
          #{pr.github_pr_number}{' '}
          <span className="text-gray-200">{pr.title}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>
            by <span className="text-gray-400">{pr.author}</span>
          </span>
          <span>
            <span className="font-mono text-gray-400">{pr.branch_name}</span>
            <span className="mx-2 text-gray-600">&rarr;</span>
            <span className="font-mono text-gray-400">{pr.base_branch}</span>
          </span>

          {pr.linear_ticket_id && (
            <a
              href={`https://linear.app/issue/${pr.linear_ticket_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 11.5l-7-7 1-1 7 7-1 1z" />
              </svg>
              {pr.linear_ticket_id}
            </a>
          )}

          {pr.notion_url && (
            <a
              href={pr.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-300"
            >
              Notion
            </a>
          )}

          {pr.stack_id && pr.stack_position != null && pr.stack_size != null && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
              Stack {pr.stack_position}/{pr.stack_size}
            </span>
          )}
        </div>

        {createRun.error && (
          <p className="mt-2 text-sm text-red-400">
            {createRun.error instanceof Error
              ? createRun.error.message
              : 'Failed to start run.'}
          </p>
        )}
      </div>

      {/* Stack context — vertical Graphite-style */}
      {pr.stack_id && stackPrs && stackPrs.length > 1 && (
        <div className="border-b border-gray-800 bg-purple-500/5 mr-[360px]">
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stack</span>
              <span className="text-xs text-gray-600">
                {pr.stack_position} of {pr.stack_size}
              </span>
            </div>
            <div className="relative pl-5">
              {/* Vertical connector line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-700" />
              {/* PRs — highest position (top of stack) first */}
              {[...stackPrs].reverse().map((sibling) => {
                const isCurrent = sibling.id === pr.id;
                return (
                  <div key={sibling.id} className="relative flex items-start gap-3 pb-3">
                    {/* Dot */}
                    <div className="absolute -left-5 top-1">
                      <div
                        className={`w-[9px] h-[9px] rounded-full border-2 ${
                          isCurrent
                            ? 'bg-purple-400 border-purple-400'
                            : 'bg-gray-950 border-gray-600'
                        }`}
                      />
                    </div>
                    <Link
                      to={`/pr/${sibling.id}` as '/'}
                      className={`group flex items-center gap-2 py-0.5 text-xs transition-colors ${
                        isCurrent
                          ? 'text-purple-300'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span className="font-mono text-gray-500 group-hover:text-gray-400">
                        #{sibling.github_pr_number}
                      </span>
                      <span className={`truncate max-w-md ${isCurrent ? 'font-medium' : ''}`}>
                        {sibling.title}
                      </span>
                    </Link>
                  </div>
                );
              })}
              {/* Base branch (trunk) */}
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-5 top-1">
                  <div className="w-[9px] h-[9px] rounded-full border-2 bg-gray-950 border-gray-600" />
                </div>
                <span className="text-xs text-gray-600 py-0.5">
                  {stackPrs[0]?.base_branch ?? 'base'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Business context — collapsible inline */}
      <div className="px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Context</span>
          <div className="flex-1 flex items-center gap-3">
            <input
              type="text"
              value={editLinear}
              onChange={(e) => setEditLinear(e.target.value)}
              onBlur={() => {
                if ((editLinear || null) !== (pr?.linear_ticket_id || null)) {
                  updatePr.mutate({ prId: id, linear_ticket_id: editLinear || null });
                }
              }}
              placeholder="Linear ticket (e.g. CORE-558)"
              className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500 w-48"
            />
            <input
              type="text"
              value={editNotion}
              onChange={(e) => setEditNotion(e.target.value)}
              onBlur={() => {
                if ((editNotion || null) !== (pr?.notion_url || null)) {
                  updatePr.mutate({ prId: id, notion_url: editNotion || null });
                }
              }}
              placeholder="Notion URL"
              className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500 flex-1 max-w-xs"
            />
          </div>
        </div>
      </div>

      {/* Diff */}
      <div className="px-6 py-6 space-y-6">
        {diffLoading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <svg
              className="animate-spin h-5 w-5 text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-gray-400 text-sm">Loading diff...</span>
          </div>
        ) : diffData ? (
          <DiffViewer
            files={diffData.files}
            findings={[]}
            commentThreads={commentsData?.threads}
            issueComments={commentsData?.issue_comments}
            onAccept={() => {}}
            onReject={() => {}}
            onStartEdit={() => {}}
            onReplyToComment={handleReplyToComment}
            onResolveThread={handleResolveThread}
          />
        ) : null}

        {/* Run history — collapsible */}
        {sortedRuns.length > 0 && (
          <div className="rounded-lg border border-gray-800">
            <button
              type="button"
              onClick={() => setRunsExpanded(!runsExpanded)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors text-left"
            >
              <svg
                className={`w-4 h-4 transition-transform ${runsExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Run History ({sortedRuns.length})
            </button>
            {runsExpanded && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-gray-800 bg-gray-900/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      SHA
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Findings
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Type
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Started
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRuns.map((run, i) => (
                    <tr
                      key={run.id}
                      onClick={() =>
                        void router.navigate({ to: `/run/${run.id}` as '/' })
                      }
                      className={`cursor-pointer hover:bg-gray-800/60 transition-colors ${
                        i < sortedRuns.length - 1 ? 'border-b border-gray-800/60' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {run.head_sha.slice(0, 7)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {run.findings_count}
                      </td>
                      <td className="px-4 py-3">
                        {run.is_self_review ? (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-400">
                            SELF
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateTime(run.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {run.completed_at ? formatDateTime(run.completed_at) : (
                          <span className="text-gray-600">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Customize & Run modal */}
      <PromptPreviewModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        prId={id}
        onRun={(prompt) => {
          createRun.mutate(
            { prId: id, isSelfReview: selfReview, prompt },
            {
              onSuccess: (data) => {
                setShowCustomize(false);
                void router.navigate({ to: `/run/${data.id}` as '/' });
              },
            },
          );
        }}
        isRunning={createRun.isPending}
        linearTicketId={pr?.linear_ticket_id}
        notionUrl={pr?.notion_url}
      />
    </div>
  );
}

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

function PrStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: 'bg-green-500/20 text-green-400',
    closed: 'bg-gray-500/20 text-gray-400',
    merged: 'bg-purple-500/20 text-purple-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-500/20 text-gray-400'}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export const Route = createFileRoute('/_authed/pr/$id')({
  component: PrDetailPage,
});
