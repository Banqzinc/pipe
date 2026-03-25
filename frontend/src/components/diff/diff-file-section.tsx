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
}: DiffFileSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hunks = file.patch ? parsePatch(file.patch) : null;

  return (
    <div className="rounded-lg border border-gray-800">
      {/* Sticky file header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="sticky top-0 z-10 w-full flex items-center gap-3 px-4 py-2 bg-gray-900 rounded-t-lg border-b border-gray-800 text-left hover:bg-gray-800/50 transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-mono text-gray-200 truncate flex-1">
          {file.filename}
        </span>
        <span className="text-xs text-gray-500">
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
            <div className="px-4 py-6 text-center text-sm text-gray-500">
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
                        <div className="absolute top-0 left-full w-[340px] z-20 ml-3 overflow-hidden">
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
