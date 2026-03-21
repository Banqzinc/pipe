# Pipe MVP (v0.1) — Design Spec

## Overview

Pipe is a self-hosted, open-source PR review tool. It runs Claude CLI's pr-review-toolkit on pull requests, converts output into structured draft comments, and gives humans a fast accept/reject/edit workflow before posting anything to GitHub.

**Core rule:** No model output is posted directly. Everything starts as a draft.

**v0.1 goal:** Validate that the human-gated review loop is faster and more useful than reviewing PRs manually.

## Architecture

### Deployment Topology

```
┌──────────────┐     ┌──────────────────────────┐
│   Docker     │     │        Host               │
│              │     │                            │
│  ┌────────┐  │     │  ┌──────────────────────┐  │
│  │Postgres│◄─┼─────┼──│     Pipe API          │  │
│  │        │  │     │  │  (Express + TypeORM)  │  │
│  └────────┘  │     │  │                       │  │
│              │     │  │  spawns claude CLI     │  │
│              │     │  │  (host's auth, MCP,   │  │
│              │     │  │   repo access)        │  │
│              │     │  └──────────────────────┘  │
│              │     │                            │
│              │     │  UI served by API          │
└──────────────┘     └──────────────────────────┘
```

- **Postgres** in Docker (standard)
- **API** on host — Express + TypeORM. Has direct access to the user's Claude CLI, MCP servers (Linear, Notion), and local repo checkouts.
- **UI** is a built Vite SPA served as static files by the Express API.

Rationale: The Claude CLI needs the host's auth session, MCP server configs, and repo filesystem access. Running the API on the host avoids mounting all of this into Docker.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Node.js, Express, TypeScript, TypeORM |
| Database | PostgreSQL 15 (Docker) |
| Frontend | React, Vite SPA, TanStack Router + Query, Tailwind CSS |
| Review Engine | Claude CLI (`claude --print --output-format json`) |
| Auth | Simple shared secret + JWT sessions |
| Linting | Biome |
| Testing | Vitest |
| Build | SWC |

## Data Model

### repos

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| github_owner | string | e.g. "quidkey" |
| github_name | string | e.g. "quidkey-core" |
| github_webhook_secret | string | For verifying webhook payloads |
| pat_token_encrypted | string | GitHub PAT, encrypted with AES-256-GCM using `PIPE_ENCRYPTION_KEY` env var |
| auto_trigger_on_open | boolean | Default false |
| rule_paths | jsonb | Discovered rule file paths |
| created_at | timestamp | |
| updated_at | timestamp | |

### pull_requests

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| repo_id | uuid | FK → repos |
| github_pr_number | int | |
| title | string | |
| author | string | |
| branch_name | string | |
| base_branch | string | |
| head_sha | string | Latest known SHA |
| status | enum | open, closed, merged |
| linear_ticket_id | string? | Extracted from branch/description |
| notion_url | string? | From Linear ticket link |
| stack_id | string? | Graphite stack identifier |
| stack_position | int? | Position in stack (1 = bottom) |
| stack_size | int? | Total PRs in stack |
| created_at | timestamp | |
| updated_at | timestamp | |

### review_runs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| pr_id | uuid | FK → pull_requests |
| head_sha | string | SHA at time of run |
| status | enum | queued, running, completed, failed, partial |
| is_self_review | boolean | |
| context_pack | jsonb | Snapshot: diff, files, rules used |
| toolkit_raw_output | text | Raw CLI output for debugging |
| brief | jsonb | Toolkit's structured summary |
| risk_signals | jsonb | Deterministic risk analysis |
| error_message | text? | |
| started_at | timestamp? | |
| completed_at | timestamp? | |
| created_at | timestamp | |

### findings

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| run_id | uuid | FK → review_runs |
| file_path | string | |
| start_line | int | |
| end_line | int? | |
| severity | enum | critical, warning, suggestion, nitpick |
| confidence | float | |
| category | string? | e.g. "security", "testing" |
| title | string | |
| body | text | Markdown |
| suggested_fix | text? | Code suggestion |
| rule_ref | string? | Which rule triggered this |
| status | enum | pending, accepted, rejected, edited, posted |
| edited_body | text? | User's edited version |
| toolkit_order | int | Preserve original ordering |
| created_at | timestamp | |
| updated_at | timestamp | |

