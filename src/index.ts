import 'reflect-metadata';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { loadConfig } from './config';
import { logger } from './lib/logger';
import { AppDataSource } from './db/data-source';
import { AuthService } from './services/auth.service';
import { authRoutes } from './routes/auth.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { errorMiddleware } from './middleware/error.middleware';

const config = loadConfig();
const app = express();

app.use(cors({ origin: config.origin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (login/logout NOT protected by authMiddleware)
app.use('/api/auth', authRoutes);

// Auth middleware applied to all subsequent /api/* routes
app.use('/api', authMiddleware);

// Future API routes go here

// Error middleware (must be after all routes)
app.use(errorMiddleware);

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));
const indexHtmlPath = path.join(frontendPath, 'index.html');
app.get('*path', (_req, res, next) => {
  if (fs.existsSync(indexHtmlPath)) {
    res.sendFile(indexHtmlPath);
  } else {
    next();
  }
});

async function start() {
  await AuthService.initSecret(config.reposDir);
  await AppDataSource.initialize();
  logger.info('Database connected');
  app.listen(config.port, () => {
    logger.info(`Pipe API listening on port ${config.port}`);
  });
}

start().catch(err => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});

export { app };
