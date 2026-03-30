# ---- Build stage ----
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install all dependencies (including devDependencies needed for build)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --include=dev

# Copy source and build
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-bookworm-slim

# Install git, gh CLI, and Claude CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create repos directory
RUN mkdir -p /app/repos

# Default environment
ENV NODE_ENV=production
ENV PIPE_PORT=3100
ENV PIPE_REPOS_DIR=/app/repos

EXPOSE 3100

# Start server (migrations run automatically via TypeORM)
CMD ["node", "dist/index.js"]
