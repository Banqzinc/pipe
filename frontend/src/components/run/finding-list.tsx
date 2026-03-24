import { useEffect, useRef } from 'react';
import type { FindingItem } from '../../api/queries/findings.ts';
import type { CommentThread } from '../../api/queries/comments.ts';
import { FindingCard } from './finding-card.tsx';

interface FindingListProps {
  findings: FindingItem[];
  focusedIndex: number;
  onAccept: (findingId: string) => void;
  onReject: (findingId: string) => void;
  onStartEdit: (findingId: string) => void;
  editingId: string | null;
  editBody: string;
  onEditBodyChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  commentThreads?: CommentThread[];
}

function matchReplies(
  finding: FindingItem,
  threads?: CommentThread[],
): CommentThread['replies'] | undefined {
  if (!threads || threads.length === 0) return undefined;
  // Match by file path + line number
  const match = threads.find(
    (t) => t.path === finding.file_path && t.line === finding.start_line,
  );
  if (match && match.replies.length > 0) return match.replies;
  return undefined;
}

function groupByFile(findings: FindingItem[]): Map<string, FindingItem[]> {
  const groups = new Map<string, FindingItem[]>();
  for (const f of findings) {
    const group = groups.get(f.file_path) ?? [];
    group.push(f);
    groups.set(f.file_path, group);
  }
  return groups;
}

export function FindingList({
  findings,
  focusedIndex,
  onAccept,
  onReject,
  onStartEdit,
  editingId,
  editBody,
  onEditBodyChange,
  onEditSave,
  onEditCancel,
  commentThreads,
}: FindingListProps) {
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll focused finding into view
  useEffect(() => {
    const el = cardRefs.current.get(focusedIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedIndex]);

  if (findings.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No findings for this review.
      </div>
    );
  }

  // Sort by toolkit_order (should already be sorted from API)
  const sorted = [...findings].sort(
    (a, b) => a.toolkit_order - b.toolkit_order,
  );
  const grouped = groupByFile(sorted);

  // Build a flat index to map global index -> finding
  let globalIndex = 0;

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([filePath, filefindings]) => (
        <div key={filePath}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-gray-500 truncate">
              {filePath}
            </span>
            <span className="text-xs text-gray-600">
              ({filefindings.length})
            </span>
          </div>
          <div className="space-y-3">
            {filefindings.map((finding) => {
              const idx = globalIndex++;
              return (
                <div
                  key={finding.id}
                  ref={(el) => {
                    if (el) {
                      cardRefs.current.set(idx, el);
                    } else {
                      cardRefs.current.delete(idx);
                    }
                  }}
                >
                  <FindingCard
                    finding={finding}
                    isFocused={idx === focusedIndex}
                    onAccept={() => onAccept(finding.id)}
                    onReject={() => onReject(finding.id)}
                    onEdit={() => onStartEdit(finding.id)}
                    isEditing={editingId === finding.id}
                    editBody={editBody}
                    onEditBodyChange={onEditBodyChange}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    replies={matchReplies(finding, commentThreads)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
