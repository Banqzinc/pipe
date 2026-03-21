import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { Repo } from '../entities/Repo.entity';
import { WebhookService } from '../services/webhook.service';
import { logger } from '../lib/logger';

const router = Router();
const webhookService = new WebhookService();

router.post(
  '/github',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const event = req.headers['x-github-event'] as string | undefined;
      const signature = req.headers['x-hub-signature-256'] as string | undefined;

      if (!event) {
        res.status(400).json({ error: 'Missing X-GitHub-Event header' });
        return;
      }

      if (!signature) {
        res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
        return;
      }

      // Get the raw body for HMAC verification
      // This is set by the modified express.json({ verify }) in index.ts
      const rawBody: Buffer | undefined = (req as any).rawBody;
      if (!rawBody) {
        logger.error('rawBody not available — check express.json() verify config');
        res.status(500).json({ error: 'Server misconfiguration' });
        return;
      }

      // Verify signature against all known repos' webhook secrets.
      // There will be few repos, so iterating is fine.
      const repoRepo = AppDataSource.getRepository(Repo);
      const repos = await repoRepo.find();

      let verified = false;
      for (const repo of repos) {
        const expected =
          'sha256=' +
          crypto
            .createHmac('sha256', repo.github_webhook_secret)
            .update(rawBody)
            .digest('hex');

        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expected);

        if (
          sigBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(sigBuf, expectedBuf)
        ) {
          verified = true;
          break;
        }
      }

      if (!verified) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Body is already parsed as JSON by express.json()
      const payload = req.body;

      await webhookService.handleEvent(event, payload);

      res.json({ ok: true });
    } catch (err) {
      logger.error(err, 'Webhook handler error');
      // Always return 200-range to GitHub to avoid retries on our errors
      // Actually, returning 500 is fine — GitHub will retry, which we may want
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export { router as webhookRoutes };
