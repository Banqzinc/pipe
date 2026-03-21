import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface PullRequestDetail {
  id: string;
  repo: { id: string; github_owner: string; github_name: string };
  github_pr_number: number;
  title: string;
  author: string;
  branch_name: string;
  base_branch: string;
  status: string;
  head_sha: string;
  linear_ticket_id: string | null;
  notion_url: string | null;
  stack_id: string | null;
  stack_position: number | null;
  stack_size: number | null;
  runs: Array<{
    id: string;
    status: string;
    is_self_review: boolean;
    head_sha: string;
    findings_count: number;
    created_at: string;
    completed_at: string | null;
  }>;
  created_at: string;
}

export interface PullRequestListItem {
  id: string;
  repo: { id: string; github_owner: string; github_name: string };
  github_pr_number: number;
  title: string;
  author: string;
  branch_name: string;
  base_branch: string;
  status: string;
  head_sha: string;
  linear_ticket_id: string | null;
  stack_id: string | null;
  stack_position: number | null;
  stack_size: number | null;
  latest_run: {
    id: string;
    status: string;
    is_self_review: boolean;
    risk_signals: { overall_risk: string; signals: unknown[] } | null;
    findings_count: {
      total: number;
      pending: number;
      accepted: number;
      rejected: number;
      posted: number;
    };
    has_post: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface PrFilters {
  status?: string;
  repo_id?: string;
  filter?: string;
}

export function usePullRequest(id: string) {
  return useQuery({
    queryKey: ['prs', id],
    queryFn: () => api.get<PullRequestDetail>(`/prs/${id}`),
    enabled: !!id,
  });
}

export function usePullRequests(filters?: PrFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.repo_id) params.set('repo_id', filters.repo_id);
  if (filters?.filter) params.set('filter', filters.filter);
  const qs = params.toString();

  return useQuery({
    queryKey: ['prs', filters],
    queryFn: () =>
      api.get<{ pull_requests: PullRequestListItem[] }>(
        `/prs${qs ? `?${qs}` : ''}`,
      ),
    refetchOnWindowFocus: true,
  });
}
