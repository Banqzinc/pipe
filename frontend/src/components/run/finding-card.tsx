import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FindingItem } from '../../api/queries/findings.ts';
import type { CommentReply } from '../../api/queries/comments.ts';
import { SeverityBadge } from '../common/severity-badge.tsx';
import { CodeBlock } from '../common/code-block.tsx';
import { FindingEditor } from './finding-editor.tsx';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const borderColors: Record<string, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  suggestion: 'border-l-blue-500',
  nitpick: 'border-l-gray-500',
};

const statusBadges: Record<string, { label: string; cls: string }> = {
  accepted: {
    label: '\u2713 Accepted',
    cls: 'bg-green-500/20 text-green-400',
  },
  rejected: {
    label: '\u2717 Rejected',
    cls: 'bg-gray-500/20 text-gray-400',
  },
  edited: {
    label: '\u270E Edited',
    cls: 'bg-blue-500/20 text-blue-400',
  },
  posted: {
    label: 'Posted',
    cls: 'bg-green-500/20 text-green-400',
  },
};

interface FindingCardProps {
  finding: FindingItem;
  isFocused: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
  isEditing: boolean;
  editBody: string;
  onEditBodyChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  replies?: CommentReply[];
}

export function FindingCard({
  finding,
  isFocused,
  onAccept,
  onReject,
  onEdit,
  isEditing,
  editBody,
  onEditBodyChange,
  onEditSave,
  onEditCancel,
  replies,
}: FindingCardProps) {
  const [showFix, setShowFix] = useState(false);

  const isPending =
    finding.status === 'pending' || finding.status === 'edited';
  const isAccepted = finding.status === 'accepted';
  const isEdited = finding.status === 'edited';
  const isRejected = finding.status === 'rejected';
  const isPosted = finding.status === 'posted';

  const borderColor = isAccepted
    ? 'border-l-green-500'
    : isRejected
      ? 'border-l-gray-600'
      : (borderColors[finding.severity] ?? 'border-l-gray-500');

  const opacityCls = isRejected
    ? 'opacity-40'
    : isAccepted || isPosted || isEdited
      ? 'opacity-80'
      : '';

  const focusCls = isFocused ? 'ring-1 ring-blue-500' : '';

  const badge = statusBadges[finding.status];

  return (
    <div
      className={`border-l-4 ${borderColor} bg-gray-900 rounded-r-lg p-4 transition-all ${opacityCls} ${focusCls}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <SeverityBadge severity={finding.severity} />
        <span className="text-xs text-gray-400 font-mono">
          {finding.confidence.toFixed(2)}
        </span>
        <span className="text-xs text-gray-500">
          Line {finding.start_line}
          {finding.end_line && finding.end_line !== finding.start_line
            ? `-${finding.end_line}`
            : ''}
        </span>
        {finding.rule_ref && (
          <span className="text-xs text-gray-600 font-mono ml-auto">
            {finding.rule_ref}
          </span>
        )}
        {badge && !isPending && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-200 mb-2">
        {finding.title}
      </h4>

      {/* Body or Editor */}
      {isEditing ? (
        <FindingEditor
          body={editBody}
          onChange={onEditBodyChange}
          onSave={onEditSave}
          onCancel={onEditCancel}
        />
      ) : (
        <div className="prose prose-sm prose-invert max-w-none text-gray-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {finding.edited_body ?? finding.body}
          </ReactMarkdown>
        </div>
      )}

      {/* Suggested fix */}
      {finding.suggested_fix && !isEditing && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowFix(!showFix)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showFix ? 'Hide suggested fix' : 'Show suggested fix'}
          </button>
          {showFix && (
            <div className="mt-2">
              <CodeBlock code={finding.suggested_fix} />
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isPending && !isEditing && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onAccept}
            className="px-3 py-1 text-xs font-medium rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="px-3 py-1 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {/* GitHub replies */}
      {replies && replies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {replies.map((reply) => (
            <div key={reply.id} className="ml-3 pl-3 border-l-2 border-gray-700">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <span className="font-medium text-gray-400">@{reply.user}</span>
                <span>&middot;</span>
                <a
                  href={reply.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors"
                >
                  {formatRelativeTime(reply.created_at)}
                </a>
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-gray-400 text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {reply.body}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
