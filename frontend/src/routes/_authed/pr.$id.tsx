import { useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { usePullRequest } from '../../api/queries/prs.ts';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { useCreateRun } from '../../api/mutations/runs.ts';
import { api } from '../../api/client.ts';
import { useQuery } from '@tanstack/react-query';

function PrDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [selfReview, setSelfReview] = useState(false);

  const { data: pr, isLoading, error } = usePullRequest(id);
  const { data: stackPrs } = useQuery({
    queryKey: ['prs', id, 'stack'],
    queryFn: () => api.get<PullRequestListItem[]>(`/prs/${id}/stack`),
    enabled: !!pr?.stack_id,
  });

  const createRun = useCreateRun();

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
      </div>

      {/* Header */}
      <div className="px-6 py-6 border-b border-gray-800">
        <h1 className="text-xl font-semibold text-gray-100">
          #{pr.github_pr_number}{' '}
          <span className="text-gray-200">{pr.title}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          by <span className="text-gray-400">{pr.author}</span>
        </p>

        {/* Metadata row */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
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
        </div>
      </div>

      {/* Stack context */}
      {pr.stack_id && pr.stack_position != null && pr.stack_size != null && (
        <div className="px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
              Stack {pr.stack_position}/{pr.stack_size}
            </span>
            <span className="text-xs text-gray-500">Other PRs in this stack:</span>
            <div className="flex flex-wrap gap-2">
              {stackPrs
                ?.filter((s) => s.id !== pr.id)
                .map((sibling) => (
                  <Link
                    key={sibling.id}
                    to={`/pr/${sibling.id}` as '/'}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 transition-colors"
                  >
                    <span className="text-purple-400">
                      {sibling.stack_position}/{sibling.stack_size}
                    </span>
                    #{sibling.github_pr_number} {sibling.title}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Run Review */}
      <div className="px-6 py-6 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleRunReview}
            disabled={createRun.isPending}
            className="px-4 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {createRun.isPending ? 'Starting...' : 'Run Review'}
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={selfReview}
              onChange={(e) => setSelfReview(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Self-review mode
          </label>
        </div>
        {createRun.error && (
          <p className="mt-2 text-sm text-red-400">
            {createRun.error instanceof Error
              ? createRun.error.message
              : 'Failed to start run.'}
          </p>
        )}
      </div>

      {/* Run history */}
      <div className="px-6 py-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Run History</h2>

        {sortedRuns.length === 0 ? (
          <p className="text-sm text-gray-600">No runs yet.</p>
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
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
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDateTime(run.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {run.completed_at ? formatDateTime(run.completed_at) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const Route = createFileRoute('/_authed/pr/$id')({
  component: PrDetailPage,
});
