import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { loadConfig } from '../config';

const router = Router();

// Public — frontend fetches Google Client ID at runtime
router.get('/config', (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json({ googleClientId: config.googleClientId });
});

// Google ID token login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id_token } = req.body;
    if (!id_token || typeof id_token !== 'string') {
      res.status(400).json({ error: 'id_token is required' });
      return;
    }

    const config = loadConfig();
    const { email } = await AuthService.verifyGoogleToken(id_token, config);
    const token = AuthService.signToken(email);

    res.cookie('pipe_session', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, email });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('pipe_session', { path: '/' });
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const token = req.cookies?.pipe_session;
  if (token) {
    try {
      const payload = AuthService.verifyToken(token);
      res.json({ authenticated: true, email: payload.email ?? null });
      return;
    } catch {
      // Fall through — API key auth doesn't have email
    }
  }
  res.json({ authenticated: true });
});

export { router as authRoutes };
