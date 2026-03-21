# Pipe MVP (v0.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted PR review tool that wraps Claude CLI's pr-review-toolkit, converts output into structured draft comments, and gives humans a fast accept/reject/edit workflow before posting to GitHub.

**Architecture:** Express API on host (spawns Claude CLI with host's auth/MCP), Postgres in Docker, Vite SPA frontend served by API. The API manages the review pipeline: webhook → context assembly → CLI invocation → output parsing → human triage → GitHub posting.

**Tech Stack:** Node.js 22+, Express, TypeORM, PostgreSQL 15, Vite, React 19, TanStack Router/Query, Tailwind CSS 4, Biome, Vitest, SWC, Zod

**Design spec:** `docs/superpowers/specs/2026-03-20-pipe-mvp-design.md`
**Linear project:** [PR Pipe](https://linear.app/quidkey/project/pr-pipe-82a6240fd3f8/overview) (CORE-347 through CORE-360)

**Sibling service patterns (follow these):**
- Express setup: `/Users/rabi/code/quidkey/services/quidkey-core/src/index.ts`
- TypeORM entities: `/Users/rabi/code/quidkey/services/quidkey-core/src/entities/` (UUID PKs, enums, jsonb, CreateDateColumn)
- Biome config: `/Users/rabi/code/quidkey/services/quidkey-console/biome.json`
- 1Password secrets: `op run --no-masking --env-file=env.default --env-file=.env --` pattern
- TypeORM data source: `/Users/rabi/code/quidkey/services/quidkey-core/src/db/data-source.ts`

---

## File Structure

### Backend (`/`)

```
package.json
tsconfig.json
biome.json
docker-compose.yml
env.default
.env                          # git-ignored, local overrides
.gitignore
.nvmrc
CLAUDE.md
vitest.config.ts

src/
├── index.ts                  # Express app entry, middleware, route mounting, static serving
├── config.ts                 # Env var loading + validation via Zod
├── db/
│   └── data-source.ts        # TypeORM DataSource config
├── entities/
│   ├── enums.ts              # All shared enums (PrStatus, RunStatus, FindingSeverity, FindingStatus)
│   ├── Repo.entity.ts
│   ├── PullRequest.entity.ts
│   ├── ReviewRun.entity.ts
│   ├── Finding.entity.ts
│   └── ReviewPost.entity.ts
├── migrations/
│   └── 1711000000000-InitialSchema.ts
├── middleware/
│   ├── auth.middleware.ts      # JWT verification, cookie parsing
│   └── error.middleware.ts     # Global error handler
├── routes/
│   ├── auth.routes.ts
│   ├── repo.routes.ts
│   ├── pr.routes.ts
│   ├── run.routes.ts
│   ├── finding.routes.ts
│   └── webhook.routes.ts
├── services/
│   ├── auth.service.ts         # Secret generation, JWT signing, verification
│   ├── github-client.ts        # GitHub REST API wrapper (PAT-based)
│   ├── sync.service.ts         # PR sync from GitHub, stack detection
│   ├── webhook.service.ts      # Webhook event processing
│   ├── context-pack.service.ts # Assembles review input (diff, rules, stack, business context)
│   ├── review-runner.service.ts # CLI invocation, queue, retry logic
│   ├── output-parser.ts        # Zod validation, findings extraction
│   ├── risk-engine.ts          # Deterministic path-based risk signals
│   └── posting.service.ts      # GitHub review creation, self-review export
├── lib/
│   ├── encryption.ts           # AES-256-GCM encrypt/decrypt for PAT
│   ├── logger.ts               # Pino logger setup
│   └── errors.ts               # AppError class
└── __tests__/
    ├── lib/
    │   ├── encryption.test.ts
    │   └── output-parser.test.ts
    ├── services/
    │   ├── auth.service.test.ts
    │   ├── risk-engine.test.ts
    │   ├── sync.service.test.ts
    │   └── posting.service.test.ts
    └── routes/
        ├── auth.routes.test.ts
        └── finding.routes.test.ts
```

### Frontend (`frontend/`)

```
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── router.tsx               # TanStack Router setup
│   ├── routeTree.gen.ts         # Auto-generated
│   ├── styles/
│   │   └── global.css           # Tailwind imports, dark theme vars
│   ├── api/
│   │   ├── client.ts            # Fetch wrapper with cookie auth
│   │   ├── queries/
│   │   │   ├── repos.ts
│   │   │   ├── prs.ts
│   │   │   ├── runs.ts
│   │   │   └── findings.ts
│   │   └── mutations/
│   │       ├── auth.ts
│   │       ├── findings.ts
│   │       ├── runs.ts
│   │       └── repos.ts
│   ├── routes/
│   │   ├── __root.tsx           # Root layout with QueryClient
│   │   ├── _authed.tsx          # Auth guard layout
│   │   ├── _authed/
│   │   │   ├── index.tsx        # Inbox page
│   │   │   ├── pr.$id.tsx       # PR detail
│   │   │   ├── run.$id.tsx      # Run page (core decision surface)
│   │   │   └── settings.tsx     # Settings
│   │   └── login.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   └── app-shell.tsx
│   │   ├── inbox/
│   │   │   ├── pr-table.tsx
│   │   │   └── stack-group.tsx
│   │   ├── run/
│   │   │   ├── review-brief.tsx
│   │   │   ├── finding-card.tsx
│   │   │   ├── finding-list.tsx
│   │   │   ├── finding-editor.tsx
│   │   │   ├── bulk-actions.tsx
│   │   │   ├── post-bar.tsx
│   │   │   └── stale-banner.tsx
│   │   └── common/
│   │       ├── severity-badge.tsx
│   │       ├── status-badge.tsx
│   │       └── code-block.tsx
│   └── lib/
│       └── utils.ts
```

---

## Task 1: Project Init — git, package.json, configs (CORE-347)

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `docker-compose.yml`, `env.default`, `.gitignore`, `.nvmrc`, `vitest.config.ts`, `src/index.ts`, `src/config.ts`, `src/lib/logger.ts`, `src/lib/errors.ts`, `CLAUDE.md`

- [ ] **Step 1: Initialize git and npm**

```bash
cd /Users/rabi/code/quidkey/services/pipe
git init
npm init -y
```

- [ ] **Step 2: Create .nvmrc**

```
22
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.env
repos/
.superpowers/
*.log
frontend/dist/
frontend/node_modules/
```

- [ ] **Step 4: Install backend dependencies**

```bash
npm install express typeorm pg reflect-metadata jsonwebtoken zod pino pino-pretty cookie-parser cors
npm install -D typescript @types/express @types/jsonwebtoken @types/cookie-parser @types/cors @swc/core @swc/cli vitest @types/node tsx
```

- [ ] **Step 5: Create tsconfig.json**

Match quidkey-core pattern with strict mode:

```json
{
  "compilerOptions": {
    "lib": ["es2023"],
    "target": "es2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "strict": true,
    "strictNullChecks": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "frontend"]
}
```

- [ ] **Step 6: Create biome.json**

Match quidkey-console pattern:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.11/schema.json",
  "files": {
    "ignoreUnknown": true,
    "includes": ["src/**", "!node_modules/**", "!dist/**"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always",
      "arrowParentheses": "asNeeded"
    }
  }
}
```

- [ ] **Step 7: Create docker-compose.yml**

```yaml
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: pipe
      POSTGRES_PASSWORD: pipe
      POSTGRES_DB: pipe
    ports:
      - "5433:5432"
    volumes:
      - pipe_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pipe -d pipe"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pipe_pgdata:
```

- [ ] **Step 8: Create env.default**

```
DATABASE_URL=postgres://pipe:pipe@localhost:5433/pipe
JWT_SECRET=dev-jwt-secret-change-in-production
PIPE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
PIPE_REPOS_DIR=./repos
PIPE_PORT=3100
NODE_ENV=development
```

- [ ] **Step 9: Create src/config.ts**

Zod-validated config loading from env vars:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.coerce.number().default(3100),
  databaseUrl: z.string(),
  jwtSecret: z.string().min(16),
  encryptionKey: z.string().length(64, 'PIPE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  reposDir: z.string().default('./repos'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env.PIPE_PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.PIPE_ENCRYPTION_KEY,
    reposDir: process.env.PIPE_REPOS_DIR,
    nodeEnv: process.env.NODE_ENV,
  });
}
```

- [ ] **Step 10: Create src/lib/logger.ts**

```typescript
import pino from 'pino';

export const logger = pino({
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

- [ ] **Step 11: Create src/lib/errors.ts**

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 12: Create src/index.ts** (minimal Express app)

```typescript
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
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(config.port, () => {
  logger.info(`Pipe API listening on port ${config.port}`);
});

export { app };
```

- [ ] **Step 13: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 14: Update package.json scripts**

Add to package.json:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:op": "op run --no-masking --env-file=env.default --env-file=.env -- npm run dev",
    "build": "npx swc src -d dist --strip-leading-paths",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "npx @biomejs/biome lint src",
    "lint:fix": "npx @biomejs/biome lint --write src",
    "format": "npx @biomejs/biome format --write src",
    "format:check": "npx @biomejs/biome format src",
    "migration:run": "npx typeorm migration:run -d src/db/data-source.ts",
    "migration:revert": "npx typeorm migration:revert -d src/db/data-source.ts",
    "migration:generate": "npx typeorm migration:generate -d src/db/data-source.ts"
  }
}
```

- [ ] **Step 15: Verify setup works**

```bash
docker compose up -d
npm run typecheck
npm run dev  # Should start on port 3100
# In another terminal: curl http://localhost:3100/api/health should return {"status":"ok"}
```

- [ ] **Step 16: Create CLAUDE.md**

Write project-specific guidance for Claude Code (conventions, patterns, how to test, etc.). Include: Express+TypeORM patterns, entity conventions, file organization, testing approach, env var management, the review pipeline concept.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "feat: initialize Pipe project with Express, TypeORM, Vitest, Docker Compose"
```

---

## Task 2: Database Entities & Migration (CORE-348)

**Files:**
- Create: `src/entities/enums.ts`, `src/entities/Repo.entity.ts`, `src/entities/PullRequest.entity.ts`, `src/entities/ReviewRun.entity.ts`, `src/entities/Finding.entity.ts`, `src/entities/ReviewPost.entity.ts`, `src/db/data-source.ts`, `src/lib/encryption.ts`, `src/migrations/1711000000000-InitialSchema.ts`
- Test: `src/__tests__/lib/encryption.test.ts`

- [ ] **Step 1: Write encryption tests**

File: `src/__tests__/lib/encryption.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../../lib/encryption';

describe('encryption', () => {
  beforeAll(() => {
    process.env.PIPE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips a string', () => {
    const plaintext = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const plaintext = 'test-token';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const tampered = encrypted.slice(0, -4) + 'xxxx';
    expect(() => decrypt(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/lib/encryption.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement encryption utility**

File: `src/lib/encryption.ts`

```typescript
import crypto from 'crypto';

function getKey(): Buffer {
  const hex = process.env.PIPE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('PIPE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final('utf8');
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npm test -- src/__tests__/lib/encryption.test.ts
```

- [ ] **Step 5: Create shared enums**

File: `src/entities/enums.ts`

```typescript
export enum PrStatus {
  Open = 'open',
  Closed = 'closed',
  Merged = 'merged',
}

export enum RunStatus {
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Partial = 'partial',
}

export enum FindingSeverity {
  Critical = 'critical',
  Warning = 'warning',
  Suggestion = 'suggestion',
  Nitpick = 'nitpick',
}

export enum FindingStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Edited = 'edited',
  Posted = 'posted',
}
```

- [ ] **Step 6: Create all 5 entities**

Create each entity file following quidkey-core patterns (UUID PK, @CreateDateColumn, @UpdateDateColumn, proper indexes, enum columns, jsonb columns). Reference the design spec Data Model section and CORE-348 ticket for exact columns, types, constraints, and indexes.

Files:
- `src/entities/Repo.entity.ts` — UNIQUE(github_owner, github_name)
- `src/entities/PullRequest.entity.ts` — UNIQUE(repo_id, github_pr_number), INDEX(repo_id, status), INDEX(stack_id), ManyToOne Repo
- `src/entities/ReviewRun.entity.ts` — INDEX(pr_id, created_at DESC), ManyToOne PullRequest
- `src/entities/Finding.entity.ts` — INDEX(run_id, toolkit_order), INDEX(run_id, status), ManyToOne ReviewRun
- `src/entities/ReviewPost.entity.ts` — UNIQUE(run_id), ManyToOne ReviewRun

- [ ] **Step 7: Create TypeORM DataSource**

File: `src/db/data-source.ts`

```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Repo } from '../entities/Repo.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Repo, PullRequest, ReviewRun, Finding, ReviewPost],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: ['error', 'warn'],
});
```

- [ ] **Step 8: Generate and review migration**

```bash
npx typeorm migration:generate src/migrations/InitialSchema -d src/db/data-source.ts
```

Review the generated migration. Ensure it creates all tables with correct columns, constraints, indexes, and enums.

- [ ] **Step 9: Run migration**

```bash
npm run migration:run
```

Verify all tables exist: `docker exec pipe-db-1 psql -U pipe -d pipe -c '\dt'`

- [ ] **Step 10: Update src/index.ts to initialize database**

Add `AppDataSource.initialize()` before server listen. Log success/failure.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add database entities, migration, and encryption utility"
```

---

## Task 3: Auth — Shared Secret + JWT (CORE-349)

**Files:**
- Create: `src/services/auth.service.ts`, `src/middleware/auth.middleware.ts`, `src/middleware/error.middleware.ts`, `src/routes/auth.routes.ts`
- Test: `src/__tests__/services/auth.service.test.ts`

- [ ] **Step 1: Write auth service tests**

Test: secret generation + persistence to `.pipe-secret` file, JWT sign/verify, secret validation. Use a temp directory for the secret file in tests.

- [ ] **Step 2: Run tests — fail**

- [ ] **Step 3: Implement AuthService**

File: `src/services/auth.service.ts`
- `initSecret(reposDir)` — read from `{reposDir}/.pipe-secret` or generate via `crypto.randomBytes(16).toString('hex')` + persist + log
- `validateSecret(input)` — constant-time compare with stored secret using `crypto.timingSafeEqual`
- `signToken()` — JWT with 7-day expiry using `JWT_SECRET`
- `verifyToken(token)` — verify JWT, return payload or throw

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Create auth middleware**

File: `src/middleware/auth.middleware.ts`
- `authMiddleware` — read `pipe_session` cookie, verify JWT via AuthService, 401 if invalid
- `webhookAuthMiddleware` — verify `X-Hub-Signature-256` header with HMAC-SHA256 against repo's webhook_secret. Look up repo by matching webhook path or iterate repos.

- [ ] **Step 6: Create error middleware**

File: `src/middleware/error.middleware.ts`
- Global Express error handler: log with pino, check for AppError instances, return `{ error: message, code }`, default to 500 for unknown

- [ ] **Step 7: Create auth routes**

File: `src/routes/auth.routes.ts`
- `POST /api/auth/login` — validate secret, set httpOnly cookie (`pipe_session`, maxAge 7 days, sameSite lax, secure in production)
- `POST /api/auth/logout` — clear cookie
- `GET /api/auth/me` — return `{ authenticated: true }` (auth middleware applied)

- [ ] **Step 8: Mount routes in index.ts**

Mount auth routes (login exempt from auth middleware), apply auth middleware to all other `/api/*` routes, apply error middleware last. Call `AuthService.initSecret()` on startup.

- [ ] **Step 9: Manual test**

```bash
npm run dev
# Observe: "Auth secret: <hex>" logged to console
curl -X POST http://localhost:3100/api/auth/login -H 'Content-Type: application/json' -d '{"secret":"<hex>"}'
# Should return 200 with Set-Cookie header
curl http://localhost:3100/api/auth/me -b 'pipe_session=<jwt from cookie>'
# Should return {"authenticated":true}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add shared secret auth with JWT sessions"
```

---

## Task 4: GitHub Client & Repo Management (CORE-350 — Part 1)

**Files:**
- Create: `src/services/github-client.ts`, `src/routes/repo.routes.ts`

- [ ] **Step 1: Implement GitHub API client**

File: `src/services/github-client.ts`

Class-based wrapper using native `fetch`. Constructor takes a decrypted PAT. Methods:
- `listOpenPRs(owner, repo)` — `GET /repos/:owner/:repo/pulls?state=open`
- `getPR(owner, repo, number)` — `GET /repos/:owner/:repo/pulls/:number`
- `getPRDiff(owner, repo, number)` — same endpoint with `Accept: application/vnd.github.v3.diff` header
- `getPRFiles(owner, repo, number)` — `GET /repos/:owner/:repo/pulls/:number/files`
- `createReview(owner, repo, number, body)` — `POST /repos/:owner/:repo/pulls/:number/reviews`

Include `User-Agent: pipe/0.1` and `Authorization: Bearer <pat>` headers. Log rate limit headers via pino.

- [ ] **Step 2: Create repo routes**

File: `src/routes/repo.routes.ts`
- `GET /api/repos` — list all repos (decrypt PAT not included in response)
- `POST /api/repos` — body: `{ github_owner, github_name, pat, webhook_secret }`. Encrypt PAT, generate webhook_secret if not provided, save.
- `PATCH /api/repos/:id` — update auto_trigger_on_open, pat (re-encrypt), webhook_secret
- `DELETE /api/repos/:id` — soft delete or hard delete with cascade

- [ ] **Step 3: Mount routes, test manually**

```bash
curl -X POST http://localhost:3100/api/repos -b 'pipe_session=<jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"github_owner":"quidkey","github_name":"quidkey-core","pat":"ghp_xxx","webhook_secret":"test"}'
curl http://localhost:3100/api/repos -b 'pipe_session=<jwt>'
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add GitHub API client and repo management routes"
```

---

## Task 5: PR Sync & Webhook Service (CORE-350 — Part 2)

**Files:**
- Create: `src/services/sync.service.ts`, `src/services/webhook.service.ts`, `src/routes/webhook.routes.ts`, `src/routes/pr.routes.ts`
- Test: `src/__tests__/services/sync.service.test.ts`

- [ ] **Step 1: Write sync service tests**

Test: Linear ticket extraction from branch names (`rabi/core-558-add-feature` -> `CORE-558`), stack detection (base_branch != main -> stacked), stack_id computation.

- [ ] **Step 2: Implement SyncService**

File: `src/services/sync.service.ts`
- `syncRepo(repoId)` — fetch all open PRs from GitHub, upsert PR records
- `extractLinearTicket(branchName, description)` — regex `/([A-Z]+-\d+)/`
- `detectStacks(pullRequests)` — group by base branch chains, compute stack_id (deterministic from root branch), stack_position, stack_size

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Implement WebhookService**

File: `src/services/webhook.service.ts`
- `handleEvent(event, payload)` — dispatch to PR open/sync/close handlers
- On `pull_request.opened` / `pull_request.synchronize` — upsert PR, extract ticket, detect stack
- On `pull_request.closed` — update status to closed/merged
- On open + auto_trigger — enqueue review (calls ReviewRunner, implemented in Task 8)

- [ ] **Step 5: Create webhook routes**

File: `src/routes/webhook.routes.ts`
- `POST /api/webhooks/github` — verify signature via webhookAuthMiddleware, parse event type from `X-GitHub-Event` header, dispatch to WebhookService

**Important:** Must use `express.raw({ type: 'application/json' })` for the webhook route to get the raw body for signature verification, then parse JSON manually.

- [ ] **Step 6: Create PR routes**

File: `src/routes/pr.routes.ts`
- `GET /api/prs` — list PRs with filters (status, repo_id, filter=needs_review|in_progress|completed), include latest_run with finding counts via a subquery or leftJoin
- `GET /api/prs/:id` — PR detail with run history
- `GET /api/prs/:id/stack` — sibling PRs in same stack
- `POST /api/repos/:id/sync` — trigger sync (add to repo routes or here)

- [ ] **Step 7: Mount all routes, test with real GitHub repo**

```bash
# Add a test repo
curl -X POST http://localhost:3100/api/repos -b 'pipe_session=<jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"github_owner":"quidkey","github_name":"quidkey-core","pat":"ghp_xxx","webhook_secret":"test"}'
# Sync PRs
curl -X POST http://localhost:3100/api/repos/<id>/sync -b 'pipe_session=<jwt>'
# List PRs
curl http://localhost:3100/api/prs -b 'pipe_session=<jwt>'
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add PR sync, webhook handler, and PR listing routes"
```

---

## Task 6: Context Pack Builder (CORE-351)

**Files:**
- Create: `src/services/context-pack.service.ts`

- [ ] **Step 1: Implement ContextPackBuilder**

File: `src/services/context-pack.service.ts`

Methods:
- `buildContextPack(reviewRun)` — orchestrates all steps:
  1. `fetchDiff(repo, prNumber)` — via GitHub client, truncate to 3000 lines with warning flag
  2. `fetchChangedFiles(repo, prNumber)` — file list from GitHub
  3. `ensureRepoCloned(repo)` — use `execFile` (not exec) for `git clone` or `git fetch` + `git checkout` in `PIPE_REPOS_DIR/{owner}/{name}`. Pass PAT in clone URL for private repos: `https://x-access-token:{pat}@github.com/{owner}/{name}.git`
  4. `discoverRules(repoPath, changedFiles)` — walk changed paths to find CLAUDE.md, AGENTS.md at repo root and in parent directories of changed files, `.cursor/rules/*.mdc`, `.review/rules/`
  5. `fetchStackContext(pr)` — if PR has stack_id, find parent PR (stack_position - 1) and child PR (stack_position + 1), fetch their diffs
  6. Build and return ContextPack object

```typescript
interface ContextPack {
  diff: string;
  diffTruncated: boolean;
  changedFiles: string[];
  rules: Array<{ path: string; content: string }>;
  parentDiff: string | null;
  childDiff: string | null;
  linearTicketId: string | null;
  notionUrl: string | null;
}
```

- [ ] **Step 2: Test with a real repo**

Manually trigger against quidkey-core to verify diff fetching, rule discovery, and git operations work.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add context pack builder for review input assembly"
```

---

## Task 7: Risk Engine (CORE-353)

**Files:**
- Create: `src/services/risk-engine.ts`
- Test: `src/__tests__/services/risk-engine.test.ts`

- [ ] **Step 1: Write risk engine tests**

Test each signal pattern against sample file paths from quidkey-core:
- `src/entities/auth/AuthSession.entity.ts` — auth signal
- `src/migrations/1234-AddTable.ts` — migration signal
- `src/routes/payoutRoutes.ts` — money movement + public API signals
- Changed `src/services/foo.ts` without `src/__tests__/services/foo.test.ts` — missing tests
- Test overall risk computation: any high = high, else medium, else low

- [ ] **Step 2: Run tests — fail**

- [ ] **Step 3: Implement RiskEngine**

File: `src/services/risk-engine.ts`

```typescript
interface RiskSignal {
  name: string;
  level: 'high' | 'medium' | 'low';
  matched_paths: string[];
}

interface RiskAnalysis {
  overall_risk: 'high' | 'medium' | 'low';
  signals: RiskSignal[];
}

export function analyzeRisk(changedFiles: string[], diffLineCount: number): RiskAnalysis {
  // Pattern matching implementation — see CORE-353 ticket for full signal table
}
```

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add deterministic risk engine with path-based signals"
```

---

## Task 8: Review Runner & Output Parser (CORE-352)

**Files:**
- Create: `src/services/review-runner.service.ts`, `src/services/output-parser.ts`
- Test: `src/__tests__/lib/output-parser.test.ts`

- [ ] **Step 1: Write output parser tests**

Test Zod schema validation with valid output, partial output (brief ok but some findings invalid), and completely invalid JSON. Test deduplication logic.

- [ ] **Step 2: Run tests — fail**

- [ ] **Step 3: Implement OutputParser**

File: `src/services/output-parser.ts`

Define Zod schemas (BriefSchema, FindingSchema, ToolkitOutputSchema) matching the CORE-352 ticket definitions. Implement `parseToolkitOutput(rawJson: string)` returning `{ brief, findings, parseErrors }`.

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Implement ReviewRunner**

File: `src/services/review-runner.service.ts`

- `ReviewQueue` class with in-memory FIFO queue
- `enqueueRun(runId)` — add to queue, process if idle
- `processRun(runId)`:
  1. Update status to `running`, set `started_at`
  2. Build context pack via ContextPackBuilder
  3. Run risk engine on changed files (store immediately — available even if CLI fails)
  4. Spawn CLI via `execFile('claude', ['--print', '--output-format', 'json', '--prompt', prompt])` with 5min timeout
  5. Parse output via OutputParser
  6. Store brief + create Finding records
  7. Update status to `completed` (or `partial`/`failed`)
  8. Process next in queue
- Prompt template: see CORE-352 ticket for the full template
- Retry: up to 3 attempts with 5s delay between, using setTimeout

- [ ] **Step 6: Create run routes**

File: `src/routes/run.routes.ts`
- `POST /api/prs/:id/runs` — create ReviewRun record (status: queued), enqueue via ReviewQueue, return `{ id, status }`. Accept optional `{ is_self_review: boolean }`.
- `GET /api/runs/:id` — return run with brief, risk_signals, status, PR info (including head_sha for stale check), post info if exists

- [ ] **Step 7: Test full pipeline manually**

```bash
# Trigger a run against a real PR
curl -X POST http://localhost:3100/api/prs/<id>/runs -b 'pipe_session=<jwt>'
# Poll for completion (3s interval)
watch -n 3 'curl -s http://localhost:3100/api/runs/<id> -b "pipe_session=<jwt>" | jq .status'
# When completed, check findings
curl http://localhost:3100/api/runs/<id>/findings -b 'pipe_session=<jwt>'
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add review runner with CLI adapter, output parser, and run routes"
```

---

## Task 9: Findings API (CORE-355)

**Files:**
- Create: `src/routes/finding.routes.ts`
- Test: `src/__tests__/routes/finding.routes.test.ts`

- [ ] **Step 1: Write finding route tests**

Test: PATCH accept/reject/edit with correct status transitions, bulk reject nitpicks, cannot modify posted findings (400), listing with filters returns correct counts.

- [ ] **Step 2: Run tests — fail**

- [ ] **Step 3: Implement finding routes**

File: `src/routes/finding.routes.ts`
- `GET /api/runs/:id/findings` — list with query param filters (?severity, ?status, ?file_path), ordered by toolkit_order, return findings array + counts object
- `PATCH /api/findings/:id` — validate status transitions (posted is final), require edited_body for edited status
- `POST /api/runs/:id/findings/bulk` — accept body with `{ action, filter?, ids? }`, apply to matching findings, skip posted ones

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add findings triage API with bulk actions"
```

---

## Task 10: Posting Service (CORE-354)

**Files:**
- Create: `src/services/posting.service.ts`
- Test: `src/__tests__/services/posting.service.test.ts`

- [ ] **Step 1: Write posting service tests**

Test: SHA mismatch returns stale error, accepted findings mapped to GitHub review comment format correctly, self-review export generates valid markdown checklist with checkbox items grouped by severity.

- [ ] **Step 2: Run tests — fail**

- [ ] **Step 3: Implement PostingService**

File: `src/services/posting.service.ts`
- `postToGitHub(runId)`:
  1. Load run + PR + repo
  2. Fetch current PR SHA from GitHub, compare with run's head_sha
  3. If mismatch — throw AppError(409, 'stale')
  4. Collect accepted/edited findings
  5. Build review body: each finding becomes an inline comment with `path`, `line`, `side: "RIGHT"`, formatted body
  6. POST to GitHub reviews API
  7. Create ReviewPost record, update finding statuses to posted
  8. Handle partial failures (some comments rejected by GitHub)
- `exportFindings(runId)`:
  1. Collect accepted/edited findings
  2. Generate markdown checklist grouped by severity
  3. Return markdown string

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Add posting routes**

Add to `src/routes/run.routes.ts`:
- `POST /api/runs/:id/post` — PostingService.postToGitHub
- `POST /api/runs/:id/export` — PostingService.exportFindings, return `{ markdown }`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add posting service for GitHub reviews and self-review export"
```

---

## Task 11: Frontend Setup (CORE-356)

**Files:**
- Create: entire `frontend/` directory

- [ ] **Step 1: Scaffold frontend**

```bash
cd /Users/rabi/code/quidkey/services/pipe
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @tanstack/react-router @tanstack/react-query
npm install react-markdown remark-gfm react-syntax-highlighter
npm install -D @types/react-syntax-highlighter tailwindcss @tailwindcss/vite @tanstack/router-plugin
```

- [ ] **Step 2: Configure Vite with API proxy and TanStack Router plugin**

File: `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Set up Tailwind CSS 4 with dark theme**

File: `frontend/src/styles/global.css`

```css
@import 'tailwindcss';

:root {
  color-scheme: dark;
}

body {
  @apply bg-gray-950 text-gray-200;
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 4: Create API client**

File: `frontend/src/api/client.ts`

Fetch wrapper with `credentials: 'include'` for cookie auth. Methods: `get<T>`, `post<T>`, `patch<T>`, `del`. On 401 response, redirect to `/login`.

- [ ] **Step 5: Set up TanStack Router with routes**

Create route files:
- `frontend/src/routes/__root.tsx` — QueryClientProvider wrapper
- `frontend/src/routes/_authed.tsx` — auth guard: `beforeLoad` calls `GET /api/auth/me`, redirects to `/login` on 401
- `frontend/src/routes/login.tsx` — login page

- [ ] **Step 6: Create app shell component**

File: `frontend/src/components/layout/app-shell.tsx`

Dark nav bar: Pipe logo (links to /), "Inbox" nav link, "Settings" nav link. Children rendered below. Matches the wireframe aesthetic.

- [ ] **Step 7: Create login page**

Single input for shared secret, submit calls `POST /api/auth/login`, on success navigate to `/`. Show error on invalid secret.

- [ ] **Step 8: Verify frontend works**

```bash
# Terminal 1: API
cd /Users/rabi/code/quidkey/services/pipe && npm run dev
# Terminal 2: Frontend
cd /Users/rabi/code/quidkey/services/pipe/frontend && npm run dev
# Open http://localhost:5173 — should see login, enter secret, redirect to empty page
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add frontend SPA with Vite, React, TanStack Router, Tailwind"
```

---

## Task 12: Frontend — Inbox Page (CORE-357)

**Files:**
- Create: `frontend/src/routes/_authed/index.tsx`, `frontend/src/components/inbox/pr-table.tsx`, `frontend/src/components/inbox/stack-group.tsx`, `frontend/src/api/queries/prs.ts`, `frontend/src/api/mutations/runs.ts`, `frontend/src/components/common/severity-badge.tsx`, `frontend/src/components/common/status-badge.tsx`

- [ ] **Step 1: Create TanStack Query hooks for PRs**

File: `frontend/src/api/queries/prs.ts` — `usePullRequests(filters)` with refetchOnWindowFocus.

- [ ] **Step 2: Create run mutation hook**

File: `frontend/src/api/mutations/runs.ts` — `useCreateRun()` POST /api/prs/:id/runs, invalidate PR queries on success.

- [ ] **Step 3: Create common badge components**

Severity badge (color-coded: critical=red, warning=yellow, suggestion=blue, nitpick=gray), status badge (run status, review status).

- [ ] **Step 4: Create stack group component**

Collapsible header showing stack info, position indicators, indented child PRs.

- [ ] **Step 5: Create PR table component**

Full table with: PR title, author, repo badge, stack indicator, run status, finding count, relative time. Stack grouping. Risk highlighting. Self-review "SELF" badge. Inline "Run Review" button.

- [ ] **Step 6: Create inbox page**

Filter tabs (Needs Review / In Progress / Completed / All with counts), repo dropdown, PR table. Empty states: no repos, no PRs, no reviews.

- [ ] **Step 7: Test with real data**

Verify: PRs render from synced repo, stacks group correctly, filters work, "Run Review" button triggers a run.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add inbox page with PR table and stack grouping"
```

---

## Task 13: Frontend — Run Page (CORE-358)

**Files:**
- Create: `frontend/src/routes/_authed/run.$id.tsx`, `frontend/src/components/run/review-brief.tsx`, `frontend/src/components/run/finding-card.tsx`, `frontend/src/components/run/finding-list.tsx`, `frontend/src/components/run/finding-editor.tsx`, `frontend/src/components/run/bulk-actions.tsx`, `frontend/src/components/run/post-bar.tsx`, `frontend/src/components/run/stale-banner.tsx`, `frontend/src/api/queries/runs.ts`, `frontend/src/api/queries/findings.ts`, `frontend/src/api/mutations/findings.ts`, `frontend/src/components/common/code-block.tsx`

- [ ] **Step 1: Create query/mutation hooks**

- `useRun(id)` — polls every 3s while status is queued/running
- `useFindings(runId)` — fetches findings list with counts
- `useUpdateFinding()` — PATCH single finding
- `useBulkAction(runId)` — POST bulk action
- `usePostToGithub(runId)` — POST to GitHub
- `useExportFindings(runId)` — POST export

- [ ] **Step 2: Create review brief component**

Risk signal badges (color by level) + toolkit summary sections (critical issues, important issues, suggestions, strengths, recommended actions). Each section collapsible.

- [ ] **Step 3: Create code block component**

Syntax-highlighted code using react-syntax-highlighter with a dark theme (e.g., `oneDark`).

- [ ] **Step 4: Create finding card component**

Severity badge, confidence score, line reference, body rendered via react-markdown, collapsible suggested fix (code block), rule ref. Action buttons: Accept (green), Reject (gray), Edit. Three visual states: pending (full), accepted (green left border, dimmed), rejected (very dimmed).

- [ ] **Step 5: Create finding editor component**

Inline textarea replacing the body content. Pre-filled with current body. Save (calls PATCH with edited_body) and Cancel buttons.

- [ ] **Step 6: Create finding list component**

Group findings by file_path. Render file path header + finding cards. Track focused finding index in state for keyboard navigation. Scroll focused finding into view.

- [ ] **Step 7: Create stale banner and post bar**

Stale banner: red warning when SHA mismatch, "Re-run Review" button.
Post bar: sticky bottom, live counts, pending warning, "Reject Nitpicks", "Accept All", primary "Post to GitHub" / "Export Findings" with confirmation dialog.

- [ ] **Step 8: Assemble run page with keyboard shortcuts**

Wire all components together. Add `useEffect` keydown listener: j/k navigate, a/r/e accept/reject/edit focused, Shift+R bulk reject nitpicks, Shift+P post/export. Disable shortcuts when editor textarea is focused. Show spinner/polling while run in progress. Read-only posted state. Stale detection comparing run SHA vs PR current SHA.

- [ ] **Step 9: Test full flow**

Run a review, open run page, triage with keyboard and mouse, post to GitHub, verify inline comments appear on the PR in GitHub.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add run page with findings triage, keyboard shortcuts, and posting"
```

---

## Task 14: Frontend — PR Detail & Settings (CORE-359)

**Files:**
- Create: `frontend/src/routes/_authed/pr.$id.tsx`, `frontend/src/routes/_authed/settings.tsx`, `frontend/src/api/queries/repos.ts`, `frontend/src/api/mutations/repos.ts`

- [ ] **Step 1: Create repo query/mutation hooks**

`useRepos()`, `useCreateRepo()`, `useUpdateRepo()`, `useDeleteRepo()`, `useSyncRepo()`.

- [ ] **Step 2: Create settings page**

Connected repos list with auto_trigger toggle per repo. Add repo form: github_owner, github_name, PAT (password input), webhook_secret. "Sync PRs" button per repo. Display webhook URL: `{window.location.origin}/api/webhooks/github` for easy copy.

- [ ] **Step 3: Create PR detail page**

PR metadata (title, author, branch, base, status, Linear ticket link). Stack context with links to sibling PRs. Run history table (date, status, finding counts). "Run Review" button with self-review checkbox.

- [ ] **Step 4: Test pages**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PR detail and settings pages"
```

---

## Task 15: E2E Integration & Polish (CORE-360)

**Files:**
- Modify: `src/index.ts` (finalize static serving), `package.json` (top-level dev script)

- [ ] **Step 1: Add concurrently for dev script**

```bash
npm install -D concurrently
```

Update root package.json scripts:
```json
{
  "dev": "concurrently -n api,ui -c blue,green \"npm run dev:api\" \"npm run dev:ui\"",
  "dev:api": "tsx watch src/index.ts",
  "dev:ui": "cd frontend && npm run dev",
  "build": "npm run build:api && npm run build:ui",
  "build:api": "npx swc src -d dist --strip-leading-paths",
  "build:ui": "cd frontend && npm run build"
}
```

- [ ] **Step 2: Finalize static file serving in API**

Ensure `src/index.ts` serves `frontend/dist/` for non-API routes. The SPA catch-all (`*` route) must come AFTER all `/api/*` routes.

- [ ] **Step 3: Full E2E smoke test**

Run through the complete flow:
1. `docker compose up -d` (Postgres)
2. `npm run dev` (starts both API and frontend)
3. Open UI at localhost:5173 → login with secret from console
4. Settings → add quidkey-core repo with PAT
5. Click "Sync PRs" → verify inbox populates
6. Verify stacked PRs grouped correctly
7. Click "Run Review" on a PR → watch for completion (polling)
8. Open run page → review brief shows risk signals + toolkit summary
9. Triage findings: accept critical, reject nitpicks (keyboard + mouse)
10. Edit one finding
11. Click "Post to GitHub" → verify comments appear on the PR
12. Run self-review on own PR → export findings → verify markdown output
13. Push a commit to the PR → revisit run page → verify stale banner appears

- [ ] **Step 4: Error handling verification**

- Disconnect internet → trigger run → verify timeout + retry + error display
- Send invalid webhook signature → verify 401 rejection
- Try posting to stale PR → verify 409 and stale banner

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: add E2E integration, dev scripts, and static file serving"
```

---

## Implementation Order Summary

```
Task 1:  Project Setup (CORE-347)           ← START HERE
Task 2:  Database Entities (CORE-348)        ← blocked by 1
Task 3:  Auth (CORE-349)                     ← blocked by 1
Task 4:  GitHub Client + Repos (CORE-350.1)  ← blocked by 2, 3
Task 5:  PR Sync + Webhooks (CORE-350.2)     ← blocked by 4
Task 6:  Context Pack Builder (CORE-351)     ← blocked by 5
Task 7:  Risk Engine (CORE-353)              ← blocked by 6 (can parallelize with 8)
Task 8:  Review Runner (CORE-352)            ← blocked by 6 (can parallelize with 7)
Task 9:  Findings API (CORE-355)             ← blocked by 2
Task 10: Posting Service (CORE-354)          ← blocked by 8, 9
Task 11: Frontend Setup (CORE-356)           ← blocked by 1 (can parallelize with backend)
Task 12: Inbox Page (CORE-357)               ← blocked by 11, 5
Task 13: Run Page (CORE-358)                 ← blocked by 11, 9
Task 14: PR Detail + Settings (CORE-359)     ← blocked by 11, 5
Task 15: E2E Integration (CORE-360)          ← blocked by all above
```

**Parallel tracks after Task 1:**
- **Backend track:** Tasks 2 → 3 → 4 → 5 → 6 → 7+8 (parallel) → 9 → 10
- **Frontend track:** Task 11 → 12+13+14 (parallel, once backend APIs exist)
- **Final:** Task 15 (after both tracks complete)
