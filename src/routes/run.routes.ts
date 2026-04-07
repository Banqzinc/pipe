import { spawn } from 'node:child_process';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { ChatMessage } from '../entities/ChatMessage.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { RunStatus } from '../entities/enums';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { runEventBus } from '../lib/run-event-bus';
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

      if (pr.is_draft) {
        res.status(400).json({ error: 'Cannot review a draft PR. Mark it as ready for review first.' });
        return;
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
      reviewRunner.enqueueRun(run.id, pr.repo_id).catch((err) => {
        // The runner handles its own error logging; this is a safety net
        console.error('Failed to enqueue run:', err);
      });

      res.status(201).json({ id: run.id, status: 'queued' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/runs/:id/stream — SSE stream for live run output
router.get(
  '/runs/:id/stream',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;
      const runRepo = AppDataSource.getRepository(ReviewRun);

      const run = await runRepo.findOneBy({ id: runId });
      if (!run) {
        throw new AppError('Run not found', 404, 'NOT_FOUND');
      }

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const sendEvent = (id: number, data: unknown) => {
        res.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Terminal state — send current output and close
      const terminalStates: string[] = [RunStatus.Completed, RunStatus.Failed, RunStatus.Partial];
      if (terminalStates.includes(run.status)) {
        if (run.cli_output) {
          sendEvent(0, { type: 'init', text: run.cli_output });
        }
        sendEvent(1, { type: 'done', status: run.status, error_message: run.error_message });
        res.end();
        return;
      }

      // Active run — replay buffered events then subscribe
      const lastEventId = req.headers['last-event-id']
        ? Number(req.headers['last-event-id'])
        : undefined;

      // Replay buffered events (for reconnection or first connection)
      const buffered = runEventBus.getBufferedEvents(runId, lastEventId ?? undefined);
      if (buffered.length > 0) {
        for (const e of buffered) {
          sendEvent(e.eventId, e.event);
        }
      } else if (!lastEventId && run.cli_output) {
        // Fallback: no buffer yet, send DB output
        sendEvent(0, { type: 'init', text: run.cli_output });
      }

      const unsubscribe = runEventBus.subscribe(runId, (buffered) => {
        sendEvent(buffered.eventId, buffered.event);
        if (buffered.event.type === 'done') {
          clearInterval(heartbeat);
          res.end();
        }
      });

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 15_000);

      req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
      });
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

      // If this is a stack run, include all stack PRs
      let stackPrsData: Array<{
        id: string;
        github_pr_number: number;
        title: string;
        author: string;
        stack_position: number | null;
        stack_size: number | null;
      }> | undefined;
      if (run.stack_id) {
        const prRepo = AppDataSource.getRepository(PullRequest);
        const stackPrs = await prRepo.find({
          where: { stack_id: run.stack_id, repo_id: pr.repo_id },
          order: { stack_position: 'ASC' },
        });
        stackPrsData = stackPrs.map((sp) => ({
          id: sp.id,
          github_pr_number: sp.github_pr_number,
          title: sp.title,
          author: sp.author,
          stack_position: sp.stack_position,
          stack_size: sp.stack_size,
        }));
      }

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
          base_branch: pr.base_branch,
          stack_id: pr.stack_id,
          stack_position: pr.stack_position,
          stack_size: pr.stack_size,
          head_sha: pr.head_sha, // current PR head SHA for stale detection
          linear_ticket_id: pr.linear_ticket_id,
          notion_url: pr.notion_url,
          is_draft: pr.is_draft,
        },
        head_sha: run.head_sha, // SHA at time of run
        status: run.status,
        is_self_review: run.is_self_review,
        session_id: run.session_id,
        stack_id: run.stack_id,
        stack_prs: stackPrsData,
        brief: run.brief,
        architecture_review: run.architecture_review,
        risk_signals: run.risk_signals,
        error_message: run.error_message,
        prompt: run.prompt,
        cli_output: run.cli_output,
        toolkit_raw_output: run.toolkit_raw_output,
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

// ---------- Chat Endpoints ----------

/** Extract displayable text from a CLI stream-json event */
function extractChatText(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const ev = event as Record<string, unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: stream-json events are untyped
  const inner = (ev.type === 'stream_event' ? ev.event : ev) as Record<string, any> | null;
  if (!inner || inner.type !== 'content_block_delta') return '';
  if (inner.delta?.type === 'text_delta') {
    return inner.delta.text ?? '';
  }
  return '';
}

// GET /api/runs/:id/chat/messages — Return chat history for a run
router.get(
  '/runs/:id/chat/messages',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;
      const msgRepo = AppDataSource.getRepository(ChatMessage);
      const messages = await msgRepo.find({
        where: { run_id: runId },
        order: { created_at: 'ASC' },
      });
      res.json({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/runs/:id/chat/stream — SSE stream for live chat output
router.get(
  '/runs/:id/chat/stream',
  async (req: Request, res: Response) => {
    const runId = req.params.id as string;
    const chatKey = `chat:${runId}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let eventId = 0;
    const sendEvent = (data: unknown) => {
      eventId++;
      res.write(`id: ${eventId}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Replay buffered events
    const buffered = runEventBus.getBufferedEvents(chatKey);
    for (const e of buffered) {
      sendEvent(e.event);
    }

    // Subscribe to new events
    const unsubscribe = runEventBus.subscribe(chatKey, (buffered) => {
      sendEvent(buffered.event);
      if (buffered.event.type === 'chat_done') {
        clearInterval(heartbeat);
        res.end();
      }
    });

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  },
);

// POST /api/runs/:id/chat — Send a message and spawn claude --resume
router.post(
  '/runs/:id/chat',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params.id as string;
      const runRepo = AppDataSource.getRepository(ReviewRun);
      const msgRepo = AppDataSource.getRepository(ChatMessage);
      const run = await runRepo.findOne({ where: { id: runId } });

      if (!run) throw new AppError('Run not found', 404, 'NOT_FOUND');
      if (!run.session_id) {
        throw new AppError(
          'Chat not available — no session ID for this run',
          400,
          'NO_SESSION',
        );
      }

      const { message } = req.body as { message?: string };
      if (!message?.trim()) {
        throw new AppError('Message is required', 400, 'VALIDATION_ERROR');
      }

      // Save user message
      const userMsg = msgRepo.create({
        run_id: run.id,
        role: 'user' as const,
        content: message.trim(),
      });
      await msgRepo.save(userMsg);

      // Return immediately — response comes via SSE
      res.status(202).json({ message_id: userMsg.id });

      // Spawn claude --resume in background
      const chatKey = `chat:${run.id}`;
      const args = [
        '--resume',
        run.session_id,
        '--print',
        '--output-format',
        'stream-json',
        '-p',
        message.trim(),
        '--allowedTools',
        'Read,Grep,Glob,LS',
      ];

      logger.info({ runId: run.id, sessionId: run.session_id, args }, 'Spawning chat CLI');
      const child = spawn('claude', args, { cwd: process.cwd() });
      let responseText = '';

      child.stderr.on('data', (chunk: Buffer) => {
        logger.warn({ runId: run.id, stderr: chunk.toString() }, 'Chat CLI stderr');
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            const text = extractChatText(event);
            if (text) {
              responseText += text;
              runEventBus.emit(chatKey, { type: 'chat_text', text });
            }
          } catch {
            // Non-JSON line — ignore
          }
        }
      });

      child.on('close', async (code) => {
        logger.info({ runId: run.id, exitCode: code, responseLen: responseText.length }, 'Chat CLI closed');
        // Save assistant message
        if (responseText.trim()) {
          const assistantMsg = msgRepo.create({
            run_id: run.id,
            role: 'assistant' as const,
            content: responseText.trim(),
          });
          await msgRepo.save(assistantMsg);
        }
        runEventBus.emit(chatKey, { type: 'chat_done' });
      });

      child.on('error', (err) => {
        logger.error({ runId: run.id, err }, 'Chat CLI spawn error');
        runEventBus.emit(chatKey, { type: 'chat_done' });
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as runRoutes };
