import { createFileRoute } from '@tanstack/react-router';
import { useRepos } from '../../api/queries/repos.ts';
import { useUpdateRepo, useDeleteRepo, useSyncRepo } from '../../api/mutations/repos.ts';
import { Button } from '@/components/ui/button.tsx';

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
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">
          Connected Repos
        </h2>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading repositories...</div>
        )}

        {!isLoading && repos && repos.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">No repositories connected yet.</p>
            <p className="text-xs text-muted-foreground">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">pipe repo add</code> from
              your terminal to connect a repository.
            </p>
          </div>
        )}

        {repos && repos.length > 0 && (
          <>
            <div className="rounded-lg border border-border divide-y divide-border mb-4">
              {repos.map((repo) => {
                const label = `${repo.github_owner}/${repo.github_name}`;
                return (
                  <div
                    key={repo.id}
                    className="flex items-center gap-4 px-4 py-3 bg-card first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="flex-1 text-sm font-mono text-foreground">
                      {label}
                    </span>

                    {/* Auto-trigger toggle */}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={repo.auto_trigger_on_open}
                        onChange={() =>
                          handleAutoTriggerToggle(repo.id, repo.auto_trigger_on_open)
                        }
                        className="rounded border-border bg-muted text-primary focus:ring-primary"
                      />
                      Auto-trigger
                    </label>

                    {/* Sync button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSync(repo.id)}
                      disabled={syncRepo.isPending && syncRepo.variables === repo.id}
                    >
                      {syncRepo.isPending && syncRepo.variables === repo.id
                        ? 'Syncing...'
                        : 'Sync PRs'}
                    </Button>

                    {/* Delete button */}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(repo.id, label)}
                      disabled={deleteRepo.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">pipe repo add</code> from
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
