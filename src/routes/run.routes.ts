import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { RunStatus } from '../entities/enums';
import { AppError } from '../lib/errors';
import { reviewRunner } from '../services/review-runner.service';
import { postingService } from '../services/posting.service';

const router = Router();

// POST /api/prs/:id/runs — Create a new ReviewRun
router.post(
  '/prs/:id/runs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prId = req.params.id as string;
      const { is_self_review, prompt } = req.body as {
        is_self_review?: boolean;
        prompt?: string;
      };

      const prRepo = AppDataSource.getRepository(PullRequest);
      const runRepo = AppDataSource.getRepository(ReviewRun);

      const pr = await prRepo.findOneBy({ id: prId });
      if (!pr) {
        throw new AppError('Pull request not found', 404, 'NOT_FOUND');
      }

      const run = runRepo.create({
        pr_id: pr.id,
        head_sha: pr.head_sha,
        status: RunStatus.Queued,
        is_self_review: is_self_review ?? false,
        prompt: prompt ?? null,
      });

      await runRepo.save(run);

      // Enqueue for processing (fire-and-forget)
      reviewRunner.enqueueRun(run.id).catch((err) => {
        // The runner handles its own error logging; this is a safety net
        console.error('Failed to enqueue run:', err);
      });

      res.status(201).json({ id: run.id, status: 'queued' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/runs/:id — Return run details
router.get(
  '/runs/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;

      const runRepo = AppDataSource.getRepository(ReviewRun);
      const postRepo = AppDataSource.getRepository(ReviewPost);

      const run = await runRepo.findOne({
        where: { id: runId },
        relations: ['pullRequest', 'pullRequest.repo'],
      });

      if (!run) {
        throw new AppError('Run not found', 404, 'NOT_FOUND');
      }

      const pr = run.pullRequest;
      const repo = pr.repo;

      // Check for a review post
      const post = await postRepo.findOneBy({ run_id: run.id });

      res.json({
        id: run.id,
        pr: {
          id: pr.id,
          github_pr_number: pr.github_pr_number,
          title: pr.title,
          author: pr.author,
          repo: {
            github_owner: repo.github_owner,
            github_name: repo.github_name,
          },
          stack_id: pr.stack_id,
          stack_position: pr.stack_position,
          stack_size: pr.stack_size,
          head_sha: pr.head_sha, // current PR head SHA for stale detection
          linear_ticket_id: pr.linear_ticket_id,
          notion_url: pr.notion_url,
        },
        head_sha: run.head_sha, // SHA at time of run
        status: run.status,
        is_self_review: run.is_self_review,
        brief: run.brief,
        risk_signals: run.risk_signals,
        error_message: run.error_message,
        prompt: run.prompt,
        cli_output: run.cli_output,
        has_post: !!post,
        post: post
          ? {
              github_review_id: post.github_review_id,
              posted_at: post.posted_at,
            }
          : null,
        started_at: run.started_at,
        completed_at: run.completed_at,
        created_at: run.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/runs/:id/post — Post accepted findings to GitHub as a PR review
router.post(
  '/runs/:id/post',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;
      const result = await postingService.postToGitHub(runId);
      res.json(result);
    } catch (err) {
      if (err instanceof AppError && err.code === 'STALE') {
        res.status(409).json({
          error: err.message,
          code: 'STALE',
        });
        return;
      }
      next(err);
    }
  },
);

// POST /api/runs/:id/export — Export findings as markdown for self-review
router.post(
  '/runs/:id/export',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;
      const result = await postingService.exportFindings(runId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as runRoutes };
