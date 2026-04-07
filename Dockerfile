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

# Install git, gh CLI, 1Password CLI, and Claude CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    gpg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && curl -sS https://downloads.1password.com/linux/keys/1password.asc \
       | gpg --dearmor -o /usr/share/keyrings/1password-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" \
       > /etc/apt/sources.list.d/1password.list \
    && apt-get update && apt-get install -y --no-install-recommends gh 1password-cli \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy env.default for op run secret resolution
COPY env.default ./

# Create repos directory
RUN mkdir -p /app/repos

# Default environment
ENV NODE_ENV=production
ENV PIPE_PORT=3100
ENV PIPE_REPOS_DIR=/app/repos

EXPOSE 3100

# Start server — op run resolves secrets from 1Password via env.default
# Requires OP_SERVICE_ACCOUNT_TOKEN and DEPLOY_ENV in the environment
CMD ["op", "run", "--env-file=env.default", "--no-masking", "--", "node", "dist/index.js"]
