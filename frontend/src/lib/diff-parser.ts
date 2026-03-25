export interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk-header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      currentHunk = {
        header: raw,
        lines: [
          {
            type: 'hunk-header',
            content: raw,
            oldLineNumber: null,
            newLineNumber: null,
          },
        ],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (raw.startsWith('+')) {
      currentHunk.lines.push({
        type: 'added',
        content: raw.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine++,
      });
    } else if (raw.startsWith('-')) {
      currentHunk.lines.push({
        type: 'removed',
        content: raw.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: null,
      });
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — skip
    } else {
      // Context line (starts with space or is empty for trailing)
      currentHunk.lines.push({
        type: 'context',
        content: raw.startsWith(' ') ? raw.slice(1) : raw,
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  return hunks;
}
