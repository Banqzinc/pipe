import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { loadConfig } from '../config';

let _cachedApiKey: string | undefined;
function getApiKey(): string | undefined {
  if (_cachedApiKey === undefined) {
    _cachedApiKey = loadConfig().apiKey ?? '';
  }
  return _cachedApiKey || undefined;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Bearer token auth (for CLI / API key)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = getApiKey();
    const bearerToken = authHeader.slice(7);
    if (apiKey) {
      const a = Buffer.from(bearerToken);
      const b = Buffer.from(apiKey);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        next();
        return;
      }
    }
  }

  // Cookie-based session auth (for web UI)
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
      'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf-8').digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}
