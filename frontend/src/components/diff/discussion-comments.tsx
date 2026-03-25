import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CommentReply } from '../../api/queries/comments.ts';
import { formatRelativeTime } from '../../lib/format-date.ts';

interface DiscussionCommentsProps {
  comments: CommentReply[];
}

export function DiscussionComments({ comments }: DiscussionCommentsProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (comments.length === 0) return null;

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 text-left hover:bg-gray-800/50 transition-colors"
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
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-12.375 0c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9a9.004 9.004 0 01-4.688-1.312l-3.562.89.89-3.562A8.967 8.967 0 013.5 12z" />
        </svg>
        <span className="text-sm text-gray-200">
          Discussion ({comments.length} comment{comments.length !== 1 ? 's' : ''})
        </span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-800/60">
          {comments.map((comment) => (
            <div key={comment.id} className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-400 font-medium">
                  {comment.user[0]?.toUpperCase()}
                </div>
                <span className="font-medium text-gray-400">@{comment.user}</span>
                <span>{formatRelativeTime(comment.created_at)}</span>
                <a
                  href={comment.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto hover:text-gray-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-gray-400 text-xs pl-7">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {comment.body}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
