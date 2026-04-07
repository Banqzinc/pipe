import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useRepos, useAvailableRepos } from '../../api/queries/repos.ts';
import {
  useCreateRepo,
  useUpdateRepo,
  useDeleteRepo,
  useSyncRepo,
} from '../../api/mutations/repos.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';

function AddRepoDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: available, isLoading, error } = useAvailableRepos(open);
  const createRepo = useCreateRepo();

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const repos = (available ?? []).filter(
      (r) => selected.has(`${r.github_owner}/${r.github_name}`),
    );

    let completed = 0;
    for (const repo of repos) {
      createRepo.mutate(
        { github_owner: repo.github_owner, github_name: repo.github_name },
        {
          onSuccess: () => {
            completed++;
            if (completed === repos.length) {
              setOpen(false);
              setSelected(new Set());
            }
          },
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" />}>
        Add Repository
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Repositories</DialogTitle>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto space-y-1 py-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground px-1">Loading repositories from GitHub...</p>
          )}

          {error && (
            <p className="text-sm text-destructive px-1">
              Failed to load repositories. Is GH_TOKEN configured?
            </p>
          )}

          {available && available.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">
              All accessible repositories are already connected.
            </p>
          )}

          {available && available.length > 0 && (
            <>
              {available.map((repo) => {
                const key = `${repo.github_owner}/${repo.github_name}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                      className="rounded border-border bg-muted text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-mono text-foreground">{key}</span>
                    {repo.is_private && (
                      <span className="text-xs text-muted-foreground">[private]</span>
                    )}
                  </label>
                );
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || createRepo.isPending}
            size="sm"
          >
            {createRepo.isPending
              ? 'Adding...'
              : `Add ${selected.size > 0 ? `(${selected.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Connected Repos
          </h2>
          {!isLoading && <AddRepoDialog />}
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading repositories...</div>
        )}

        {!isLoading && repos && repos.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No repositories connected yet. Click "Add Repository" to get started.
            </p>
          </div>
        )}

        {repos && repos.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border">
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
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});
