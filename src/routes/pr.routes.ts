import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { FindingStatus } from '../entities/enums';
import { AppError } from '../lib/errors';
import { decrypt } from '../lib/encryption';
import { GitHubClient } from '../services/github-client';
import { buildPrompt } from '../services/review-runner.service';
import { fetchPRComments } from '../services/comment-fetcher.service';

const router = Router();

// GET /api/prs — List PRs with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prRepo = AppDataSource.getRepository(PullRequest);
    const runRepo = AppDataSource.getRepository(ReviewRun);
    const findingRepo = AppDataSource.getRepository(Finding);
    const postRepo = AppDataSource.getRepository(ReviewPost);

    const { status, repo_id, filter, search } = req.query as {
      status?: string;
      repo_id?: string;
      filter?: string;
      search?: string;
    };

    // Build query
    const qb = prRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.repo', 'repo')
      .orderBy('COALESCE(pr.github_updated_at, pr.updated_at)', 'DESC');

    // Default to open PRs only — closed/merged PRs should not appear in the inbox
    qb.andWhere('pr.status = :status', { status: status || 'open' });

    if (repo_id) {
      qb.andWhere('pr.repo_id = :repo_id', { repo_id });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(pr.title ILIKE :search OR pr.author ILIKE :search OR pr.branch_name ILIKE :search OR CAST(pr.github_pr_number AS TEXT) LIKE :search)',
        { search: term },
      );
    }

    const prs = await qb.getMany();

    // For each PR, get the latest run + findings count + has_post
    const result = await Promise.all(
      prs.map(async (pr) => {
        // Get the latest run for this PR
        const latestRun = await runRepo.findOne({
          where: { pr_id: pr.id },
          order: { created_at: 'DESC' },
        });

        let latestRunData: any = null;

        if (latestRun) {
          // Count findings by status
          const findings = await findingRepo.find({
            where: { run_id: latestRun.id },
            select: ['status'],
          });

          const counts = {
            total: findings.length,
            pending: findings.filter((f) => f.status === FindingStatus.Pending).length,
            accepted: findings.filter((f) => f.status === FindingStatus.Accepted).length,
            rejected: findings.filter((f) => f.status === FindingStatus.Rejected).length,
            posted: findings.filter((f) => f.status === FindingStatus.Posted).length,
          };

          const post = await postRepo.findOneBy({ run_id: latestRun.id });

          latestRunData = {
            id: latestRun.id,
            status: latestRun.status,
            is_self_review: latestRun.is_self_review,
            risk_signals: latestRun.risk_signals,
            findings_count: counts,
            has_post: !!post,
          };
        }

        return {
          id: pr.id,
          repo: {
            id: pr.repo.id,
            github_owner: pr.repo.github_owner,
            github_name: pr.repo.github_name,
          },
          github_pr_number: pr.github_pr_number,
          title: pr.title,
          author: pr.author,
          branch_name: pr.branch_name,
          base_branch: pr.base_branch,
          status: pr.status,
          is_draft: pr.is_draft,
          head_sha: pr.head_sha,
          linear_ticket_id: pr.linear_ticket_id,
          stack_id: pr.stack_id,
          stack_position: pr.stack_position,
          stack_size: pr.stack_size,
          review_completed_at: pr.review_completed_at,
          latest_run: latestRunData,
          comment_counts: {
            discussions: pr.github_comments,
            review_comments: pr.github_review_comments,
          },
          created_at: pr.created_at,
          updated_at: pr.updated_at,
        };
      }),
    );

    // Apply filter after enrichment (needs latest_run info)
    let filtered = result;
    if (filter === 'needs_review') {
      // No run or latest run incomplete; exclude drafts
      filtered = result.filter(
        (pr) =>
          !pr.is_draft &&
          (!pr.latest_run ||
            !['completed', 'partial'].includes(pr.latest_run.status)),
      );
    } else if (filter === 'in_progress') {
      // Latest run exists with findings, not yet marked completed
      filtered = result.filter(
        (pr) =>
          !pr.review_completed_at &&
          pr.latest_run &&
          pr.latest_run.findings_count.total > 0,
      );
    } else if (filter === 'completed') {
      // Explicitly marked as completed by user
      filtered = result.filter((pr) => !!pr.review_completed_at);
    }

    res.json({ pull_requests: filtered });
  } catch (err) {
    next(err);
  }
});

