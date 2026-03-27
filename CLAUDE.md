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
touch .env                    # Create empty .env for local overrides
npm install
npm run dev                   # Start dev server on port 3100 (runs migrations automatically)
```

Once the server is running, connect a repository:

```bash
npm run build:cli                                    # Build the CLI
npx pipe repo add --owner Banqzinc --no-webhook      # Connect a repo (skip webhook for local dev)
```

Then open http://localhost:5173 and click **Sync PRs** to pull in open PRs.

> **First time only:** Run `npx pipe login` to configure the server URL and API key. The config persists at `~/.config/pipe/config.json`.

### Fresh Start (reset database)

No need to run migrations manually — `npm run dev` runs them automatically on startup.

```bash
docker compose down -v        # Drop database volume (nukes all data)
docker compose up -d          # Fresh PostgreSQL
npm run dev                   # Start server (auto-runs migrations + seeds)
npm run build:cli             # Rebuild CLI
npx pipe repo add --owner Banqzinc --no-webhook      # Re-connect repos
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
- `PIPE_ORIGIN` — Allowed CORS origin (default: http://localhost:5173)
- `PIPE_API_KEY` — API key for CLI/bearer auth
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (for web login)
- `PIPE_ALLOWED_DOMAINS` — Comma-separated allowed email domains

## Commands

- `npm run dev` — Start dev server with hot reload (tsx)
- `npm run build` — Compile API + frontend with SWC
- `npm run build:cli` — Compile CLI only (needed for `npx pipe` commands)
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
