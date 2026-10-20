# Multi-stage Dockerfile for AgentForge
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS builder

WORKDIR /app

# Install build essentials and python for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source trees and base tsconfig
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

# Build client bundle (Vite)
RUN pnpm --filter @agentforge/desktop build

# ── Runner Stage ─────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runner

WORKDIR /app

# Install build tools in case native rebuild is invoked, plus pnpm
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

# Copy entire built workspace from builder
COPY --from=builder /app ./

# Default production environment
ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=7842 \
    DATABASE_PATH=/app/data/agentforge.db \
    CLIENT_DIST_PATH=/app/apps/desktop/dist \
    PLAYWRIGHT_HEADLESS=true

# Prepare persistent data volume directory
RUN mkdir -p /app/data

EXPOSE 7842

VOLUME ["/app/data"]

CMD ["pnpm", "--filter", "@agentforge/server", "start"]
