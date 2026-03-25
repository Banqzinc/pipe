import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { decrypt } from '../lib/encryption';
import { logger } from '../lib/logger';
import {
  GitHubClient,
  type GitHubReviewComment,
  type GitHubIssueComment,
} from './github-client';

export interface CommentThread {
  rootComment: GitHubReviewComment;
  replies: GitHubReviewComment[];
  threadNodeId?: string;
  isResolved?: boolean;
}

export interface PRCommentContext {
  threads: CommentThread[];
  issueComments: GitHubIssueComment[];
  threadCount: number;
  resolvedCount: number;
}

export async function fetchPRComments(pr: PullRequest): Promise<PRCommentContext> {
  const repo = pr.repo;
  if (!repo) {
    throw new Error(`Repo relation not loaded for PR: ${pr.id}`);
  }

  const pat = decrypt(repo.pat_token_encrypted);
  const client = new GitHubClient(pat);
  const owner = repo.github_owner;
  const name = repo.github_name;
  const prNumber = pr.github_pr_number;

  const [reviewComments, issueComments, reviewThreads] = await Promise.all([
    client.getPRReviewComments(owner, name, prNumber),
    client.getPRIssueComments(owner, name, prNumber),
    client.getPRReviewThreads(owner, name, prNumber).catch((err) => {
      logger.warn(
        { prId: pr.id, err },
        'Failed to fetch review threads via GraphQL, resolve will be unavailable',
      );
      return [];
    }),
  ]);

  logger.info(
    { prId: pr.id, reviewCommentCount: reviewComments.length, issueCommentCount: issueComments.length },
    'Fetched PR comments from GitHub',
  );

  // Group review comments into threads using in_reply_to_id
  const rootMap = new Map<number, CommentThread>();
  const replyBuffer: GitHubReviewComment[] = [];

  for (const comment of reviewComments) {
    if (comment.in_reply_to_id) {
      replyBuffer.push(comment);
    } else {
      rootMap.set(comment.id, { rootComment: comment, replies: [] });
    }
  }

  for (const reply of replyBuffer) {
    if (!reply.in_reply_to_id) continue;
    const thread = rootMap.get(reply.in_reply_to_id);
    if (thread) {
      thread.replies.push(reply);
    }
  }

  // Sort replies within each thread by created_at
  for (const thread of rootMap.values()) {
    thread.replies.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  // Merge GraphQL thread resolution data
  const threadLookup = new Map(
    reviewThreads.map((t) => [t.rootCommentDatabaseId, t]),
  );
  for (const [rootId, thread] of rootMap) {
    const meta = threadLookup.get(rootId);
    if (meta) {
      thread.threadNodeId = meta.nodeId;
      thread.isResolved = meta.isResolved;
    }
  }

  const threads = [...rootMap.values()];

  // Update PR comment counts so the inbox shows accurate numbers
  const resolvedCount = threads.filter((t) => t.isResolved).length;
  try {
    const prRepo = AppDataSource.getRepository(PullRequest);
    await prRepo.update(pr.id, {
      github_comments: issueComments.length,
      github_review_comments: reviewComments.length,
    });
  } catch (err) {
    logger.warn({ prId: pr.id, err }, 'Failed to update PR comment counts');
  }

  return {
    threads,
    issueComments,
    threadCount: threads.length,
    resolvedCount,
  };
}

export async function fetchPRCommentsById(prId: string): Promise<PRCommentContext> {
  const prRepo = AppDataSource.getRepository(PullRequest);
  const pr = await prRepo.findOne({
    where: { id: prId },
    relations: ['repo'],
  });

  if (!pr) {
    throw new Error(`PullRequest not found: ${prId}`);
  }

  return fetchPRComments(pr);
}
