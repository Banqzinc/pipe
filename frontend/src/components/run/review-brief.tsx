import type { Brief, RiskSignals } from '../../api/queries/runs.ts';
import { CollapsibleSection } from '../common/collapsible-section.tsx';

const riskColors: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function RiskBadge({ signal }: { signal: { name: string; level: string } }) {
  const cls = riskColors[signal.level] ?? riskColors.low;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {signal.name}
    </span>
  );
}

interface ReviewBriefProps {
  brief: Brief | null;
  riskSignals: RiskSignals | null;
}

export function ReviewBrief({ brief, riskSignals }: ReviewBriefProps) {
  if (!brief && !riskSignals) return null;

  return (
    <div className="space-y-4">
      {/* Risk signals */}
      {riskSignals && riskSignals.signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {riskSignals.signals.map((signal) => (
            <RiskBadge key={signal.name} signal={signal} />
          ))}
        </div>
      )}

      {/* Brief sections */}
      {brief && (
        <div className="space-y-2">
          {brief.critical_issues.length > 0 && (
            <CollapsibleSection
              title={`Critical Issues (${brief.critical_issues.length})`}
              colorCls="text-red-400"
              defaultOpen
            >
              {brief.critical_issues.map((issue, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-red-400 shrink-0">*</span>
                  <span>
                    {issue.summary}
                    <span className="text-gray-500 ml-2 font-mono text-xs">
                      {issue.file}:{issue.line}
                    </span>
                  </span>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {brief.important_issues.length > 0 && (
            <CollapsibleSection
              title={`Important Issues (${brief.important_issues.length})`}
              colorCls="text-yellow-400"
              defaultOpen
            >
              {brief.important_issues.map((issue, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-yellow-400 shrink-0">*</span>
                  <span>
                    {issue.summary}
                    <span className="text-gray-500 ml-2 font-mono text-xs">
                      {issue.file}:{issue.line}
                    </span>
                  </span>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {brief.suggestions.length > 0 && (
            <CollapsibleSection
              title={`Suggestions (${brief.suggestions.length})`}
              colorCls="text-blue-400"
            >
              {brief.suggestions.map((text, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-blue-400 shrink-0">-</span>
                  <span>{text}</span>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {brief.strengths.length > 0 && (
            <CollapsibleSection
              title={`Strengths (${brief.strengths.length})`}
              colorCls="text-green-400"
            >
              {brief.strengths.map((text, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-green-400 shrink-0">+</span>
                  <span>{text}</span>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {brief.recommended_actions.length > 0 && (
            <CollapsibleSection
              title={`Recommended Actions (${brief.recommended_actions.length})`}
              colorCls="text-purple-400"
            >
              {brief.recommended_actions.map((text, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-purple-400 shrink-0">-</span>
                  <span>{text}</span>
                </div>
              ))}
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}
