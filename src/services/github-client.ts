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
  comments: number;
  review_comments: number;
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
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
  body: string;
  comments: ReviewComment[];
}

export interface GitHubReview {
  id: number;
  html_url: string;
}

export interface GitHubReviewComment {
  id: number;
  node_id: string;
  body: string;
  path: string;
  line: number | null;
  user: { login: string };
  created_at: string;
  in_reply_to_id?: number;
  html_url: string;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
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
        'GitHub API rate limit running low'
      );
    }

    if (!res.ok) {
      let errorMessage: string;
      let errorBody: unknown;
      try {
        errorBody = await res.json();
        const msg = (errorBody as { message?: string }).message ?? res.statusText;
        const errors = (errorBody as { errors?: { message?: string }[] }).errors;
        const details = errors
          ?.map(e => e.message)
          .filter(Boolean)
          .join('; ');
        errorMessage = details ? `${msg} — ${details}` : msg;
      } catch {
        errorMessage = res.statusText;
      }
      logger.error({ url, status: res.status, errorBody }, 'GitHub API request failed');
      throw new AppError(`GitHub API error: ${errorMessage}`, res.status, 'GITHUB_API_ERROR');
    }

    // For diff requests the body is plain text
    const contentType = res.headers.get('content-type') ?? '';
    if (
      contentType.includes('text/plain') ||
      contentType.includes('application/vnd.github.v3.diff')
    ) {
      return (await res.text()) as unknown as T;
    }

    return (await res.json()) as T;
  }

  private async graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.pat}`,
        'User-Agent': 'pipe/0.1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (remaining !== null && Number(remaining) < 100) {
      logger.warn(
        { rateLimitRemaining: Number(remaining) },
        'GitHub GraphQL rate limit running low'
      );
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new AppError(
        `GitHub GraphQL error: ${json.errors[0].message}`,
        res.status,
        'GITHUB_GRAPHQL_ERROR'
      );
    }
    return json.data as T;
  }

  async listOpenPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    return this.request<GitHubPR[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);
  }

  async getPR(owner: string, repo: string, number: number): Promise<GitHubPR> {
    return this.request<GitHubPR>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async getPRDiff(owner: string, repo: string, number: number): Promise<string> {
    return this.request<string>(`/repos/${owner}/${repo}/pulls/${number}`, {
      headers: { Accept: 'application/vnd.github.v3.diff' },
    });
  }

  async getPRFiles(owner: string, repo: string, number: number): Promise<GitHubFile[]> {
    return this.request<GitHubFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  }

  async getPRReviewComments(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubReviewComment[]> {
    return this.request<GitHubReviewComment[]>(
      `/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`
    );
  }

  async getPRIssueComments(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubIssueComment[]> {
    return this.request<GitHubIssueComment[]>(
      `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`
    );
  }

  async createReview(
    owner: string,
    repo: string,
    number: number,
    body: ReviewBody
  ): Promise<GitHubReview> {
    return this.request<GitHubReview>(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async approveReview(
    owner: string,
    repo: string,
    number: number,
    body?: string
  ): Promise<GitHubReview> {
    return this.createReview(owner, repo, number, {
      event: 'APPROVE',
      body: body ?? '',
      comments: [],
    });
  }

  async replyToComment(
    owner: string,
    repo: string,
    _pullNumber: number,
    commentId: number,
    body: string
  ): Promise<GitHubReviewComment> {
    return this.request<GitHubReviewComment>(
      `/repos/${owner}/${repo}/pulls/comments/${commentId}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }
    );
  }

  async getPRReviewThreads(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<Array<{ nodeId: string; rootCommentDatabaseId: number; isResolved: boolean }>> {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 1) {
                  nodes { databaseId }
                }
              }
            }
          }
        }
      }
    `;
    type GqlResponse = {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: Array<{
              id: string;
              isResolved: boolean;
              comments: { nodes: Array<{ databaseId: number }> };
            }>;
          };
        };
      };
    };
    const data = await this.graphqlRequest<GqlResponse>(query, {
      owner,
      repo,
      number: pullNumber,
    });
    return data.repository.pullRequest.reviewThreads.nodes
      .filter(t => t.comments.nodes.length > 0)
      .map(t => ({
        nodeId: t.id,
        rootCommentDatabaseId: t.comments.nodes[0].databaseId,
        isResolved: t.isResolved,
      }));
  }

  async resolveReviewThread(threadNodeId: string): Promise<void> {
    await this.graphqlRequest(
      `mutation($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
      }`,
      { threadId: threadNodeId }
    );
  }

  async unresolveReviewThread(threadNodeId: string): Promise<void> {
    await this.graphqlRequest(
      `mutation($threadId: ID!) {
        unresolveReviewThread(input: { threadId: $threadId }) { thread { id } }
      }`,
      { threadId: threadNodeId }
    );
  }
}
