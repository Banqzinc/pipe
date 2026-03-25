import { Button } from '@/components/ui/button.tsx';
import type { FindingsCounts } from '../../api/queries/findings.ts';

interface PostBarProps {
  counts: FindingsCounts;
  isSelfReview: boolean;
  isStale: boolean;
  hasPost: boolean;
  onPost: () => void;
  onExport: () => void;
  onRejectNitpicks: () => void;
  isPosting: boolean;
  postError: string | null;
  postSuccess: string | null;
  onDismissError: () => void;
  onApprove?: () => void;
  isApproving?: boolean;
  isApproved?: boolean;
}

export function PostBar({
  counts,
  isSelfReview,
  isStale,
  hasPost,
  onPost,
  onExport,
  onRejectNitpicks,
  isPosting,
  postError,
  postSuccess,
  onDismissError,
  onApprove,
  isApproving,
  isApproved,
}: PostBarProps) {
  const acceptedCount = counts.accepted + counts.edited;
  const actionDisabled = isStale || hasPost || isPosting;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 border-t border-border backdrop-blur-sm z-50">
      {/* Error banner */}
      {postError && (
        <div className="bg-destructive/20 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-sm text-destructive">
          <span>{postError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="ml-4 text-destructive hover:text-destructive/80 transition-colors"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
      {/* Success banner */}
      {postSuccess && (
        <div className="bg-green-900/80 border-b border-green-700 px-4 py-2 text-sm text-green-200">
          {postSuccess}
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        {/* Left: counts */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-400 tabular-nums">
            {acceptedCount} accepted
          </span>
          <span className="text-muted-foreground">-</span>
          <span className="text-muted-foreground tabular-nums">
            {counts.rejected} rejected
          </span>
          <span className="text-muted-foreground">-</span>
          <span className="text-foreground tabular-nums">
            {counts.pending} pending
          </span>
          {counts.posted > 0 && (
            <>
              <span className="text-muted-foreground">-</span>
              <span className="text-green-400 tabular-nums">
                {counts.posted} posted
              </span>
            </>
          )}

          {counts.pending > 0 && !hasPost && (
            <span className="text-yellow-400 text-xs ml-2">
              {counts.pending} finding{counts.pending !== 1 ? 's' : ''} still
              undecided
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          {hasPost ? (
            <span className="text-sm text-green-400 font-medium">
              Review posted
            </span>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRejectNitpicks}
                disabled={actionDisabled}
              >
                Reject Nitpicks
              </Button>
              <Button
                size="sm"
                onClick={isSelfReview ? onExport : onPost}
                disabled={actionDisabled}
              >
                {isPosting
                  ? 'Posting...'
                  : isSelfReview
                    ? 'Export Findings'
                    : 'Post to GitHub'}
              </Button>
            </>
          )}
          {onApprove && !isSelfReview && (
            <Button
              size="sm"
              onClick={onApprove}
              disabled={isStale || isApproving || isApproved}
              className={
                isApproved
                  ? 'bg-green-600/20 text-green-400 cursor-default hover:bg-green-600/20'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }
            >
              {isApproving ? 'Approving...' : isApproved ? 'Approved' : 'Approve PR'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
