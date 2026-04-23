# =============================================================================
# find-unified 统一 Dockerfile
# 用法：--target 指定服务
#   docker build --target api       -t find-unified/api       .
#   docker build --target web       -t find-unified/web       .
#   docker build --target find-core -t find-unified/find-core .
#   docker build --target mcp-mock  -t find-unified/mcp-mock  .
# =============================================================================

# ── 公共基础层 ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.33.0

# ── 依赖层：安装所有服务依赖（利用层缓存）─────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/
COPY services/find-core/package.json ./services/find-core/
COPY services/mcp-mock/package.json  ./services/mcp-mock/
RUN pnpm install --frozen-lockfile

# ── 构建层：编译所有需要编译的服务 ───────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY apps/api        ./apps/api
COPY apps/web        ./apps/web
COPY services/find-core ./services/find-core
COPY services/mcp-mock  ./services/mcp-mock

# api: prisma generate + tsc
RUN cd apps/api && npx prisma generate
RUN pnpm --filter @find-unified/api build

# web: next build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @find-unified/web build

# find-core: tsc
RUN pnpm --filter @find-unified/find-core build

# =============================================================================
# ── 运行目标：api ─────────────────────────────────────────────────────────────
FROM base AS api
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --filter @find-unified/api... --prod
COPY --from=builder /app/apps/api/dist              ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

# ── 运行目标：web ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app/apps/web
COPY --from=builder /app/apps/web/.next/standalone  ./
COPY --from=builder /app/apps/web/.next/static      ./apps/web/.next/static
COPY --from=builder /app/apps/web/public            ./apps/web/public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]

# ── 运行目标：find-core ───────────────────────────────────────────────────────
FROM base AS find-core
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/find-core/package.json ./services/find-core/
RUN pnpm install --frozen-lockfile --filter @find-unified/find-core... --prod
COPY --from=builder /app/services/find-core/dist ./services/find-core/dist
COPY services/find-core/config                   ./services/find-core/config
WORKDIR /app/services/find-core
EXPOSE 8787
CMD ["node", "dist/index.js"]

# ── 运行目标：mcp-mock ────────────────────────────────────────────────────────
FROM base AS mcp-mock
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/mcp-mock/package.json ./services/mcp-mock/
RUN pnpm install --frozen-lockfile --filter @find-unified/mcp-mock...
COPY services/mcp-mock ./services/mcp-mock
WORKDIR /app/services/mcp-mock
EXPOSE 9090
CMD ["npx", "tsx", "src/index.ts"]
