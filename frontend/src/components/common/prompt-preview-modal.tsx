import { useState, useEffect } from 'react';
import { Modal } from './modal.tsx';
import { usePreviewPrompt } from '../../api/mutations/preview-prompt.ts';
import { useUpdatePr } from '../../api/mutations/prs.ts';

interface PromptPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  prId: string;
  onRun: (prompt: string) => void;
  isRunning: boolean;
  linearTicketId?: string | null;
  notionUrl?: string | null;
}

export function PromptPreviewModal({
  isOpen,
  onClose,
  prId,
  onRun,
  isRunning,
  linearTicketId,
  notionUrl,
}: PromptPreviewModalProps) {
  const previewPrompt = usePreviewPrompt();
  const updatePr = useUpdatePr();
  const [editedPrompt, setEditedPrompt] = useState('');
  const [linearId, setLinearId] = useState(linearTicketId ?? '');
  const [notionLink, setNotionLink] = useState(notionUrl ?? '');

  useEffect(() => {
    setLinearId(linearTicketId ?? '');
    setNotionLink(notionUrl ?? '');
  }, [linearTicketId, notionUrl]);

  useEffect(() => {
    if (isOpen && prId) {
      previewPrompt.mutate(prId, {
        onSuccess: (data) => {
          setEditedPrompt(data.prompt);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prId]);

  const summary = previewPrompt.data?.context_summary;

  function handleRun() {
    const linearChanged = linearId !== (linearTicketId ?? '');
    const notionChanged = notionLink !== (notionUrl ?? '');
    const contextChanged = linearChanged || notionChanged;

    if (contextChanged) {
      updatePr.mutate(
        {
          prId,
          linear_ticket_id: linearId || null,
          notion_url: notionLink || null,
        },
        {
          onSuccess: () => {
            onRun(editedPrompt);
          },
        },
      );
    } else {
      onRun(editedPrompt);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize & Run Review">
      <div className="px-6 py-4 space-y-4">
        {/* Linear + Notion inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Linear Context</label>
            <input
              type="text"
              value={linearId}
              onChange={(e) => setLinearId(e.target.value)}
              placeholder="e.g. CORE-558 or PR-PIPE"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notion Proposal URL</label>
            <input
              type="text"
              value={notionLink}
              onChange={(e) => setNotionLink(e.target.value)}
              placeholder="https://notion.so/..."
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Context summary */}
        {summary && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {summary.has_linear_ticket && <span>Linear ticket linked</span>}
            {summary.has_notion_url && <span>Notion proposal linked</span>}
            {summary.stack_position != null && summary.stack_size != null && (
              <span>Stack {summary.stack_position}/{summary.stack_size}</span>
            )}
            <span>Toolkit reads diff & rules from repo</span>
          </div>
        )}

        {/* Loading state */}
        {previewPrompt.isPending && (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 text-sm">Building prompt...</div>
          </div>
        )}

        {/* Error state */}
        {previewPrompt.error && (
          <div className="rounded-lg border border-red-800 bg-red-500/10 p-3 text-red-400 text-sm">
            {previewPrompt.error instanceof Error
              ? previewPrompt.error.message
              : 'Failed to build prompt.'}
          </div>
        )}

        {/* Prompt editor */}
        {!previewPrompt.isPending && !previewPrompt.error && (
          <>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full h-96 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-y"
            />
            <p className="text-xs text-gray-600">
              Edits apply to this run only. To change the default template, go to Workflow.
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || previewPrompt.isPending || !editedPrompt || updatePr.isPending}
          className="px-4 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
        >
          {isRunning || updatePr.isPending ? 'Starting...' : 'Run Review'}
        </button>
      </div>
    </Modal>
  );
}
