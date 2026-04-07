import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { ArchitectureReview } from '../../api/queries/runs.ts';
import { CollapsibleSection } from '../common/collapsible-section.tsx';

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

function MermaidDiagram({ source, id }: { source: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#0f172a',
          primaryColor: '#334155',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#475569',
          lineColor: '#64748b',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a',
          nodeTextColor: '#e2e8f0',
          mainBkg: '#334155',
          nodeBorder: '#64748b',
          clusterBkg: '#1e293b',
          clusterBorder: '#475569',
          titleColor: '#e2e8f0',
          edgeLabelBackground: '#1e293b',
        },
        flowchart: {
          htmlLabels: false,
          curve: 'basis',
          rankSpacing: 60,
          nodeSpacing: 40,
        },
      });
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

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto [&_text]:!fill-slate-200 [&_.nodeLabel]:!text-slate-200 [&_.edgeLabel]:!text-slate-300 [&_.label]:!text-slate-200"
    />
  );
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

      {/* Module Diagram — shown first for visual overview */}
      {review.module_diagram && (
        <CollapsibleSection title="Module Dependencies" colorCls="text-purple-400" defaultOpen>
          <MermaidDiagram source={review.module_diagram} id={runId} />
        </CollapsibleSection>
      )}

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
    </div>
  );
}
