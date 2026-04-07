import { useState } from 'react';

export function CollapsibleSection({
  title,
  colorCls,
  defaultOpen,
  children,
}: {
  title: string;
  colorCls: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium ${colorCls} hover:bg-gray-800/50 transition-colors`}
      >
        <span>{title}</span>
        <span className="text-gray-500">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-3 py-2 space-y-1">{children}</div>}
    </div>
  );
}