### review_posts

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| run_id | uuid | FK → review_runs |
| github_review_id | int | GitHub's review ID |
| posted_sha | string | |
| findings_count | int | |
| posted_at | timestamp | |
| created_at | timestamp | |

## API Routes

### Auth
- `POST /api/auth/login` — shared secret login
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Repos
- `GET /api/repos` — list connected repos
- `POST /api/repos` — add repo (owner, name, PAT)
- `PATCH /api/repos/:id` — update settings
- `DELETE /api/repos/:id`
- `POST /api/repos/:id/sync` — manual sync of open PRs

### Pull Requests
- `GET /api/prs` — inbox (filterable: status, repo, has_run)
- `GET /api/prs/:id` — PR detail with run history
- `GET /api/prs/:id/stack` — sibling PRs in same stack

### Review Runs
- `POST /api/prs/:id/runs` — trigger a review run
- `GET /api/runs/:id` — run detail (brief, risk signals)
- `GET /api/runs/:id/findings` — findings list (filterable)

### Findings
- `PATCH /api/findings/:id` — accept, reject, edit a finding
- `POST /api/runs/:id/findings/bulk` — bulk action

### Posting
- `POST /api/runs/:id/post` — post accepted findings to GitHub
- `POST /api/runs/:id/export` — self-review: export as markdown

### Webhooks
- `POST /api/webhooks/github` — receives PR open/update/close events

## Backend Services

### WebhookService
Receives GitHub webhook events. On PR open/update: upserts PR record, extracts Linear ticket ID from branch name (`CORE-558` pattern) or PR description, fetches stack info from GitHub API. On PR open: triggers review if `auto_trigger_on_open` is enabled.

### SyncService
Manual initial sync. Fetches all open PRs for a repo via GitHub API. Creates PR records. Extracts stack relationships by looking at base branches (stacked PRs target each other, not main).

### ContextPackBuilder
Assembles input for a review run:
1. Fetch diff and changed file list via GitHub API
2. Clone/pull repo locally (cached in `PIPE_REPOS_DIR`)
3. Discover rules: walk changed file paths → find `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.review/rules/`
4. For stack-aware reviews: fetch parent PR diff (one level up) and child PR diff (one level down)
5. Extract Linear ticket from branch/description
6. If Linear ticket → check for Notion link
7. Snapshot everything into `context_pack` jsonb

### ReviewRunner
The core engine:
1. Spawn `claude --print --output-format json` as child process
2. Construct prompt: diff, changed files, rules, output schema
3. Pass Linear ticket URL and Notion URL if available (toolkit uses MCP)
4. For stack context: include parent/child diffs as context-only sections
5. Stream CLI output, capture structured JSON
6. Timeout: 5 minutes per run. On timeout/error: retry up to 3x
7. On total failure: mark run as `failed` with error message

