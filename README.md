# Pipe

Self-hosted AI code review tool.

## Quick Start

```bash
# Start Postgres
docker compose up -d

# Set environment variables
cp env.default .env
# Edit .env with your values

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Run migrations
npm run migration:run

# Start development
npm run dev
# Or with 1Password:
npm run dev:op
```

Open http://localhost:5173 — enter the auth secret from the console output.

## Adding a Repository

1. Go to Settings
2. Add your GitHub repo with a PAT (needs repo scope)
3. Copy the webhook URL and add it to your GitHub repo settings (select "Pull requests" events)
4. Click "Sync PRs" to import existing open PRs
