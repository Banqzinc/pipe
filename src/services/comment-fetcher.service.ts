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
}

export interface PRCommentContext {
  threads: CommentThread[];
  issueComments: GitHubIssueComment[];
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

  const [reviewComments, issueComments] = await Promise.all([
    client.getPRReviewComments(owner, name, prNumber),
    client.getPRIssueComments(owner, name, prNumber),
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

  return {
    threads: [...rootMap.values()],
    issueComments,
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
