import { useRouter } from '@tanstack/react-router';
import type { PullRequestListItem } from '../../api/queries/prs.ts';
import { StatusBadge } from '../common/status-badge.tsx';
import { SplitButton } from '../common/split-button.tsx';
import { StackGroup } from './stack-group.tsx';
import { formatRelativeTime, formatShortDate } from '../../lib/format-date.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';

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
      className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${
        indented ? 'pl-10' : ''
      } ${isHighRisk ? 'bg-red-500/5 hover:bg-red-500/10' : ''}`}
    >
      {/* PR number + title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!indented && (
            <Badge variant="outline" className="text-xs font-semibold bg-blue-500/15 text-blue-400 border-blue-500/20">
              {repoShort}
            </Badge>
          )}
          <span className="text-muted-foreground text-sm font-mono">
            #{pr.github_pr_number}
          </span>
          <span className="text-foreground text-sm font-medium truncate">{pr.title}</span>
          {pr.latest_run?.is_self_review && (
            <Badge variant="outline" className="text-xs font-medium bg-orange-500/20 text-orange-400 border-orange-500/20">
              SELF
            </Badge>
          )}
          {pr.is_draft && (
            <Badge variant="secondary" className="text-xs font-medium">
              Draft
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-muted-foreground text-xs">{pr.author}</span>
          {pr.stack_id && pr.stack_position != null && pr.stack_size != null && (
            <span className="text-muted-foreground/60 text-xs">
              {pr.stack_position}/{pr.stack_size}
            </span>
          )}
          <span className="text-muted-foreground/40 text-xs">&middot;</span>
          <span className="text-muted-foreground/60 text-xs font-mono truncate max-w-48">{pr.branch_name}</span>
          <span className="text-muted-foreground/40 text-xs">&middot;</span>
          <span className="text-muted-foreground/60 text-xs">{formatShortDate(pr.created_at)}</span>
          <span className="text-muted-foreground/40 text-xs">&middot;</span>
          <span className="text-muted-foreground/60 text-xs">updated {formatRelativeTime(pr.updated_at)}</span>
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge run={pr.latest_run} />

      {/* Comment count */}
      {(() => {
        const discussions = pr.comment_counts?.discussions ?? 0;
        const reviewComments = pr.comment_counts?.review_comments ?? 0;
        const total = discussions + reviewComments;
        return (
          <span className={`flex items-center gap-1 text-xs tabular-nums ${total > 0 ? 'text-muted-foreground' : 'text-muted-foreground/30'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            {total}
          </span>
        );
      })()}

      {/* Findings count */}
      {pr.latest_run && pr.latest_run.findings_count.total > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
          {pr.latest_run.findings_count.pending > 0
            ? `${pr.latest_run.findings_count.pending} pending`
            : `${pr.latest_run.findings_count.total} findings`}
        </span>
      )}

      {/* Mark as Completed / Undo */}
      {pr.latest_run && !pr.review_completed_at && (
        <Button
          variant="outline"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted(pr.id, true);
          }}
          className="gap-1 text-muted-foreground hover:text-green-400 hover:bg-green-500/10 hover:border-green-500/30"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </Button>
      )}
      {pr.review_completed_at && (
        <Button
          variant="outline"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted(pr.id, false);
          }}
          className="gap-1 text-green-400 bg-green-500/10 border-green-500/20 hover:text-muted-foreground hover:bg-muted hover:border-border"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          Undo
        </Button>
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
  onRunStackReview?: (stackId: string) => void;
  onCustomizeStackRun?: (stackId: string) => void;
  isStackRunning?: boolean;
}

export function PrTable({ prs, onRunReview, onCustomizeRun, onToggleCompleted, isRunning, onRunStackReview, onCustomizeStackRun, isStackRunning }: PrTableProps) {
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
          onRunStackReview={onRunStackReview}
          onCustomizeStackRun={onCustomizeStackRun}
          isStackRunning={isStackRunning}
        />
      ))}

      {standalone.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
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
