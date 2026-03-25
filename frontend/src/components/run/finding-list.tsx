import { useState, useEffect, useRef } from 'react';
import type { FindingItem } from '../../api/queries/findings.ts';
import type { CommentThread } from '../../api/queries/comments.ts';
import type { StackPr } from '../../api/queries/runs.ts';
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
  stackPrs?: StackPr[];
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

function groupByPr(
  findings: FindingItem[],
  stackPrs: StackPr[],
): Map<string, { pr: StackPr; findings: FindingItem[] }> {
  const groups = new Map<string, { pr: StackPr; findings: FindingItem[] }>();

  // Initialize groups for all PRs in stack order
  for (const pr of stackPrs) {
    groups.set(pr.id, { pr, findings: [] });
  }

  // Add an "unattributed" group
  const unattributed: FindingItem[] = [];

  for (const f of findings) {
    if (f.pr_id && groups.has(f.pr_id)) {
      groups.get(f.pr_id)!.findings.push(f);
    } else {
      unattributed.push(f);
    }
  }

  // Remove empty groups
  for (const [key, value] of groups) {
    if (value.findings.length === 0) {
      groups.delete(key);
    }
  }

  // Add unattributed as a special group if any
  if (unattributed.length > 0) {
    groups.set('_unattributed', {
      pr: { id: '_unattributed', github_pr_number: 0, title: 'Unattributed', author: '', stack_position: null, stack_size: null },
      findings: unattributed,
    });
  }

  return groups;
}

function FileGroupedFindings({
  findings,
  globalIndexStart,
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
  cardRefs,
}: {
  findings: FindingItem[];
  globalIndexStart: number;
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
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
}) {
  const sorted = [...findings].sort(
    (a, b) => a.toolkit_order - b.toolkit_order,
  );
  const grouped = groupByFile(sorted);
  let localIndex = 0;

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([filePath, fileFindings]) => (
        <div key={filePath}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-gray-500 truncate">
              {filePath}
            </span>
            <span className="text-xs text-gray-600">
              ({fileFindings.length})
            </span>
          </div>
          <div className="space-y-3">
            {fileFindings.map((finding) => {
              const idx = globalIndexStart + localIndex++;
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
  stackPrs,
}: FindingListProps) {
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [collapsedPrs, setCollapsedPrs] = useState<Set<string>>(new Set());

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

  // Stack review: group by PR first, then by file
  if (stackPrs && stackPrs.length > 0) {
    const prGroups = groupByPr(findings, stackPrs);
    let globalIndex = 0;

    return (
      <div className="space-y-8">
        {[...prGroups.entries()].map(([prId, { pr, findings: prFindings }]) => {
          const startIndex = globalIndex;
          const isCollapsed = collapsedPrs.has(prId);

          // Count the findings so we can advance the index even when collapsed
          if (isCollapsed) {
            globalIndex += prFindings.length;
          }

          return (
            <div key={prId}>
              <button
                type="button"
                onClick={() => {
                  setCollapsedPrs((prev) => {
                    const next = new Set(prev);
                    if (next.has(prId)) {
                      next.delete(prId);
                    } else {
                      next.add(prId);
                    }
                    return next;
                  });
                }}
                className="flex items-center gap-2 mb-3 text-left w-full group"
              >
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {pr.github_pr_number > 0 ? (
                  <>
                    <span className="text-sm font-medium text-gray-300">
                      #{pr.github_pr_number}
                    </span>
                    <span className="text-sm text-gray-400 truncate">
                      {pr.title}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">{pr.title}</span>
                )}
                <span className="text-xs text-gray-600">
                  ({prFindings.length} {prFindings.length === 1 ? 'finding' : 'findings'})
                </span>
              </button>

              {!isCollapsed && (
                <div className="pl-4 border-l-2 border-purple-500/20">
                  <FileGroupedFindings
                    findings={prFindings}
                    globalIndexStart={startIndex}
                    focusedIndex={focusedIndex}
                    onAccept={onAccept}
                    onReject={onReject}
                    onStartEdit={onStartEdit}
                    editingId={editingId}
                    editBody={editBody}
                    onEditBodyChange={onEditBodyChange}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    commentThreads={commentThreads}
                    cardRefs={cardRefs}
                  />
                  {/* Hidden: advance the global index */}
                  {(() => {
                    globalIndex += prFindings.length;
                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default: group by file only
  const sorted = [...findings].sort(
    (a, b) => a.toolkit_order - b.toolkit_order,
  );

  return (
    <FileGroupedFindings
      findings={sorted}
      globalIndexStart={0}
      focusedIndex={focusedIndex}
      onAccept={onAccept}
      onReject={onReject}
      onStartEdit={onStartEdit}
      editingId={editingId}
      editBody={editBody}
      onEditBodyChange={onEditBodyChange}
      onEditSave={onEditSave}
      onEditCancel={onEditCancel}
      commentThreads={commentThreads}
      cardRefs={cardRefs}
    />
  );
}
