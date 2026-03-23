import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface RunDetailPr {
  id: string;
  github_pr_number: number;
  title: string;
  author: string;
  repo: {
    github_owner: string;
    github_name: string;
  };
  stack_id: string | null;
  stack_position: number | null;
  stack_size: number | null;
  head_sha: string;
  linear_ticket_id: string | null;
  notion_url: string | null;
  is_draft: boolean;
}

export interface BriefIssue {
  summary: string;
  file: string;
  line: number;
}

export interface Brief {
  critical_issues: BriefIssue[];
  important_issues: BriefIssue[];
  suggestions: string[];
  strengths: string[];
  recommended_actions: string[];
}

export interface RiskSignal {
  name: string;
  level: 'high' | 'medium' | 'low';
  matched_paths: string[];
}

export interface RiskSignals {
  overall_risk: 'high' | 'medium' | 'low';
  signals: RiskSignal[];
}

export interface RunDetail {
  id: string;
  pr: RunDetailPr;
  head_sha: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  is_self_review: boolean;
  brief: Brief | null;
  risk_signals: RiskSignals | null;
  error_message: string | null;
  prompt: string | null;
  cli_output: string | null;
  toolkit_raw_output: string | null;
  has_post: boolean;
  post: {
    github_review_id: number | string;
    posted_at: string;
  } | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => api.get<RunDetail>(`/runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 10000 : false;
    },
  });
}
