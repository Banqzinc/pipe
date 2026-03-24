import { useState } from 'react';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { PrRow } from './pr-table.tsx';

interface StackGroupProps {
  stackId: string;
  prs: PullRequestListItem[];
  onRunReview: (prId: string) => void;
  onCustomizeRun: (prId: string) => void;
  onToggleCompleted: (prId: string, completed: boolean) => void;
  isRunning: boolean;
}

export function StackGroup({
  stackId,
  prs,
  onRunReview,
  onCustomizeRun,
  onToggleCompleted,
  isRunning,
}: StackGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const sorted = [...prs].sort(
    (a, b) => (a.stack_position ?? 0) - (b.stack_position ?? 0),
  );
  const rootBranch = sorted[0]?.branch_name ?? stackId;
  const repoName = sorted[0]?.repo.github_name;

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-gray-900/60 hover:bg-gray-900 transition-colors text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        {repoName && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">
            {repoName}
          </span>
        )}
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
          STACK &middot; {prs.length} PRs
        </span>
        <span className="text-sm text-gray-400 truncate">{rootBranch}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-800/60">
          {sorted.map((pr) => (
            <PrRow
              key={pr.id}
              pr={pr}
              onRunReview={onRunReview}
              onCustomizeRun={onCustomizeRun}
              onToggleCompleted={onToggleCompleted}
              isRunning={isRunning}
              indented
            />
          ))}
        </div>
      )}
    </div>
  );
}
