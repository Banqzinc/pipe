import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { usePullRequests } from '../../api/queries/prs.ts';
import { useRepos } from '../../api/queries/repos.ts';
import { useCreateRun } from '../../api/mutations/runs.ts';
import { useSyncAll } from '../../api/mutations/repos.ts';
import { PrTable } from '../../components/inbox/pr-table.tsx';
import { PromptPreviewModal } from '../../components/common/prompt-preview-modal.tsx';

type FilterTab = 'all' | 'needs_review' | 'in_progress' | 'completed';

const tabs: { key: FilterTab; label: string }[] = [
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

function InboxPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('needs_review');
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  const filters = {
    filter: activeTab === 'all' ? undefined : activeTab,
    repo_id: selectedRepo || undefined,
  };

  const { data, isLoading, error } = usePullRequests(filters);
  const { data: repos } = useRepos();
  const createRun = useCreateRun();
  const syncAll = useSyncAll();
  const [customizePrId, setCustomizePrId] = useState<string | null>(null);

  // Fetch all PRs (unfiltered) for tab counts
  const { data: allData } = usePullRequests({
    repo_id: selectedRepo || undefined,
  });
  const { data: needsReviewData } = usePullRequests({
    filter: 'needs_review',
    repo_id: selectedRepo || undefined,
  });
  const { data: inProgressData } = usePullRequests({
    filter: 'in_progress',
    repo_id: selectedRepo || undefined,
  });
  const { data: completedData } = usePullRequests({
    filter: 'completed',
    repo_id: selectedRepo || undefined,
  });

  const counts: Record<FilterTab, number> = {
    all: allData?.pull_requests.length ?? 0,
    needs_review: needsReviewData?.pull_requests.length ?? 0,
    in_progress: inProgressData?.pull_requests.length ?? 0,
    completed: completedData?.pull_requests.length ?? 0,
  };

  const prs = data?.pull_requests ?? [];

  const handleRunReview = (prId: string) => {
    createRun.mutate({ prId });
  };

  const handleCustomizeRun = (prId: string) => {
    setCustomizePrId(prId);
  };

  const handleCustomizeRunSubmit = (prompt: string) => {
    if (!customizePrId) return;
    createRun.mutate(
      { prId: customizePrId, prompt },
      { onSuccess: () => setCustomizePrId(null) },
    );
  };

  // Empty state: no repos configured
  if (repos && repos.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="text-gray-500 text-4xl mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <p className="text-gray-400 text-lg">No repositories configured</p>
          <p className="text-gray-500 mt-1">
            Run{' '}
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">
              pipe repo add
            </code>{' '}
            to connect a repository.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Inbox</h1>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            className="px-3 py-1.5 text-sm font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncAll.isPending ? 'Syncing...' : 'Sync PRs'}
          </button>

          {/* Repo filter */}
          {repos && repos.length > 1 && (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All repos</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.github_owner}/{repo.github_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            <span
              className={`ml-2 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === tab.key
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500 text-sm">Loading pull requests...</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-500/10 p-4 text-red-400 text-sm">
          Failed to load pull requests:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* PR Table */}
      {!isLoading && !error && prs.length > 0 && (
        <PrTable
          prs={prs}
          onRunReview={handleRunReview}
          onCustomizeRun={handleCustomizeRun}
          isRunning={createRun.isPending}
        />
      )}

      {/* Empty state: has repos but no PRs */}
      {!isLoading && !error && prs.length === 0 && repos && repos.length > 0 && (
        <div className="flex flex-col items-center text-center py-12">
          <svg
            className="w-10 h-10 text-gray-600 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5 0V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 0111.048 0c1.131.094 1.976 1.057 1.976 2.192V13.5"
            />
          </svg>
          <p className="text-gray-400">No open PRs</p>
          <p className="text-gray-500 text-sm mt-1">
            Sync a repo or wait for new PRs to appear.
          </p>
        </div>
      )}

      {/* Customize & Run modal */}
      {customizePrId && (() => {
        const customizePr = customizePrId ? prs.find((p) => p.id === customizePrId) : null;
        return (
          <PromptPreviewModal
            isOpen={!!customizePrId}
            onClose={() => setCustomizePrId(null)}
            prId={customizePrId}
            onRun={handleCustomizeRunSubmit}
            isRunning={createRun.isPending}
            linearTicketId={customizePr?.linear_ticket_id}
            notionUrl={customizePr?.notion_url}
          />
        );
      })()}
    </div>
  );
}

export const Route = createFileRoute('/_authed/')({
  component: InboxPage,
});
