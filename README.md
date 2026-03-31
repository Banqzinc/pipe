# Pipe

Self-hosted AI code review tool. Pipe watches your GitHub PRs and runs automated reviews with risk analysis and contextual feedback, powered by Claude.

## Prerequisites

- **Node.js 22** (see `.nvmrc`)
- **Docker** — runs PostgreSQL locally
- **1Password CLI (`op`)** — resolves secrets in dev (optional for self-hosters)
- **GitHub CLI (`gh`)** — used by `pipe repo add` to list repos and create webhooks
- **Claude CLI** — the review engine that performs code analysis

## Quick Start (with 1Password)

This is the default team flow. All secrets are resolved automatically from 1Password.

```bash
# Start PostgreSQL on port 5433
docker compose up -d

# Install dependencies
npm install && cd frontend && npm install && cd ..

# Start dev server (runs migrations, then API + UI concurrently)
npm run dev
```

`npm run dev` uses `op run` to expand `op://pipe_local/...` references in `env.default`. No `.env` file needed.

Open **http://localhost:5173** and sign in with Google.

## Quick Start (without 1Password)

For self-hosters or contributors without 1Password access.

```bash
# Start PostgreSQL on port 5433
docker compose up -d

# Create .env from the template
cp env.default .env
```

Edit `.env` and replace every `op://...` reference with an actual value:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://pipe:pipe@localhost:5433/pipe` |
| `JWT_SECRET` | Any string, min 16 characters |
| `PIPE_ENCRYPTION_KEY` | 64 hex characters (32 random bytes) |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID (see below) |
| `PIPE_ALLOWED_DOMAINS` | Comma-separated email domains, e.g. `mycompany.com` |

Generate an encryption key: `openssl rand -hex 32`

```bash
# Install dependencies
npm install && cd frontend && npm install && cd ..

# Start dev server (skips op run, uses .env directly)
npm run dev:exec
```

Open **http://localhost:5173**.

## Google OAuth Setup

Pipe uses Google OAuth for web authentication, restricted to specific email domains.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or use an existing one)
2. Navigate to **APIs & Services > OAuth consent screen** and configure it
3. Go to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID** (Web application type)
4. Add `http://localhost:5173` as an **Authorized JavaScript origin**
5. Copy the **Client ID** and set it as `GOOGLE_CLIENT_ID`
6. Set `PIPE_ALLOWED_DOMAINS` to a comma-separated list of allowed email domains (e.g. `mycompany.com,contractor.dev`)

Only users with verified emails on an allowed domain can sign in.

## Environment Variables

All variables are validated at startup via Zod in `src/config.ts`.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | *(required)* |
| `JWT_SECRET` | JWT signing secret (min 16 chars) | *(required)* |
| `PIPE_ENCRYPTION_KEY` | 64 hex chars (32 bytes) for encrypting stored PATs | *(required)* |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | *(required)* |
| `PIPE_ALLOWED_DOMAINS` | Comma-separated allowed email domains | *(required)* |
| `PIPE_REPOS_DIR` | Directory for cloned repos | `./repos` |
| `PIPE_PORT` | API server port | `3100` |
| `PIPE_ORIGIN` | Frontend origin for CORS | `http://localhost:5173` |
| `PIPE_API_KEY` | API key for CLI auth (min 16 chars) | *(optional)* |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` |

GitHub auth is handled by the `gh` CLI (`gh auth login`). Claude auth is handled by the Claude CLI.

## Adding a Repository

Use the Pipe CLI to connect GitHub repos:

```bash
# Configure the CLI with your Pipe server URL and API key
pipe login

# Add a repo — lists your GitHub repos, creates a webhook, registers with Pipe, syncs open PRs
pipe repo add

# Or specify directly
pipe repo add owner/name

# List connected repos
pipe repo list

