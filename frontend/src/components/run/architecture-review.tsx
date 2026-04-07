import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import type { ArchitectureReview } from '../../api/queries/runs.ts';

const assessmentColors: Record<string, string> = {
  good: 'bg-green-500/20 text-green-400 border-green-500/30',
  mixed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  problematic: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const severityColors: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
};

function CollapsibleSection({
  title,
  colorCls,
  defaultOpen,
  children,
}: {
  title: string;
  colorCls: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium ${colorCls} hover:bg-gray-800/50 transition-colors`}
      >
        <span>{title}</span>
        <span className="text-gray-500">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-3 py-2 space-y-1">{children}</div>}
    </div>
  );
}

function MermaidDiagram({ source, id }: { source: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' });
      mermaid
        .render(`mermaid-${id}`, source)
        .then(({ svg }) => {
          if (!cancelled && containerRef.current) {
            const sanitized = DOMPurify.sanitize(svg, {
              USE_PROFILES: { svg: true, svgFilters: true },
            });
            containerRef.current.textContent = '';
            const wrapper = document.createElement('div');
            wrapper.innerHTML = sanitized;
            containerRef.current.appendChild(wrapper);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-400">Failed to render diagram</p>
        <pre className="text-xs text-gray-400 bg-gray-900 rounded p-3 overflow-x-auto">
          {source}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className="overflow-x-auto" />;
}

interface ArchitectureReviewPanelProps {
  review: ArchitectureReview;
  runId: string;
}

export function ArchitectureReviewPanel({ review, runId }: ArchitectureReviewPanelProps) {
  const hasHighConcerns = review.concerns.some((c) => c.severity === 'high');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-300">Architecture Review</h3>

      {/* Summary */}
      <p className="text-sm text-gray-400">{review.summary}</p>

      {/* Patterns */}
      {review.patterns.length > 0 && (
        <CollapsibleSection
          title={`Patterns (${review.patterns.length})`}
          colorCls="text-gray-300"
          defaultOpen
        >
          <div className="space-y-2">
            {review.patterns.map((pattern, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className={`inline-flex items-center shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${assessmentColors[pattern.assessment] ?? assessmentColors.mixed}`}
                >
                  {pattern.assessment}
                </span>
                <div className="min-w-0">
                  <span className="text-sm text-gray-200 font-medium">{pattern.name}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{pattern.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Concerns */}
      {review.concerns.length > 0 && (
        <CollapsibleSection
          title={`Concerns (${review.concerns.length})`}
          colorCls={hasHighConcerns ? 'text-red-400' : 'text-yellow-400'}
          defaultOpen={hasHighConcerns}
        >
          <div className="space-y-3">
            {review.concerns.map((concern, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium uppercase ${severityColors[concern.severity] ?? severityColors.low}`}
                  >
                    {concern.severity}
                  </span>
                  <span className="text-sm text-gray-200">{concern.title}</span>
                </div>
                <p className="text-xs text-gray-400">{concern.description}</p>
                {concern.affected_files.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {concern.affected_files.map((file) => (
                      <span
                        key={file}
                        className="text-xs font-mono text-gray-500 bg-gray-800 rounded px-1.5 py-0.5"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Module Diagram */}
      {review.module_diagram && (
        <CollapsibleSection title="Module Dependencies" colorCls="text-purple-400" defaultOpen>
          <MermaidDiagram source={review.module_diagram} id={runId} />
        </CollapsibleSection>
      )}
    </div>
  );
}