// GET /api/prs/:id — Single PR with run history
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prRepo = AppDataSource.getRepository(PullRequest);
    const runRepo = AppDataSource.getRepository(ReviewRun);
    const findingRepo = AppDataSource.getRepository(Finding);
    const id = req.params.id as string;

    const pr = await prRepo.findOne({
      where: { id },
      relations: ['repo'],
    });

    if (!pr) {
      throw new AppError('Pull request not found', 404, 'NOT_FOUND');
    }

    // Get all runs for this PR
    const runs = await runRepo.find({
      where: { pr_id: pr.id },
      order: { created_at: 'DESC' },
    });

    const runsData = await Promise.all(
      runs.map(async (run) => {
        const findingsCount = await findingRepo.count({
          where: { run_id: run.id },
        });

        return {
          id: run.id,
          status: run.status,
          is_self_review: run.is_self_review,
          head_sha: run.head_sha,
          findings_count: findingsCount,
          created_at: run.created_at,
          completed_at: run.completed_at,
        };
      }),
    );

    res.json({
      id: pr.id,
      repo: {
        id: pr.repo.id,
        github_owner: pr.repo.github_owner,
        github_name: pr.repo.github_name,
      },
      github_pr_number: pr.github_pr_number,
      title: pr.title,
      author: pr.author,
      branch_name: pr.branch_name,
      base_branch: pr.base_branch,
      status: pr.status,
      is_draft: pr.is_draft,
      head_sha: pr.head_sha,
      linear_ticket_id: pr.linear_ticket_id,
      stack_id: pr.stack_id,
      stack_position: pr.stack_position,
      stack_size: pr.stack_size,
      review_completed_at: pr.review_completed_at,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      runs: runsData,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/prs/:id/stack — Sibling PRs in same stack
router.get(
  '/:id/stack',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;

      const pr = await prRepo.findOneBy({ id });

      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      if (!pr.stack_id) {
        res.json({ stack: [] });
        return;
      }

      const siblings = await prRepo.find({
        where: { stack_id: pr.stack_id, repo_id: pr.repo_id },
        relations: ['repo'],
        order: { stack_position: 'ASC' },
      });

      res.json({
        stack: siblings.map((s) => ({
          id: s.id,
          repo: {
            id: s.repo.id,
            github_owner: s.repo.github_owner,
            github_name: s.repo.github_name,
          },
          github_pr_number: s.github_pr_number,
          title: s.title,
          author: s.author,
          branch_name: s.branch_name,
          base_branch: s.base_branch,
          status: s.status,
          head_sha: s.head_sha,
          stack_id: s.stack_id,
          stack_position: s.stack_position,
          stack_size: s.stack_size,
          created_at: s.created_at,
          updated_at: s.updated_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/prs/:id/comments — Fetch GitHub review comment threads
router.get(
  '/:id/comments',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;

      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });

      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      const context = await fetchPRComments(pr);

      res.json({
        threads: context.threads.map((t) => ({
          root_comment_id: t.rootComment.id,
          path: t.rootComment.path,
          line: t.rootComment.line,
          root_body: t.rootComment.body,
          root_user: t.rootComment.user.login,
          root_created_at: t.rootComment.created_at,
          root_html_url: t.rootComment.html_url,
          thread_node_id: t.threadNodeId ?? null,
          is_resolved: t.isResolved ?? false,
          replies: t.replies.map((r) => ({
            id: r.id,
            body: r.body,
            user: r.user.login,
            created_at: r.created_at,
            html_url: r.html_url,
          })),
        })),
        issue_comments: context.issueComments.map((c) => ({
          id: c.id,
          body: c.body,
          user: c.user.login,
          created_at: c.created_at,
          html_url: c.html_url,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/prs/:id/comments/:commentId/replies
router.post(
  '/:id/comments/:commentId/replies',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;
      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });
      if (!pr) throw new AppError('Pull request not found', 404, 'NOT_FOUND');

      const { body } = req.body as { body?: string };
      if (!body?.trim()) throw new AppError('Reply body is required', 400, 'VALIDATION_ERROR');

      const commentId = parseInt(req.params.commentId as string, 10);
      if (Number.isNaN(commentId))
        throw new AppError('Invalid comment ID', 400, 'VALIDATION_ERROR');

      const pat = decrypt(pr.repo.pat_token_encrypted);
      const client = new GitHubClient(pat);
      const result = await client.replyToComment(
        pr.repo.github_owner,
        pr.repo.github_name,
        pr.github_pr_number,
        commentId,
        body.trim(),
      );

      res.status(201).json({
        id: result.id,
        body: result.body,
        user: result.user.login,
        created_at: result.created_at,
        html_url: result.html_url,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/prs/:id/comments/:commentId/resolve
router.post(
  '/:id/comments/:commentId/resolve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;
      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });
      if (!pr) throw new AppError('Pull request not found', 404, 'NOT_FOUND');

      const { resolved, threadNodeId } = req.body as {
        resolved: boolean;
        threadNodeId: string;
      };
      if (!threadNodeId)
        throw new AppError('threadNodeId is required', 400, 'VALIDATION_ERROR');
      if (typeof resolved !== 'boolean')
        throw new AppError('resolved must be a boolean', 400, 'VALIDATION_ERROR');

      const pat = decrypt(pr.repo.pat_token_encrypted);
      const client = new GitHubClient(pat);

      if (resolved) {
        await client.resolveReviewThread(threadNodeId);
      } else {
        await client.unresolveReviewThread(threadNodeId);
      }

      res.json({ resolved });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/prs/:id/preview-prompt — Build prompt without creating a run
router.post(
  '/:id/preview-prompt',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;

      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });

      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      // Build a lightweight context pack (just business context, no diff needed for prompt)
      const ctx = {
        diff: '',
        diffTruncated: false,
        changedFiles: [] as string[],
        rules: [],
        parentDiff: null,
        childDiff: null,
        linearTicketId: pr.linear_ticket_id,
        notionUrl: pr.notion_url,
      };

      // Check for prior review posts to include follow-up context
      let priorComments: Awaited<ReturnType<typeof fetchPRComments>> | undefined;
      const postRepo = AppDataSource.getRepository(ReviewPost);
      const hasPriorPost = await postRepo
        .createQueryBuilder('post')
        .innerJoin('post.reviewRun', 'run')
        .where('run.pr_id = :prId', { prId: pr.id })
        .getOne();

      if (hasPriorPost) {
        try {
          priorComments = await fetchPRComments(pr);
        } catch {
          // Continue without prior comments
        }
      }

      const buildResult = await buildPrompt(pr, ctx, priorComments);

      res.json({
        prompt: buildResult.prompt,
        context_summary: {
          has_linear_ticket: !!pr.linear_ticket_id,
          has_notion_url: !!pr.notion_url,
          has_prior_comments: !!priorComments && priorComments.threads.length > 0,
          stack_position: pr.stack_position,
          stack_size: pr.stack_size,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/prs/:id/diff — Fetch PR file diffs from GitHub
router.get(
  '/:id/diff',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;

      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });

      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      const pat = decrypt(pr.repo.pat_token_encrypted);
      const client = new GitHubClient(pat);
      const files = await client.getPRFiles(
        pr.repo.github_owner,
        pr.repo.github_name,
        pr.github_pr_number,
      );

      res.json({
        files: files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/prs/:id/approve — Approve PR on GitHub
router.post(
  '/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prRepo = AppDataSource.getRepository(PullRequest);
      const id = req.params.id as string;

      const pr = await prRepo.findOne({
        where: { id },
        relations: ['repo'],
      });

      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      const pat = decrypt(pr.repo.pat_token_encrypted);
      const client = new GitHubClient(pat);
      const review = await client.approveReview(
        pr.repo.github_owner,
        pr.repo.github_name,
        pr.github_pr_number,
      );

      res.json({
        review_id: review.id,
        html_url: review.html_url,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/prs/:id — Update PR fields (business context)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prRepo = AppDataSource.getRepository(PullRequest);
    const id = req.params.id as string;

    const pr = await prRepo.findOneBy({ id });
    if (!pr) {
      throw new AppError('Pull request not found', 404, 'NOT_FOUND');
    }

    const { linear_ticket_id, notion_url, review_completed_at } = req.body as {
      linear_ticket_id?: string | null;
      notion_url?: string | null;
      review_completed_at?: boolean | null;
    };

    if (linear_ticket_id !== undefined) pr.linear_ticket_id = linear_ticket_id || null;
    if (notion_url !== undefined) pr.notion_url = notion_url || null;
    if (review_completed_at !== undefined) {
      pr.review_completed_at = review_completed_at ? new Date() : null;
    }

    await prRepo.save(pr);

    res.json({
      id: pr.id,
      linear_ticket_id: pr.linear_ticket_id,
      notion_url: pr.notion_url,
      review_completed_at: pr.review_completed_at,
    });
  } catch (err) {
    next(err);
  }
});

export { router as prRoutes };
