import type { PullRequestListItem } from '../../api/queries/prs.ts';

type LatestRun = PullRequestListItem['latest_run'];

function getStatusInfo(run: LatestRun): { label: string; cls: string } {
  if (!run) {
    return { label: 'No review', cls: 'bg-gray-500/20 text-gray-400' };
  }

  if (run.is_self_review && run.has_post) {
    return { label: 'Exported \u2713', cls: 'bg-green-500/20 text-green-400' };
  }

  if (run.has_post) {
    return { label: 'Posted \u2713', cls: 'bg-green-500/20 text-green-400' };
  }

  if (run.status === 'queued' || run.status === 'running') {
    return { label: 'In progress', cls: 'bg-blue-500/20 text-blue-400' };
  }

  if (
    (run.status === 'completed' || run.status === 'partial') &&
    run.findings_count.pending > 0
  ) {
    return { label: 'Needs triage', cls: 'bg-yellow-500/20 text-yellow-400' };
  }

  if (
    (run.status === 'completed' || run.status === 'partial') &&
    run.findings_count.total > 0 &&
    run.findings_count.pending === 0
  ) {
    return { label: 'Reviewed', cls: 'bg-green-500/20 text-green-400' };
  }

  if (run.status === 'failed') {
    return { label: 'Failed', cls: 'bg-red-500/20 text-red-400' };
  }

  return { label: run.status, cls: 'bg-gray-500/20 text-gray-400' };
}

export function StatusBadge({ run }: { run: LatestRun }) {
  const { label, cls } = getStatusInfo(run);
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
