import type { DiffLine as DiffLineType } from '../../lib/diff-parser.ts';

const bgColors: Record<DiffLineType['type'], string> = {
  added: 'bg-green-500/10',
  removed: 'bg-red-500/10',
  context: '',
  'hunk-header': 'bg-blue-500/5',
};

const textColors: Record<DiffLineType['type'], string> = {
  added: 'text-green-300',
  removed: 'text-red-300',
  context: 'text-muted-foreground',
  'hunk-header': 'text-blue-400',
};

interface DiffLineProps {
  line: DiffLineType;
  highlighted?: boolean;
}

export function DiffLine({ line, highlighted }: DiffLineProps) {
  if (line.type === 'hunk-header') {
    return (
      <div className={`${bgColors['hunk-header']} px-4 py-1 text-xs font-mono ${textColors['hunk-header']} select-none`}>
        {line.content}
      </div>
    );
  }

  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

  return (
    <div className={`${highlighted ? 'bg-blue-500/10' : bgColors[line.type]} flex font-mono text-xs leading-5 hover:bg-white/[0.02]`}>
      <span className="w-12 shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.oldLineNumber ?? ''}
      </span>
      <span className="w-12 shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.newLineNumber ?? ''}
      </span>
      <span className="w-5 shrink-0 text-center text-muted-foreground select-none">
        {prefix}
      </span>
      <span className={`flex-1 pr-4 ${textColors[line.type]} whitespace-pre overflow-x-auto`}>
        {line.content}
      </span>
    </div>
  );
}
