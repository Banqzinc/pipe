import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useRepos } from '../../api/queries/repos.ts';
import {
  useCreateRepo,
  useUpdateRepo,
  useDeleteRepo,
  useSyncRepo,
} from '../../api/mutations/repos.ts';

function SettingsPage() {
  const { data: repos, isLoading } = useRepos();
  const createRepo = useCreateRepo();
  const updateRepo = useUpdateRepo();
  const deleteRepo = useDeleteRepo();
  const syncRepo = useSyncRepo();

  // Add repo form state
  const [form, setForm] = useState({
    github_owner: '',
    github_name: '',
    pat: '',
    webhook_secret: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhooks/github`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddRepo = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.github_owner || !form.github_name || !form.pat) {
      setFormError('Owner, name, and PAT are required.');
      return;
    }
    createRepo.mutate(form, {
      onSuccess: () => {
        setForm({ github_owner: '', github_name: '', pat: '', webhook_secret: '' });
      },
      onError: (err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to add repo.');
      },
    });
  };

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
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
          Connected Repos
        </h2>

        {isLoading && (
          <div className="text-sm text-gray-500">Loading repositories...</div>
        )}

        {!isLoading && repos && repos.length === 0 && (
          <div className="text-sm text-gray-500 py-4">
            No repositories connected yet.
          </div>
        )}

        {repos && repos.length > 0 && (
          <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 mb-6">
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
        )}

        {/* Add Repo form */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">
            Add Repository
          </h3>
          <form onSubmit={handleAddRepo} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  GitHub Owner
                </label>
                <input
                  type="text"
                  value={form.github_owner}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, github_owner: e.target.value }))
                  }
                  placeholder="e.g. acme-corp"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={form.github_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, github_name: e.target.value }))
                  }
                  placeholder="e.g. my-repo"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Personal Access Token (PAT)
              </label>
              <input
                type="password"
                value={form.pat}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pat: e.target.value }))
                }
                placeholder="ghp_..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Webhook Secret
              </label>
              <input
                type="text"
                value={form.webhook_secret}
                onChange={(e) =>
                  setForm((f) => ({ ...f, webhook_secret: e.target.value }))
                }
                placeholder="Optional secret for webhook verification"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-400">{formError}</p>
            )}

            <button
              type="submit"
              disabled={createRepo.isPending}
              className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
            >
              {createRepo.isPending ? 'Adding...' : 'Add Repository'}
            </button>
          </form>
        </div>
      </section>

      {/* Webhook URL */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
          Webhook URL
        </h2>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            <code className="flex-1 text-sm font-mono text-gray-300 bg-gray-800 px-3 py-2 rounded border border-gray-700 truncate">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Add this URL as a webhook in your GitHub repo settings. Select{' '}
            <span className="text-gray-400">&quot;Pull requests&quot;</span> events.
          </p>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});
