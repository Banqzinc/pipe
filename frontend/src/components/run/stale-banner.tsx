interface StaleBannerProps {
  onRerun: () => void;
  isRerunning: boolean;
}

export function StaleBanner({ onRerun, isRerunning }: StaleBannerProps) {
  return (
    <div className="rounded-lg border border-orange-600/50 bg-orange-500/10 px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-orange-400">
        PR was updated since this review. Re-run to get fresh findings.
      </p>
      <button
        type="button"
        onClick={onRerun}
        disabled={isRerunning}
        className="px-3 py-1.5 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors shrink-0 ml-4"
      >
        {isRerunning ? 'Starting...' : 'Re-run Review'}
      </button>
    </div>
  );
}
