import { useState } from 'react';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { PrRow } from './pr-table.tsx';
import { SplitButton } from '../common/split-button.tsx';
import { Badge } from '@/components/ui/badge.tsx';

interface StackGroupProps {
  stackId: string;
  prs: PullRequestListItem[];
  onRunReview: (prId: string) => void;
  onCustomizeRun: (prId: string) => void;
  onToggleCompleted: (prId: string, completed: boolean) => void;
  isRunning: boolean;
  onRunStackReview?: (stackId: string) => void;
  onCustomizeStackRun?: (stackId: string) => void;
  isStackRunning?: boolean;
}

export function StackGroup({
  stackId,
  prs,
  onRunReview,
  onCustomizeRun,
  onToggleCompleted,
  isRunning,
  onRunStackReview,
  onCustomizeStackRun,
  isStackRunning,
}: StackGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const sorted = [...prs].sort(
    (a, b) => (b.stack_position ?? 0) - (a.stack_position ?? 0),
  );
  const rootBranch = sorted[sorted.length - 1]?.branch_name ?? stackId;
  const repoName = sorted[0]?.repo.github_name;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 min-w-0 hover:bg-muted/30 transition-colors text-left"
        >
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
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
            <Badge variant="outline" className="text-xs font-semibold bg-blue-500/15 text-blue-400 border-blue-500/20">
              {repoName}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs font-medium bg-purple-500/20 text-purple-400 border-purple-500/20">
            STACK &middot; {prs.length} PRs
          </Badge>
          <span className="text-sm text-muted-foreground truncate">{rootBranch}</span>
        </button>

        {onRunStackReview && (
          <SplitButton
            label={isStackRunning ? 'Running...' : 'Run Stack Review'}
            onClick={() => onRunStackReview(stackId)}
            disabled={isStackRunning}
            menuItems={[
              ...(onCustomizeStackRun
                ? [{ label: 'Customize & Run Stack...', onClick: () => onCustomizeStackRun(stackId) }]
                : []),
            ]}
          />
        )}
      </div>

      {expanded && (
        <div className="divide-y divide-border/60">
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
