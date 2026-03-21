const colors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  suggestion: 'bg-blue-500/20 text-blue-400',
  nitpick: 'bg-gray-500/20 text-gray-400',
};

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = colors[severity] ?? colors.nitpick;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {severity}
    </span>
  );
}