# Remove a repo and clean up its webhook
pipe repo remove owner/name
```

`pipe repo add` creates a webhook on GitHub (for `pull_request` events, HMAC-SHA256 signed) and triggers an initial sync of open PRs.

## Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with 1Password secret resolution |
| `npm run dev:exec` | Start dev server without 1Password (uses `.env`) |
| `npm run build` | Compile API (SWC) and UI (Vite) |
| `npm start` | Run compiled API |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Lint with Biome |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format with Biome |
| `npm run format:check` | Check formatting |
| `npm run migration:run` | Run TypeORM migrations |
| `npm run migration:revert` | Revert last migration |
| `npm run migration:generate` | Generate migration from entity changes |

## Production Deployment

Pipe ships with a `Dockerfile` and `docker-compose.prod.yml` for production self-hosting. Any Docker-capable platform works (Coolify, Railway, bare VPS, etc.).

### Requirements

- A server with Docker installed (recommended: 4 vCPU, 8 GB RAM)
- A domain with DNS pointing to your server
- A [Claude Max subscription](https://claude.ai) (Pipe uses Claude CLI, not the API — no per-token cost)
- A GitHub fine-grained PAT with **Contents: Read** and **Pull Requests: Read & Write** on the repos you want to review
- A Google OAuth client ID (see [Google OAuth Setup](#google-oauth-setup))

### 1. Deploy with Docker Compose

```bash
git clone https://github.com/Banqzinc/pipe.git
cd pipe
```

Copy `docker-compose.prod.yml` and set the required environment variables (in your deployment platform or a `.env` file):

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgres://pipe:<password>@db:5432/pipe` |
| `JWT_SECRET` | Random string, min 16 characters |
| `PIPE_ENCRYPTION_KEY` | 64 hex characters (`openssl rand -hex 32`) |
| `PIPE_ORIGIN` | Your production URL, e.g. `https://pipe.yourdomain.com` |
| `PIPE_API_KEY` | API key for CLI auth (`openssl rand -base64 32`) |
| `GH_TOKEN` | GitHub fine-grained PAT (for `gh` CLI used during reviews) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `PIPE_ALLOWED_DOMAINS` | Comma-separated allowed email domains |
| `NODE_ENV` | `production` |

```bash
docker compose -f docker-compose.prod.yml up -d
```

Migrations run automatically on startup.

### 2. Authenticate Claude CLI (one-time)

Claude CLI uses your Claude Max subscription via OAuth — no API key needed.

```bash
docker exec -it <pipe-container> claude login
```

It prints a URL — open it in your browser, authenticate with your Claude Max account, and paste the code back. Auth tokens persist in the `claude_auth` Docker volume and auto-refresh.

### 3. Connect repositories

From your local machine (where `gh` is authenticated):

```bash
npm run build:cli
npx pipe login          # Enter your production URL and PIPE_API_KEY
npx pipe repo add       # Lists your GitHub repos, creates webhook, syncs PRs
```

This creates a webhook on GitHub (for `pull_request` events) so new PRs are automatically synced.

### Persistent Volumes

| Volume | Mount Path | Purpose |
|---|---|---|
| `claude_auth` | `/root/.claude` | Claude CLI OAuth tokens (survives restarts) |
| `pipe_repos` | `/app/repos` | Cloned repositories for review context |
| `pipe_pgdata` | PostgreSQL default | Database data |

### What's in the Docker image

The production image includes Node.js 22, Claude CLI, `git`, and `gh` CLI. Claude CLI is the review engine — it reads the cloned repo, analyzes diffs, and produces structured findings. The `gh` CLI is used by Claude during reviews to fetch PR diffs.

## Architecture

- **Backend:** Express + TypeORM + PostgreSQL
- **Frontend:** React + Vite + TanStack Router/Query + Tailwind CSS
- **Auth:** Google OAuth (web UI) + API key (CLI)
- **Reviews:** Claude CLI with pr-review-toolkit
- **Database:** PostgreSQL 15 via Docker Compose (port 5433)
- **Build:** SWC (API), Vite (UI)
