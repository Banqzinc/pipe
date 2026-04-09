import type { CliConfig } from './config';

export class PipeClient {
  private host: string;
  private apiKey: string;

  constructor(config: CliConfig) {
    this.host = config.host.replace(/\/+$/, '');
    this.apiKey = config.api_key;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.host}/api${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async health(): Promise<{ status: string }> {
    const url = `${this.host}/api/health`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Health check failed (${res.status})`);
    return (await res.json()) as { status: string };
  }

  // --- Repo management ---

  async listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  async createRepo(data: {
    github_owner: string;
    github_name: string;
    pat: string;
    webhook_secret: string;
  }): Promise<Repo> {
    return this.request<Repo>('POST', '/repos', data);
  }

  async deleteRepo(id: string): Promise<void> {
    return this.request<void>('DELETE', `/repos/${id}`);
  }

  async syncRepo(id: string): Promise<{ synced: number }> {
    return this.request<{ synced: number }>('POST', `/repos/${id}/sync`);
  }

  // --- PR management ---

  async listPRs(filter?: string, repoId?: string): Promise<PRListResponse> {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (repoId) params.set('repo_id', repoId);
    const qs = params.toString();
    return this.request<PRListResponse>('GET', `/prs${qs ? `?${qs}` : ''}`);
  }

  async getPR(prId: string): Promise<PRDetail> {
    return this.request<PRDetail>('GET', `/prs/${prId}`);
  }

  // --- Run management ---

  async getRun(runId: string): Promise<RunDetail> {
    return this.request<RunDetail>('GET', `/runs/${runId}`);
  }

  // --- Findings ---

  async listFindings(runId: string): Promise<FindingsResponse> {
    return this.request<FindingsResponse>('GET', `/runs/${runId}/findings`);
  }

  // --- Comments ---

  async getPRComments(prId: string): Promise<CommentsResponse> {
    return this.request<CommentsResponse>('GET', `/prs/${prId}/comments`);
  }

  // --- Stack ---

  async getStack(prId: string): Promise<StackResponse> {
    return this.request<StackResponse>('GET', `/prs/${prId}/stack`);
  }
}

// --- Types ---

export interface Repo {
  id: string;
  github_owner: string;
  github_name: string;
  auto_trigger_on_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface PRListItem {
  id: string;
  repo: { id: string; github_owner: string; github_name: string };
  github_pr_number: number;
  title: string;
  author: string;
  branch_name: string;
  base_branch: string;
  status: string;
  is_draft: boolean;
  head_sha: string;
  stack_id: string | null;
  stack_position: number | null;
  stack_size: number | null;
  review_completed_at: string | null;
  latest_run: {
    id: string;
    status: string;
    head_sha: string;
    is_self_review: boolean;
    risk_signals: Record<string, unknown> | null;
    findings_count: {
      total: number;
      pending: number;
      accepted: number;
      rejected: number;
      posted: number;
    };
    has_post: boolean;
  } | null;
  comment_counts: { discussions: number; review_comments: number };
  created_at: string;
  updated_at: string;
}

export interface PRListResponse {
  pull_requests: PRListItem[];
}

export interface PRDetail {
  id: string;
  repo: { id: string; github_owner: string; github_name: string };
  github_pr_number: number;
  title: string;
  author: string;
  branch_name: string;
  base_branch: string;
  runs: Array<{
    id: string;
    status: string;
    is_self_review: boolean;
    findings_count: number;
    has_post: boolean;
    created_at: string;
  }>;
}

export interface RunDetail {
  id: string;
  pr: {
    id: string;
    github_pr_number: number;
    title: string;
    author: string;
    repo: { github_owner: string; github_name: string };
    base_branch: string;
  };
  head_sha: string;
  status: string;
  is_self_review: boolean;
  brief: {
    critical_issues: Array<{ summary: string; file: string; line: number }>;
    important_issues: Array<{ summary: string; file: string; line: number }>;
    suggestions: string[];
    strengths: string[];
    recommended_actions: string[];
  } | null;
  architecture_review: {
    summary: string;
    patterns: Array<{ name: string; description: string; assessment: string }>;
    concerns: Array<{
      title: string;
      severity: string;
      description: string;
      affected_files: string[];
    }>;
    module_diagram: string | null;
  } | null;
  risk_signals: {
    overall_risk: string;
    signals: Array<{ name: string; level: string }>;
  } | null;
  error_message: string | null;
  has_post: boolean;
  post: { github_review_id: number | string; posted_at: string } | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Finding {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number | null;
  severity: string;
  confidence: number;
  category: string | null;
  title: string;
  body: string;
  suggested_fix: string | null;
  rule_ref: string | null;
  status: string;
  edited_body: string | null;
  toolkit_order: number;
  pr_id: string | null;
  pr_number: number | null;
}

export interface FindingsResponse {
  findings: Finding[];
  counts: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    edited: number;
    posted: number;
  };
}

export interface StackPR {
  id: string;
  github_pr_number: number;
  title: string;
  author: string;
  branch_name: string;
  base_branch: string;
  status: string;
  head_sha: string;
  stack_id: string | null;
  stack_position: number | null;
  stack_size: number | null;
}

export interface StackResponse {
  stack: StackPR[];
}

export interface CommentThread {
  root_comment_id: number;
  path: string;
  line: number | null;
  root_body: string;
  root_user: string;
  root_created_at: string;
  thread_node_id: string;
  is_resolved: boolean;
  replies: Array<{
    id: number;
    body: string;
    user: string;
    created_at: string;
  }>;
}

export interface IssueComment {
  id: number;
  body: string;
  user: string;
  created_at: string;
}

export interface CommentsResponse {
  threads: CommentThread[];
  issue_comments: IssueComment[];
}
