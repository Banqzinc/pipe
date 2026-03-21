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
}: PostBarProps) {
  const acceptedCount = counts.accepted + counts.edited;
  const actionDisabled = isStale || hasPost || isPosting;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-800 backdrop-blur-sm z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        {/* Left: counts */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-400 tabular-nums">
            {acceptedCount} accepted
          </span>
          <span className="text-gray-400">-</span>
          <span className="text-gray-400 tabular-nums">
            {counts.rejected} rejected
          </span>
          <span className="text-gray-400">-</span>
          <span className="text-gray-300 tabular-nums">
            {counts.pending} pending
          </span>
          {counts.posted > 0 && (
            <>
              <span className="text-gray-400">-</span>
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
              <button
                type="button"
                onClick={onRejectNitpicks}
                disabled={actionDisabled}
                className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reject Nitpicks
              </button>
              <button
                type="button"
                onClick={isSelfReview ? onExport : onPost}
                disabled={actionDisabled}
                className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {isPosting
                  ? 'Posting...'
                  : isSelfReview
                    ? 'Export Findings'
                    : 'Post to GitHub'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
