import 'reflect-metadata';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { loadConfig } from './config';
import { logger } from './lib/logger';

const config = loadConfig();
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));
app.get('*path', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(config.port, () => {
  logger.info(`Pipe API listening on port ${config.port}`);
});

export { app };
