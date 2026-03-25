import type { FindingItem } from '../api/queries/findings.ts';
import type { CommentThread } from '../api/queries/comments.ts';

export interface Annotation {
  kind: 'finding' | 'comment';
  finding?: FindingItem;
  thread?: CommentThread;
}

/** Map<filePath, Map<lineNumber, Annotation[]>> */
export type AnnotationMap = Map<string, Map<number, Annotation[]>>;

export function buildAnnotationMap(
  findings: FindingItem[],
  threads: CommentThread[] | undefined,
): AnnotationMap {
  const map: AnnotationMap = new Map();

  function getOrCreate(filePath: string, line: number): Annotation[] {
    let fileMap = map.get(filePath);
    if (!fileMap) {
      fileMap = new Map();
      map.set(filePath, fileMap);
    }
    let arr = fileMap.get(line);
    if (!arr) {
      arr = [];
      fileMap.set(line, arr);
    }
    return arr;
  }

  for (const f of findings) {
    getOrCreate(f.file_path, f.start_line).push({ kind: 'finding', finding: f });
  }

  if (threads) {
    for (const t of threads) {
      if (t.path && t.line != null) {
        getOrCreate(t.path, t.line).push({ kind: 'comment', thread: t });
      }
    }
  }

  return map;
}
