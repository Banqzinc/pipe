import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface FindingItem {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number | null;
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick';
  confidence: number;
  category: string | null;
  title: string;
  body: string;
  suggested_fix: string | null;
  rule_ref: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'edited' | 'posted';
  edited_body: string | null;
  toolkit_order: number;
  pr_id: string | null;
  pr_number: number | null;
}

export interface FindingsCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  edited: number;
  posted: number;
}

export interface FindingsResponse {
  findings: FindingItem[];
  counts: FindingsCounts;
}

export function useFindings(runId: string) {
  return useQuery({
    queryKey: ['findings', runId],
    queryFn: () => api.get<FindingsResponse>(`/runs/${runId}/findings`),
    enabled: !!runId,
  });
}
