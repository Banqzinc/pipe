import { createFileRoute } from '@tanstack/react-router';
import { useRepos } from '../../api/queries/repos.ts';
import { useUpdateRepo, useDeleteRepo, useSyncRepo } from '../../api/mutations/repos.ts';

function SettingsPage() {
  const { data: repos, isLoading } = useRepos();
  const updateRepo = useUpdateRepo();
  const deleteRepo = useDeleteRepo();
  const syncRepo = useSyncRepo();

  const handleAutoTriggerToggle = (id: string, current: boolean) => {
    updateRepo.mutate({ id, auto_trigger_on_open: !current });
  };

  const handleDelete = (id: string, label: string) => {
    if (!window.confirm(`Remove ${label}? This will not delete any GitHub data.`)) return;
    deleteRepo.mutate(id);
  };

  const handleSync = (id: string) => {
    syncRepo.mutate(id);
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-8">Settings</h1>

      {/* Connected Repos */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
          Connected Repos
        </h2>

        {isLoading && (
          <div className="text-sm text-gray-500">Loading repositories...</div>
        )}

        {!isLoading && repos && repos.length === 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
            <p className="text-sm text-gray-400 mb-2">No repositories connected yet.</p>
            <p className="text-xs text-gray-500">
              Run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">pipe repo add</code> from
              your terminal to connect a repository.
            </p>
          </div>
        )}

        {repos && repos.length > 0 && (
          <>
            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 mb-4">
              {repos.map((repo) => {
                const label = `${repo.github_owner}/${repo.github_name}`;
                return (
                  <div
                    key={repo.id}
                    className="flex items-center gap-4 px-4 py-3 bg-gray-900 first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="flex-1 text-sm font-mono text-gray-300">
                      {label}
                    </span>

                    {/* Auto-trigger toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={repo.auto_trigger_on_open}
                        onChange={() =>
                          handleAutoTriggerToggle(repo.id, repo.auto_trigger_on_open)
                        }
                        className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                      />
                      Auto-trigger
                    </label>

                    {/* Sync button */}
                    <button
                      type="button"
                      onClick={() => handleSync(repo.id)}
                      disabled={syncRepo.isPending && syncRepo.variables === repo.id}
                      className="px-2.5 py-1 text-xs rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 transition-colors"
                    >
                      {syncRepo.isPending && syncRepo.variables === repo.id
                        ? 'Syncing...'
                        : 'Sync PRs'}
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDelete(repo.id, label)}
                      disabled={deleteRepo.isPending}
                      className="px-2.5 py-1 text-xs rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 border border-red-800/50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500">
              Run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">pipe repo add</code> from
              your terminal to connect more repositories.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});
