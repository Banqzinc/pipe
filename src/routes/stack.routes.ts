import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { RunStatus } from '../entities/enums';
import { AppError } from '../lib/errors';
import { reviewRunner, buildStackPrompt } from '../services/review-runner.service';
import { ContextPackBuilder } from '../services/context-pack.service';

const router = Router();

// POST /api/stacks/:stackId/runs — Create a stack ReviewRun
router.post(
  '/:stackId/runs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stackId = req.params.stackId as string;
      const { prompt } = req.body as { prompt?: string };

      const prRepo = AppDataSource.getRepository(PullRequest);
      const runRepo = AppDataSource.getRepository(ReviewRun);

      // Find all PRs in this stack
      const stackPrs = await prRepo.find({
        where: { stack_id: stackId },
        order: { stack_position: 'ASC' },
      });

      if (stackPrs.length === 0) {
        throw new AppError('No PRs found for this stack', 404, 'NOT_FOUND');
      }

      // Use the root (bottom) PR as the anchor
      const rootPr = stackPrs[0];
      // Use topmost PR's head_sha
      const topmostPr = stackPrs[stackPrs.length - 1];

      const run = runRepo.create({
        pr_id: rootPr.id,
        head_sha: topmostPr.head_sha,
        status: RunStatus.Queued,
        is_self_review: false,
        stack_id: stackId,
        prompt: prompt ?? null,
      });

      await runRepo.save(run);

      reviewRunner.enqueueRun(run.id, rootPr.repo_id).catch((err) => {
        console.error('Failed to enqueue stack run:', err);
      });

      res.status(201).json({ id: run.id, status: 'queued' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/stacks/:stackId/preview-prompt — Build stack prompt preview
router.post(
  '/:stackId/preview-prompt',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stackId = req.params.stackId as string;

      const prRepo = AppDataSource.getRepository(PullRequest);

      const stackPrs = await prRepo.find({
        where: { stack_id: stackId },
        order: { stack_position: 'ASC' },
      });

      if (stackPrs.length === 0) {
        throw new AppError('No PRs found for this stack', 404, 'NOT_FOUND');
      }

      const rootPr = stackPrs[0];
      const contextPackBuilder = new ContextPackBuilder();
      const ctx = await contextPackBuilder.buildForStack(stackId, rootPr.repo_id);

      const prompt = await buildStackPrompt(ctx.perPrDiffs, ctx);

      res.json({
        prompt,
        context_summary: {
          has_linear_ticket: !!ctx.linearTicketId,
          has_notion_url: !!ctx.notionUrl,
          has_prior_comments: false,
          stack_size: stackPrs.length,
          stack_position: null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as stackRoutes };
