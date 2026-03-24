import { useRouter } from '@tanstack/react-router';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { StatusBadge } from '../common/status-badge.tsx';
import { SplitButton } from '../common/split-button.tsx';
import { StackGroup } from './stack-group.tsx';
import { formatRelativeTime, formatShortDate } from '../../lib/format-date.ts';

// --- PR Row ---

interface PrRowProps {
  pr: PullRequestListItem;
  onRunReview: (prId: string) => void;
  onCustomizeRun: (prId: string) => void;
  onToggleCompleted: (prId: string, completed: boolean) => void;
  isRunning: boolean;
  indented?: boolean;
}

export function PrRow({ pr, onRunReview, onCustomizeRun, onToggleCompleted, isRunning, indented }: PrRowProps) {
  const router = useRouter();

  const isHighRisk =
    pr.latest_run?.risk_signals?.overall_risk === 'high';

  const handleClick = () => {
    // Routes /run/:runId and /pr/:prId are defined in later tasks.
    // Use router.navigate with string path to avoid type errors until routes exist.
    if (pr.latest_run) {
      void router.navigate({ to: `/run/${pr.latest_run.id}` as '/' });
    } else {
      void router.navigate({ to: `/pr/${pr.id}` as '/' });
    }
  };

  const repoShort = pr.repo.github_name;

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      role="button"
      tabIndex={0}
      className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-800/50 cursor-pointer transition-colors ${
        indented ? 'pl-10' : ''
      } ${isHighRisk ? 'bg-red-500/5 hover:bg-red-500/10' : ''}`}
    >
      {/* PR number + title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">
            {repoShort}
          </span>
          <span className="text-gray-500 text-sm font-mono">
            #{pr.github_pr_number}
          </span>
          <span className="text-gray-200 text-sm truncate">{pr.title}</span>
          {pr.latest_run?.is_self_review && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-400">
              SELF
            </span>
          )}
          {pr.is_draft && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-500/20 text-gray-400">
              Draft
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-gray-500 text-xs">{pr.author}</span>
          {pr.stack_id && pr.stack_position != null && pr.stack_size != null && (
            <span className="text-gray-600 text-xs">
              {pr.stack_position}/{pr.stack_size}
            </span>
          )}
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-gray-600 text-xs font-mono truncate max-w-48">{pr.branch_name}</span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-gray-600 text-xs">{formatShortDate(pr.created_at)}</span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-gray-600 text-xs">updated {formatRelativeTime(pr.updated_at)}</span>
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge run={pr.latest_run} />

      {/* Findings count */}
      {pr.latest_run && pr.latest_run.findings_count.total > 0 && (
        <span className="text-xs text-gray-500 tabular-nums w-16 text-right">
          {pr.latest_run.findings_count.pending > 0
            ? `${pr.latest_run.findings_count.pending} pending`
            : `${pr.latest_run.findings_count.total} findings`}
        </span>
      )}

      {/* Mark as Completed / Undo */}
      {pr.latest_run && !pr.review_completed_at && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted(pr.id, true);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-400 bg-gray-800 hover:text-green-400 hover:bg-green-500/10 border border-gray-700 hover:border-green-500/30 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </button>
      )}
      {pr.review_completed_at && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted(pr.id, false);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-400 bg-green-500/10 hover:text-gray-400 hover:bg-gray-800 border border-green-500/20 hover:border-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          Undo
        </button>
      )}

      {/* Run / Re-run Review button */}
      {!pr.is_draft && (
        <SplitButton
          label={
            isRunning
              ? 'Running...'
              : pr.latest_run
                ? 'Re-run Review'
                : 'Run Review'
          }
          onClick={() => onRunReview(pr.id)}
          disabled={isRunning}
          menuItems={[
            { label: 'Customize & Run...', onClick: () => onCustomizeRun(pr.id) },
          ]}
        />
      )}
    </div>
  );
}

// --- PR Table ---

interface PrTableProps {
  prs: PullRequestListItem[];
  onRunReview: (prId: string) => void;
  onCustomizeRun: (prId: string) => void;
  onToggleCompleted: (prId: string, completed: boolean) => void;
  isRunning: boolean;
}

export function PrTable({ prs, onRunReview, onCustomizeRun, onToggleCompleted, isRunning }: PrTableProps) {
  // Group by stack_id
  const stacks = new Map<string, PullRequestListItem[]>();
  const standalone: PullRequestListItem[] = [];

  for (const pr of prs) {
    if (pr.stack_id) {
      const group = stacks.get(pr.stack_id) ?? [];
      group.push(pr);
      stacks.set(pr.stack_id, group);
    } else {
      standalone.push(pr);
    }
  }

  // Build render order: keep insertion order for stacks,
  // intersperse standalone PRs by their position in the original array
  // For simplicity, render stacks first, then standalone
  const stackEntries = [...stacks.entries()];

  if (prs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {stackEntries.map(([stackId, stackPrs]) => (
        <StackGroup
          key={stackId}
          stackId={stackId}
          prs={stackPrs}
          onRunReview={onRunReview}
          onCustomizeRun={onCustomizeRun}
          onToggleCompleted={onToggleCompleted}
          isRunning={isRunning}
        />
      ))}

      {standalone.length > 0 && (
        <div className="border border-white/[0.08] rounded-lg overflow-hidden divide-y divide-white/[0.06]">
          {standalone.map((pr) => (
            <PrRow
              key={pr.id}
              pr={pr}
              onRunReview={onRunReview}
              onCustomizeRun={onCustomizeRun}
              onToggleCompleted={onToggleCompleted}
              isRunning={isRunning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
