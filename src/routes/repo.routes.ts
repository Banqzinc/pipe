import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { loadConfig } from '../config';
import { Repo } from '../entities/Repo.entity';
import { encrypt } from '../lib/encryption';
import { AppError } from '../lib/errors';
import { GitHubClient } from '../services/github-client';
import { SyncService } from '../services/sync.service';

const router = Router();
const repoRepository = () => AppDataSource.getRepository(Repo);

// --- Zod schemas ---

const CreateRepoSchema = z.object({
  github_owner: z.string().min(1),
  github_name: z.string().min(1),
  pat: z.string().min(1).optional(),
  webhook_secret: z.string().min(1).optional(),
});

const UpdateRepoSchema = z.object({
  pat: z.string().min(1).optional(),
  auto_trigger_on_open: z.boolean().optional(),
});

// --- Helper: strip sensitive fields ---

function toSafeRepo(repo: Repo) {
  return {
    id: repo.id,
    github_owner: repo.github_owner,
    github_name: repo.github_name,
    auto_trigger_on_open: repo.auto_trigger_on_open,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
  };
}

// --- Routes ---

// GET /api/repos — list all repos
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = await repoRepository().find({ order: { created_at: 'DESC' } });
    res.json(repos.map(toSafeRepo));
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/available — list GitHub repos available to connect
router.get('/available', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadConfig();
    if (!config.ghToken) {
      throw new AppError('GH_TOKEN is not configured', 400, 'MISSING_GH_TOKEN');
    }

    const org = typeof req.query.org === 'string' ? req.query.org : undefined;
    const client = new GitHubClient(config.ghToken);
    const ghRepos = await client.listRepos(org);

    // Exclude already-connected repos
    const connected = await repoRepository().find();
    const connectedSet = new Set(connected.map((r) => `${r.github_owner}/${r.github_name}`));

    const available = ghRepos
      .filter((r) => !connectedSet.has(`${r.owner}/${r.name}`))
      .map((r) => ({
        github_owner: r.owner,
        github_name: r.name,
        is_private: r.isPrivate,
      }));

    res.json(available);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos — create a repo
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateRepoSchema.parse(req.body);

    // Resolve PAT: explicit value > GH_TOKEN env var
    const pat = parsed.pat ?? loadConfig().ghToken;
    if (!pat) {
      throw new AppError(
        'No GitHub PAT provided. Either pass "pat" in the request body or set the GH_TOKEN environment variable.',
        400,
        'MISSING_PAT',
      );
    }

    const webhookSecret = parsed.webhook_secret ?? crypto.randomBytes(32).toString('hex');

    const repo = repoRepository().create({
      github_owner: parsed.github_owner,
      github_name: parsed.github_name,
      pat_token_encrypted: encrypt(pat),
      github_webhook_secret: webhookSecret,
    });

    const saved = await repoRepository().save(repo);
    res.status(201).json(toSafeRepo(saved));
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR'));
      return;
    }
    next(err);
  }
});

// PATCH /api/repos/:id — partial update
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateRepoSchema.parse(req.body);
    const id = req.params.id as string;
    const repo = await repoRepository().findOneBy({ id });

    if (!repo) {
      throw new AppError('Repo not found', 404, 'NOT_FOUND');
    }

    if (parsed.pat !== undefined) {
      repo.pat_token_encrypted = encrypt(parsed.pat);
    }
    if (parsed.auto_trigger_on_open !== undefined) {
      repo.auto_trigger_on_open = parsed.auto_trigger_on_open;
    }

    const saved = await repoRepository().save(repo);
    res.json(toSafeRepo(saved));
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR'));
      return;
    }
    next(err);
  }
});

// DELETE /api/repos/:id — hard delete (cascades to PRs, runs, findings, posts)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const repo = await repoRepository().findOneBy({ id });
    if (!repo) {
      throw new AppError('Repo not found', 404, 'NOT_FOUND');
    }

    // Delete in FK order: findings/posts → runs → chat_messages → PRs → repo
    await AppDataSource.query(
      `DELETE FROM finding WHERE run_id IN (
        SELECT rr.id FROM review_run rr
        JOIN pull_request pr ON pr.id = rr.pr_id
        WHERE pr.repo_id = $1
      )`,
      [id],
    );
    await AppDataSource.query(
      `DELETE FROM review_post WHERE run_id IN (
        SELECT rr.id FROM review_run rr
        JOIN pull_request pr ON pr.id = rr.pr_id
        WHERE pr.repo_id = $1
      )`,
      [id],
    );
    await AppDataSource.query(
      `DELETE FROM chat_messages WHERE run_id IN (
        SELECT rr.id FROM review_run rr
        JOIN pull_request pr ON pr.id = rr.pr_id
        WHERE pr.repo_id = $1
      )`,
      [id],
    );
    await AppDataSource.query(
      `DELETE FROM review_run WHERE pr_id IN (
        SELECT id FROM pull_request WHERE repo_id = $1
      )`,
      [id],
    );
    await AppDataSource.query(`DELETE FROM pull_request WHERE repo_id = $1`, [id]);
    await repoRepository().delete({ id });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/sync — Sync all repos
router.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = await repoRepository().find();
    const syncService = new SyncService();
    let totalSynced = 0;

    for (const repo of repos) {
      const synced = await syncService.syncRepo(repo.id);
      totalSynced += synced;
    }

    res.json({ synced: totalSynced, repos: repos.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/:id/sync — Trigger sync for a repo
router.post('/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    // Verify repo exists
    const repo = await repoRepository().findOneBy({ id });
    if (!repo) {
      throw new AppError('Repo not found', 404, 'NOT_FOUND');
    }

    const syncService = new SyncService();
    const synced = await syncService.syncRepo(id);

    res.json({ synced });
  } catch (err) {
    next(err);
  }
});

export { router as repoRoutes };
