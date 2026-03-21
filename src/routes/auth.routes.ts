import { Router } from 'express';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { loadConfig } from '../config';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { secret } = req.body;

  if (!secret || !AuthService.validateSecret(secret)) {
    res.status(401).json({ error: 'Invalid secret' });
    return;
  }

  const token = AuthService.signToken();
  const config = loadConfig();

  res.cookie('pipe_session', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({ success: true });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('pipe_session', { path: '/' });
  res.json({ success: true });
});

router.get('/me', authMiddleware, (_req: Request, res: Response) => {
  res.json({ authenticated: true });
});

export { router as authRoutes };
