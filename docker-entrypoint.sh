#!/bin/sh
set -e

# 初始化配置文件
if [ ! -f /data/config/sources.json ]; then
  cp /app/default-sources.json /data/config/sources.json
fi

# 数据库迁移
echo "[entrypoint] running prisma migrate deploy..."
cd /app/apps/api
npx prisma migrate deploy
npx prisma db seed 2>/dev/null || true
cd /app

# 启动 mcp-mock（后台）
echo "[entrypoint] starting mcp-mock on :${MCP_PORT}..."
node /app/services/mcp-mock/node_modules/.bin/tsx /app/services/mcp-mock/src/index.ts &

# 启动 find-core（后台）
echo "[entrypoint] starting find-core on :${FIND_CORE_PORT}..."
node /app/services/find-core/dist/index.js &

# 启动 api（后台）
echo "[entrypoint] starting api on :${API_PORT}..."
node /app/apps/api/dist/index.js &

# 启动 web（前台，作为主进程）
echo "[entrypoint] starting web on :${PORT}..."
exec node /app/web-standalone/server.js
