import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PRDiffResponse {
  files: DiffFile[];
}

export function usePRDiff(prId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['pr-diff', prId],
    queryFn: () => api.get<PRDiffResponse>(`/prs/${prId}/diff`),
    enabled: !!prId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}
