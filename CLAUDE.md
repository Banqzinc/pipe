# Pipe — Self-hosted PR Review Tool

## Overview

Pipe is a self-hosted pull request review tool that provides automated code review with risk analysis and contextual feedback.

## Architecture

- **Backend:** Express + TypeORM + PostgreSQL
- **Frontend:** React + Vite + TanStack (in `frontend/`)
- **Database:** PostgreSQL 15 via Docker Compose on port 5433
- **Language:** TypeScript (strict mode)

## Project Structure

```
src/
  index.ts          # Express app entrypoint
  config.ts         # Zod-validated env config
  entities/         # TypeORM entities (UUID primary keys)
  services/         # Business logic services
  routes/           # Express route handlers
  lib/              # Shared utilities (logger, errors)
  db/               # Data source and migrations
frontend/           # React + Vite + TanStack app
```

## Development

### Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker (for PostgreSQL)

### Setup

```bash
docker compose up -d          # Start PostgreSQL
cp env.default .env           # Create local env (or use 1Password)
npm install
npm run dev                   # Start dev server on port 3100
```

### 1Password Integration

`npm run dev` uses `op run` to resolve secrets from 1Password. `env.default` contains `op://pipe_$DEPLOY_ENV/...` references that are expanded at runtime. `DEPLOY_ENV=local` is set by the dev script, so secrets resolve from the `pipe_local` vault/section.

### Environment Variables

All env vars are validated via Zod in `src/config.ts`:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret (min 16 chars)
- `PIPE_ENCRYPTION_KEY` — 64 hex char encryption key (32 bytes)
- `PIPE_REPOS_DIR` — Directory for cloned repos (default: `./repos`)
- `PIPE_PORT` — Server port (default: 3100)
- `NODE_ENV` — development | production | test

## Commands

- `npm run dev` — Start dev server with hot reload (tsx)
- `npm run build` — Compile with SWC
- `npm start` — Run compiled output
- `npm test` — Run tests (Vitest)
- `npm run test:watch` — Run tests in watch mode
- `npm run typecheck` — TypeScript type checking
- `npm run lint` — Lint with Biome
- `npm run lint:fix` — Lint and auto-fix with Biome
- `npm run format` — Format with Biome
- `npm run format:check` — Check formatting with Biome
- `npm run migration:run` — Run TypeORM migrations
- `npm run migration:revert` — Revert last migration
- `npm run migration:generate` — Generate migration from entity changes

## Code Style

- **Formatter/Linter:** Biome (not ESLint/Prettier)
- Single quotes
- 2-space indentation
- Semicolons always
- Trailing commas (ES5)
- Line width: 100

## Testing

- **Framework:** Vitest
- Test files live alongside source: `src/**/*.test.ts`
- Run: `npm test` or `npm run test:watch`

## Key Patterns

- Entities use UUID primary keys
- Config validated at startup via Zod (`src/config.ts`)
- Logging via Pino (`src/lib/logger.ts`)
- Custom errors extend `AppError` (`src/lib/errors.ts`)
- TypeORM with PostgreSQL for persistence
- SWC for fast TypeScript compilation
