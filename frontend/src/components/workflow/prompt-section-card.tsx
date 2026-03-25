import { useState } from 'react';
import type { PromptSection } from '../../api/queries/workflow.ts';

interface PromptSectionCardProps {
  section: PromptSection;
  onChange: (key: string, updates: { enabled?: boolean; content?: string }) => void;
}

export function PromptSectionCard({ section, onChange }: PromptSectionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-lg transition-colors ${
      section.enabled
        ? 'border-border bg-card'
        : 'border-border/50 bg-card/50 opacity-60'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => onChange(section.key, { enabled: !section.enabled })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
            section.enabled ? 'bg-primary' : 'bg-secondary'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${
              section.enabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'
            }`}
          />
        </button>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">{section.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{section.description}</div>
        </div>

        {/* System badge */}
        {section.system && (
          <span className="text-xs text-muted-foreground italic whitespace-nowrap">
            auto-generated
          </span>
        )}

        {/* Expand toggle for editable sections */}
        {section.editable && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Content editor */}
      {section.editable && expanded && (
        <div className="px-4 pb-4">
          <textarea
            value={section.content}
            onChange={(e) => onChange(section.key, { content: e.target.value })}
            rows={8}
            className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground font-mono focus:outline-none focus:border-primary resize-y"
          />
        </div>
      )}
    </div>
  );
}
