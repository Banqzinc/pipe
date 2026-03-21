import { useEffect, useRef } from 'react';

interface FindingEditorProps {
  body: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function FindingEditor({
  body,
  onChange,
  onSave,
  onCancel,
}: FindingEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          }
        }}
        rows={6}
        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-y"
        placeholder="Edit finding body (markdown)..."
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <span className="text-xs text-gray-600 ml-2">
          Cmd+Enter to save, Esc to cancel
        </span>
      </div>
    </div>
  );
}
