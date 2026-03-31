import { useMemo, useState } from 'react';
import type { DiffFile } from '../../api/queries/diff.ts';
import type { FindingItem } from '../../api/queries/findings.ts';
import type { CommentThread, CommentReply } from '../../api/queries/comments.ts';
import { buildAnnotationMap } from '../../lib/diff-annotations.ts';
import { parsePatch } from '../../lib/diff-parser.ts';
import { DiffFileSection } from './diff-file-section.tsx';
import { InlineAnnotation } from './inline-annotation.tsx';
import { DiscussionComments } from './discussion-comments.tsx';

interface DiffViewerProps {
  files: DiffFile[];
  findings: FindingItem[];
  commentThreads: CommentThread[] | undefined;
  issueComments?: CommentReply[];
  onAccept: (findingId: string) => void;
  onReject: (findingId: string) => void;
  onStartEdit: (findingId: string) => void;
  editingId: string | null;
  editBody: string;
  onEditBodyChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onReplyToComment?: (commentId: number, body: string) => void;
  onResolveThread?: (commentId: number, threadNodeId: string, resolved: boolean) => void;
  onDiscuss?: (prefill: string) => void;
}

export function DiffViewer({
  files,
  findings,
  commentThreads,
  issueComments,
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
}: DiffViewerProps) {
  const annotationMap = useMemo(
    () => buildAnnotationMap(findings, commentThreads),
    [findings, commentThreads],
  );

  // Compute findings that can't be placed inline (their line isn't in any diff hunk)
  const nonInlineFindings = useMemo(() => {
    // Build a set of all file+line combos that exist in the diff
    const diffLines = new Set<string>();
    for (const file of files) {
      if (!file.patch) continue;
      const hunks = parsePatch(file.patch);
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          if (line.newLineNumber != null) {
            diffLines.add(`${file.filename}:${line.newLineNumber}`);
          }
        }
      }
    }
    return findings.filter(
      (f) => !diffLines.has(`${f.file_path}:${f.start_line}`),
    );
  }, [findings, files]);

  const [allCollapsed, setAllCollapsed] = useState(false);

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No files changed in this PR.
      </div>
    );
  }

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="space-y-4 mr-[360px]">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
        {totalAdditions > 0 && (
          <span className="text-green-400">+{totalAdditions}</span>
        )}
        {totalDeletions > 0 && (
          <span className="text-red-400">-{totalDeletions}</span>
        )}
        <button
          type="button"
          onClick={() => setAllCollapsed(!allCollapsed)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {/* Discussion comments (non-inline) */}
      {issueComments && issueComments.length > 0 && (
        <DiscussionComments comments={issueComments} />
      )}

      {/* Findings not in diff (lines outside changed hunks) */}
      {nonInlineFindings.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            General findings ({nonInlineFindings.length}) — lines not in diff
          </div>
          <div className="divide-y divide-border">
            {nonInlineFindings.map((f) => (
              <InlineAnnotation
                key={f.id}
                annotations={[{ kind: 'finding', finding: f }]}
                onAccept={onAccept}
                onReject={onReject}
                onStartEdit={onStartEdit}
                editingId={editingId}
                editBody={editBody}
                onEditBodyChange={onEditBodyChange}
                onEditSave={onEditSave}
                onEditCancel={onEditCancel}
                onDiscuss={onDiscuss}
              />
            ))}
          </div>
        </div>
      )}

      {/* File sections */}
      {files.map((file) => (
        <DiffFileSection
          key={file.filename}
          file={file}
          annotations={annotationMap.get(file.filename)}
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
      ))}
    </div>
  );
}
