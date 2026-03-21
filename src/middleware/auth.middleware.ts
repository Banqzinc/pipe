import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.pipe_session;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    AuthService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function createWebhookAuth(getSecret: (repoId: string) => string) {
  return function webhookAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!signature) {
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    const repoId = req.params.repoId as string;
    let secret: string;

    try {
      secret = getSecret(repoId);
    } catch {
      res.status(401).json({ error: 'Unknown repository' });
      return;
    }

    const body = JSON.stringify(req.body);
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(body, 'utf-8').digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}
