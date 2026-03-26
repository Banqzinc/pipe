import { useState } from 'react';
import type { DiffFile } from '../../api/queries/diff.ts';
import type { Annotation } from '../../lib/diff-annotations.ts';
import { parsePatch } from '../../lib/diff-parser.ts';
import { DiffLine } from './diff-line.tsx';
import { InlineAnnotation } from './inline-annotation.tsx';

const statusLabels: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  renamed: 'Renamed',
  copied: 'Copied',
};

interface DiffFileSectionProps {
  file: DiffFile;
  annotations: Map<number, Annotation[]> | undefined;
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
  onDiscuss?: (prefill: string) => void;
}

export function DiffFileSection({
  file,
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
  onDiscuss,
}: DiffFileSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hunks = file.patch ? parsePatch(file.patch) : null;

  return (
    <div className="rounded-lg border border-border">
      {/* Sticky file header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="sticky top-0 z-10 w-full flex items-center gap-3 px-4 py-2 bg-card rounded-t-lg border-b border-border text-left hover:bg-muted/50 transition-colors"
      >
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-mono text-foreground truncate flex-1">
          {file.filename}
        </span>
        <span className="text-xs text-muted-foreground">
          {statusLabels[file.status] ?? file.status}
        </span>
        {file.additions > 0 && (
          <span className="text-xs text-green-400">+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className="text-xs text-red-400">-{file.deletions}</span>
        )}
      </button>

      {!collapsed && (
        <div>
          {hunks === null ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Diff too large to display
            </div>
          ) : (
            hunks.map((hunk, hi) => (
              <div key={hi}>
                {hunk.lines.map((line, li) => {
                  // Determine which line number to use for annotation lookup
                  const annotationLine = line.newLineNumber ?? line.oldLineNumber;
                  const lineAnnotations =
                    annotationLine != null && line.type !== 'hunk-header'
                      ? annotations?.get(annotationLine)
                      : undefined;
                  const hasAnnotations = lineAnnotations && lineAnnotations.length > 0;

                  return (
                    <div key={`${hi}-${li}`} className="relative">
                      <DiffLine line={line} highlighted={!!hasAnnotations} />
                      {hasAnnotations && (
                        <div className="absolute top-0 left-full w-[340px] z-20 ml-3 overflow-x-hidden [&:has([data-expanded])]:z-30 hover:z-40">
                          <InlineAnnotation
                            annotations={lineAnnotations}
                            onAccept={onAccept}
                            onReject={onReject}
                            onStartEdit={onStartEdit}
                            editingId={editingId}
                            editBody={editBody}
                            onEditBodyChange={onEditBodyChange}
                            onEditSave={onEditSave}
                            onEditCancel={onEditCancel}
                            onReplyToComment={onReplyToComment}
                            onResolveThread={onResolveThread}
                            onDiscuss={onDiscuss}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
