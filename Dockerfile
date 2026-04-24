# =============================================================================
# find-unified 单镜像 Dockerfile
# 将 api / web / find-core / mcp-mock 四个服务打包进一个容器
# 用法：
#   docker build -t find-unified .
#   docker run -p 3000:3000 -p 3001:3001 find-unified
# =============================================================================

# ── 公共基础层 ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.33.0
RUN apk add --no-cache python3 make g++ openssl libc6-compat sqlite-libs

# ── 依赖层 ────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json           ./apps/api/
COPY apps/web/package.json           ./apps/web/
COPY services/find-core/package.json ./services/find-core/
COPY services/mcp-mock/package.json  ./services/mcp-mock/
RUN pnpm install --frozen-lockfile

# ── 构建层 ────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY apps/api           ./apps/api
COPY apps/web           ./apps/web
COPY services/find-core ./services/find-core
COPY services/mcp-mock  ./services/mcp-mock

# api: prisma generate + tsc
RUN cd apps/api && DATABASE_URL="file:/tmp/build.db" npx prisma generate
RUN pnpm --filter @find-unified/api build

# web: next build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @find-unified/web build

# find-core: tsc
RUN pnpm --filter @find-unified/find-core build

# =============================================================================
# ── 最终单镜像 ────────────────────────────────────────────────────────────────
FROM base AS final
WORKDIR /app

# ── 安装生产依赖（所有服务合并） ──────────────────────────────────────────────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json           ./apps/api/
COPY apps/web/package.json           ./apps/web/
COPY services/find-core/package.json ./services/find-core/
COPY services/mcp-mock/package.json  ./services/mcp-mock/
RUN pnpm install --frozen-lockfile --prod

# ── api ──────────────────────────────────────────────────────────────────────
COPY --from=builder /app/apps/api/dist                 ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/prisma ./apps/api/prisma

# ── web (Next.js standalone) ─────────────────────────────────────────────────
# standalone 输出在 /app/apps/web/.next/standalone，server.js 在其根目录
COPY --from=builder /app/apps/web/.next/standalone     ./web-standalone
COPY --from=builder /app/apps/web/.next/static         ./web-standalone/.next/static
COPY --from=builder /app/apps/web/public               ./web-standalone/public

# ── find-core ─────────────────────────────────────────────────────────────────
COPY --from=builder /app/services/find-core/dist       ./services/find-core/dist
COPY services/find-core/config/sources.json            ./default-sources.json

# ── mcp-mock（tsx 直接运行源码） ──────────────────────────────────────────────
COPY services/mcp-mock/src ./services/mcp-mock/src

# ── 数据目录 ──────────────────────────────────────────────────────────────────
RUN mkdir -p /data/docs /data/db /data/config /app/apps/api/skills

# ── 暴露端口 ──────────────────────────────────────────────────────────────────
EXPOSE 3000 3001 8787 9090

# ── 环境变量默认值 ────────────────────────────────────────────────────────────
ENV NODE_ENV=production \
    API_PORT=3001 \
    FIND_CORE_PORT=8787 \
    MCP_PORT=9090 \
    PORT=3000 \
    FIND_CORE_URL=http://127.0.0.1:8787 \
    FIND_CONFIG_PATH=/data/config/sources.json \
    SYNC_HTTP_DIR=/data/docs \
    DATABASE_URL=file:/data/db/find_unified.db \
    INGEST_TOKEN=ingest-dev-token

# ── 启动脚本 ──────────────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
