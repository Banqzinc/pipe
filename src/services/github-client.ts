import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

// --- GitHub API response interfaces (only fields we need) ---

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  updated_at: string;
  user: { login: string };
  head: { sha: string; ref: string };
  base: { ref: string };
  body: string | null;
  merged: boolean;
}

export interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

export interface ReviewBody {
  event: 'COMMENT';
  body: string;
  comments: ReviewComment[];
}

export interface GitHubReview {
  id: number;
  html_url: string;
}

// --- Client ---

const BASE_URL = 'https://api.github.com';

export class GitHubClient {
  constructor(private pat: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pat}`,
      'User-Agent': 'pipe/0.1',
      Accept: 'application/vnd.github+json',
      ...(options?.headers as Record<string, string> | undefined),
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    // Log rate-limit warnings
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const reset = res.headers.get('X-RateLimit-Reset');
    if (remaining !== null && Number(remaining) < 100) {
      logger.warn(
        { rateLimitRemaining: Number(remaining), rateLimitReset: reset },
        'GitHub API rate limit running low',
      );
    }

    if (!res.ok) {
      let errorMessage: string;
      let errorBody: unknown;
      try {
        errorBody = await res.json();
        const msg = (errorBody as { message?: string }).message ?? res.statusText;
        const errors = (errorBody as { errors?: { message?: string }[] }).errors;
        const details = errors?.map((e) => e.message).filter(Boolean).join('; ');
        errorMessage = details ? `${msg} — ${details}` : msg;
      } catch {
        errorMessage = res.statusText;
      }
      logger.error({ url, status: res.status, errorBody }, 'GitHub API request failed');
      throw new AppError(`GitHub API error: ${errorMessage}`, res.status, 'GITHUB_API_ERROR');
    }

    // For diff requests the body is plain text
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/plain') || contentType.includes('application/vnd.github.v3.diff')) {
      return (await res.text()) as unknown as T;
    }

    return (await res.json()) as T;
  }

  async listOpenPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    return this.request<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
    );
  }

  async getPR(owner: string, repo: string, number: number): Promise<GitHubPR> {
    return this.request<GitHubPR>(
      `/repos/${owner}/${repo}/pulls/${number}`,
    );
  }

  async getPRDiff(owner: string, repo: string, number: number): Promise<string> {
    return this.request<string>(
      `/repos/${owner}/${repo}/pulls/${number}`,
      {
        headers: { Accept: 'application/vnd.github.v3.diff' },
      },
    );
  }

  async getPRFiles(owner: string, repo: string, number: number): Promise<GitHubFile[]> {
    return this.request<GitHubFile[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
    );
  }

  async createReview(
    owner: string,
    repo: string,
    number: number,
    body: ReviewBody,
  ): Promise<GitHubReview> {
    return this.request<GitHubReview>(
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }
}
