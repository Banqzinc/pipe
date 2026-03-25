import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Annotation } from '../../lib/diff-annotations.ts';
import { SeverityBadge } from '../common/severity-badge.tsx';
import { FindingEditor } from '../run/finding-editor.tsx';

const severityBorderColors: Record<string, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  suggestion: 'border-l-blue-500',
  nitpick: 'border-l-gray-500',
};

const statusBadges: Record<string, { label: string; cls: string }> = {
  accepted: { label: '\u2713 Accepted', cls: 'bg-green-500/20 text-green-400' },
  rejected: { label: '\u2717 Rejected', cls: 'bg-gray-500/20 text-gray-400' },
  edited: { label: '\u270E Edited', cls: 'bg-blue-500/20 text-blue-400' },
  posted: { label: 'Posted', cls: 'bg-green-500/20 text-green-400' },
};

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}

interface InlineAnnotationProps {
  annotations: Annotation[];
  onAccept?: (findingId: string) => void;
  onReject?: (findingId: string) => void;
  onStartEdit?: (findingId: string) => void;
  editingId?: string | null;
  editBody?: string;
  onEditBodyChange?: (value: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onReplyToComment?: (commentId: number, body: string) => void;
  onResolveThread?: (commentId: number, threadNodeId: string, resolved: boolean) => void;
}

export function InlineAnnotation({
  annotations,
  onAccept,
  onReject,
  onStartEdit,
  editingId,
  editBody,
  onEditBodyChange,
  onEditSave,
  onEditCancel,
  onReplyToComment,
  onResolveThread,
}: InlineAnnotationProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(
    () => new Set(annotations.map((_, i) => i)),
  );

  const toggle = (index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="p-1.5 space-y-1">
      {annotations.map((ann, i) => {
        const expanded = expandedSet.has(i);

        if (ann.kind === 'finding' && ann.finding) {
          const f = ann.finding;
          const isEditing = editingId === f.id;
          const isPending = f.status === 'pending' || f.status === 'edited';
          const isRejected = f.status === 'rejected';
          const badge = statusBadges[f.status];
          const borderColor = severityBorderColors[f.severity] ?? 'border-l-gray-500';

          return (
            <div
              key={f.id}
              className={`border-l-4 ${borderColor} bg-gray-900 rounded-r overflow-hidden ${isRejected ? 'opacity-40' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800/50 transition-colors"
              >
                <Chevron expanded={expanded} />
                <SeverityBadge severity={f.severity} />
                <span className="text-xs font-medium text-gray-200 truncate flex-1">
                  {f.title}
                </span>
                {badge && !isPending && (
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium shrink-0 ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                )}
              </button>
              {(expanded || isEditing) && (
                <div className="px-3 pb-3 overflow-x-hidden break-words">
                  {isEditing && editBody != null && onEditBodyChange && onEditSave && onEditCancel ? (
                    <FindingEditor
                      body={editBody}
                      onChange={onEditBodyChange}
                      onSave={onEditSave}
                      onCancel={onEditCancel}
                    />
                  ) : (
                    <>
                      <div className="prose prose-sm prose-invert max-w-none text-gray-300 text-xs [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:break-all">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {f.edited_body ?? f.body}
                        </ReactMarkdown>
                      </div>
                      {isPending && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => onAccept?.(f.id)}
                            className="px-2 py-0.5 text-xs font-medium rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject?.(f.id)}
                            className="px-2 py-0.5 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => onStartEdit?.(f.id)}
                            className="px-2 py-0.5 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (ann.kind === 'comment' && ann.thread) {
          const t = ann.thread;
          return (
            <div
              key={`comment-${t.root_comment_id}-${i}`}
              className="border-l-4 border-l-gray-600 bg-gray-900 rounded-r overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800/50 transition-colors"
              >
                <Chevron expanded={expanded} />
                <span className="text-xs font-medium text-gray-400">@{t.root_user}</span>
                <span className="text-xs text-gray-500 truncate flex-1">
                  {truncate(t.root_body, 60)}
                </span>
              </button>
              {expanded && (
                <div className="px-3 pb-3 overflow-x-hidden break-words">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-400">@{t.root_user}</span>
                    <a
                      href={t.root_html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-gray-300 transition-colors"
                    >
                      comment
                    </a>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none text-gray-400 text-xs [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:break-all">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {t.root_body}
                    </ReactMarkdown>
                  </div>
                  {t.replies.length > 0 && (
                    <div className="mt-2 space-y-1 ml-3 pl-3 border-l-2 border-gray-700">
                      {t.replies.map((r) => (
                        <div key={r.id}>
                          <span className="text-xs text-gray-500">
                            <span className="font-medium text-gray-400">@{r.user}</span>
                          </span>
                          <div className="prose prose-sm prose-invert max-w-none text-gray-400 text-xs [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:break-all">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {r.body}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