### OutputParser
1. Parse JSON output from CLI
2. Validate against findings schema
3. Extract brief (toolkit's structured summary)
4. Extract findings with severity, file, line, body, suggested_fix, rule_ref
5. Deduplicate exact matches
6. Map toolkit severity → Pipe severity
7. On partial parse: store what worked, mark run as `partial`

### RiskEngine
Runs after toolkit output. Pure pattern matching on changed file paths:
- `/auth/`, `/permissions/`, `/tenant/` → "Auth/tenant code touched"
- `/migration/`, schema files → "Schema changes"
- `/routes/`, `/controllers/` → "Public API changed"
- No matching `*.test.*` for changed source files → "Logic changed without tests"
- Diff > 500 lines → "Large diff"
- Webhook/integration code → "Third-party integration changed"

### PostingService
Posts accepted findings to GitHub:
1. Verify HEAD SHA matches run's SHA (stale check)
2. Collect all `accepted` or `edited` findings
3. Create GitHub PR review with inline comments via `POST /repos/:owner/:repo/pulls/:number/reviews`
4. Store `review_post` record
5. For self-review: export findings as structured markdown checklist

### AuthService
Simple shared secret. On first boot, generates a secret and logs it. User enters it in the UI. Issues a JWT session token.

## Frontend

### Pages
- `/` — **Inbox**: PR table with stack grouping, filters (needs review / in progress / completed), repo dropdown
- `/pr/:id` — **PR Detail**: run history, "Run Review" button, stack context
- `/run/:id` — **Run Page**: the core decision surface (brief + findings triage)
- `/settings` — repo management, auth config
- `/login` — shared secret entry

### Run Page (Core Screen)
The main interaction surface. Not a review IDE — a decision surface optimized for speed.

**Layout:**
- Brief at top: risk signals + toolkit structured summary (critical issues, important issues, suggestions, strengths, recommended actions)
- Findings below: grouped by file, in toolkit order
- Each finding: severity badge, confidence score, line reference, body, suggested fix (collapsible), rule ref
- Action buttons: Accept / Reject / Edit per finding
- Sticky bottom bar: live counts + bulk actions + Post/Export button

**Keyboard shortcuts:**
- `j/k` — navigate between findings
- `a` — accept focused finding
- `r` — reject focused finding
- `e` — edit focused finding
- `Shift+R` — reject all nitpicks
- `Shift+P` — post to GitHub (with confirmation)

**States:**
- Run in progress — progress indicator, no findings yet
- Run complete — all findings show accept/reject/edit
- Partially reviewed — counter shows counts
- All decided — Post button becomes primary
- Posting with pending findings — warning dialog
- Posted — read-only with badges, link to GitHub review
- Stale — SHA changed, red banner blocks posting, "Re-run" button
- Self-review — Post button becomes "Export Findings"

**Target: 60-90 seconds to triage 5-10 findings.**

### Inbox Page
- Table: PR title, author, repo badge, stack indicator, run status, finding count, time
- Stack grouping: stacked PRs collapsed under stack header with position indicators (1/5, 2/5, etc.)
- Risk highlighting: high-risk PRs get visual emphasis
- Self-review badge: "SELF" tag with "Exported" status
- Inline "Run Review" button on unreviewed PRs

### Frontend Structure

```
src/
├── main.tsx
├── router.tsx
├── api/
│   ├── client.ts
│   ├── queries/ (repos, prs, runs, findings)
│   └── mutations/ (findings, runs)
├── pages/
│   ├── inbox.tsx
│   ├── pr-detail.tsx
│   ├── run.tsx
│   ├── settings.tsx
│   └── login.tsx
├── components/
│   ├── layout/ (app-shell, nav)
│   ├── inbox/ (pr-table, stack-group)
│   ├── run/ (review-brief, finding-card, finding-list, finding-editor, bulk-actions, post-bar, stale-banner)
│   └── common/ (severity-badge, status-badge, code-block)
└── lib/ (auth, utils)
```

## Review Pipeline Flow

```
User clicks "Run Review" (or auto-trigger on PR open)
    │
    ▼
API creates review_run record (status: queued)
    │
    ▼
ContextPackBuilder assembles input
  - Fetch diff + changed files via GitHub API
  - Clone/pull repo (cached in PIPE_REPOS_DIR)
  - Discover rules from changed paths
  - Fetch stack context (parent/child PR diffs)
  - Extract Linear ticket + Notion URL
  - Snapshot into context_pack
    │
    ▼
ReviewRunner spawns CLI (status → running)
  - claude --print --output-format json
  - Prompt includes diff, files, rules, schema, business context URLs
  - Stack diffs as context-only sections
  - Timeout: 5 min, retry up to 3x
    │
    ▼
OutputParser processes response
  - Parse JSON, validate schema
  - Extract brief + findings
  - Deduplicate exact matches
  - Map severity levels
  - Partial results on parse failure
    │
    ▼
RiskEngine adds deterministic signals
  - Pattern match on changed file paths
  - Auth, migrations, routes, missing tests, large diff
    │
    ▼
Run complete → findings stored as pending drafts
UI shows run page with brief + findings
```

## Self-Review Mode

Same triage UI as standard review. Differences:
- Triggered with `is_self_review: true` on run creation
- "SELF" badge in inbox
- Post button → "Export Findings" button
- Export generates structured markdown checklist of accepted findings
- No GitHub review is created
- Status shows "Exported" instead of "Posted"

Steven's vision: "At the end of the day when you accepted some findings, it may give you them structured or even start planning on how to fix them."

## Stack Awareness

### UI Grouping (Inbox)
- Stacked PRs grouped under a collapsible stack header
- Position indicators (1/5, 2/5, etc.)
- Stack ordered bottom-to-top (base → tip)
- Risk signals visible per PR within the stack

### Context Passing (Review)
- ContextPackBuilder fetches parent PR diff (one level up) and child PR diff (one level down)
- Passed to the CLI prompt as clearly labelled context-only sections
- Prompt instructs: "CONTEXT ONLY — Parent PR diff, do not review directly. Use for understanding the broader change."
- Enables the toolkit to catch cross-PR issues (e.g., a change in PR 2 breaks an assumption in PR 3)

### Stack Detection
- Stacked PRs target each other as base branch (not main/master)
- SyncService detects this during PR sync
- `stack_id` is derived deterministically from the root PR's branch (the first PR in the stack that targets main/master). All PRs chaining off it share the same `stack_id`.
- `stack_position` is computed by walking the base branch chain (1 = closest to main)

## Business Context

- Pipe extracts Linear ticket ID from PR branch name or description (e.g., `CORE-558`)
- If Linear ticket links to a Notion proposal, captures that URL
- Both URLs passed to Claude CLI invocation — toolkit fetches content via MCP servers
- If no ticket found: review runs code-only, brief flags "No Linear ticket linked"

## Auth

- On first boot: generate random secret, log to console
- User enters secret in login page
- API issues JWT session token (stored in httpOnly cookie)
- All API routes check JWT except `/api/auth/login` and `/api/webhooks/github`
- GitHub webhook requests verified via webhook secret signature

## Deterministic Risk Signals

Path-based pattern matching on changed files:

| Pattern | Signal |
|---------|--------|
| `/auth/`, `/permissions/`, `/tenant/` | Auth/tenant code touched |
| `/migration/`, schema files | Schema changes |
| `/routes/`, `/controllers/` | Public API changed |
| Webhook, integration code | Third-party integration changed |
| `/payout/`, `/refund/`, `/transaction/` | Money movement code |
| Changed `.ts` without matching `.test.ts` | Logic without tests |
| Diff > 500 lines | Large diff |
| CI, Docker, deploy configs | Infrastructure changed |

## Failure Handling

- **Partial results over no results.** If toolkit partially succeeds, show what parsed.
- **Fail visibly.** Errors shown in UI with context. Never swallowed.
- **Never post stale comments.** SHA mismatch blocks posting entirely.
- **Retries are automatic, re-runs are manual.** Transient failures retry up to 3x. After that, user decides.

## Concurrency

v0.1 runs are sequential — one review at a time. Simple in-memory queue. If a run is in progress, new runs are queued and processed in order.

## Success Metrics (Internal Targets)

| Metric | Target | Why |
|--------|--------|-----|
| Comment acceptance rate | ≥ 40% | Below this, too noisy |
| Time to review decision | < 2 min per run | UX speed target |
| Stale comments posted | 0 | SHA check must be reliable |
| Brief engagement | ≥ 60% of runs | Proxy for brief usefulness |

## Open Questions

- Should posting create one review with inline comments only, or also include an overall summary comment?
- Maximum finding count before UI starts collapsing by default?
- How to handle toolkit timeout on very large diffs? (Default: truncate to 3000 lines with a warning in the brief)
- How to handle PRs with no linked Linear ticket? (Silent code-only review or prompt?)

## Out of Scope for v0.1

- Automatic re-runs on every push
- Semantic deduplication, custom re-scoring, cross-agent aggregation
- GitHub App (PAT is sufficient)
- Previous thread tracking
- CODEOWNERS / reviewer suggestions
- CI API keys
- Second LLM provider
- Separate worker process
- Review profiles UI, analytics, real-time UI
- Full Docker deployment (API containerized)
- GitHub OAuth
