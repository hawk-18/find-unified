# find-unified

统一知识检索系统。将本地 Markdown 文件、MCP 知识库、SQLite 数据库聚合为单一检索接口，通过 LLM 生成回答，并提供 Web 管理后台和多 AI 工具适配器。

---

## 架构概览

```
find-unified/
├── apps/
│   ├── api/              # Fastify REST API（主后端）
│   └── web/              # Next.js 前端（聊天界面 + 管理后台）
├── services/
│   ├── find-core/        # 检索核心引擎（独立微服务，端口 8787）
│   └── mcp-mock/         # MCP mock 服务（本地测试用，端口 9090）
├── adapters/             # AI 工具适配器配置（Claude Code / Cursor / Opencode）
└── contracts/            # API 接口契约（JSON Schema 文档）
```

### 请求链路

```
AI 工具 / Web 前端
      │
      ▼
  apps/api  
  （认证 / 对话历史 / Skill 指令 / LLM 流式回答）     
      │                                               
      ▼                                               
 services/find-core                            
 （三源并行检索 + 结果融合）                    
  ├── local：扫描本地 Markdown 文件
  ├── mcp：  通过 MCP 协议查询外部知识库
  └── db：   查询 SQLite 数据库
```

---

## 功能特性

- **三源聚合检索**：同时查询本地文件、MCP 服务、SQLite
- **LLM 流式回答**：证据送入 Claude，通过 SSE 实时流式输出答案
- **多平台支持**：`claude_code`、`opencode`、`cursor`（spawn CLI 进程）
- **Skill 系统**：可插拔的检索增强管道，分 pre_search / post_search 阶段
- **对话历史**：基于 SQLite 的多轮会话记忆，支持上下文联系
- **管理后台**：Web UI 配置数据源、管理 Skill、上传文档、查看审计日志
- **HTTP 文档上传**：通过 `/admin/sync` 页面直接上传 Markdown 文件到检索目录

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js ≥ 22，pnpm workspace，Turborepo |
| API | Fastify 5，Zod，Prisma（SQLite） |
| 前端 | Next.js 15，Zustand，TanStack Query |
| 检索核心 | Fastify，MCP SDK，better-sqlite3 |
| 数据库 | SQLite（Prisma 管理 + better-sqlite3 直查） |
| AI | Anthropic SDK（claude-sonnet） |
| 容器化 | Docker multi-stage build，docker-compose |

---

## 快速开始（本地开发）

### 前置依赖

- Node.js ≥ 22
- pnpm ≥ 10

### 安装

```bash
pnpm install
```

### 环境变量

复制根目录 `.env` 并按需调整（默认值已可直接使用）：

```env
DATABASE_URL=file:/tmp/find_unified_dev.db
ANTHROPIC_API_KEY=sk-ant-...          # 使用 Anthropic API 时填写
ANTHROPIC_BASE_URL=                    # 使用代理时填写
FIND_CONFIG_PATH=/path/to/find-unified/services/find-core/config/sources.local.json
API_PORT=3001
FIND_CORE_PORT=8787
MCP_PORT=9090
```

### 初始化数据库

```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

Seed 会创建：
- 2 个测试用户（admin / dev）
- 数据源配置（local / mcp / db）
- 内置 Skill

### 认证 Token（开发模式）

本项目使用固定 mock token，无需登录：

| Token | 角色 |
|-------|------|
| `mock-admin-token-find-unified` | admin（全功能） |
| `mock-dev-token-find-unified` | dev（只读） |

请求时在 Header 中携带：`Authorization: Bearer mock-admin-token-find-unified`

Web 前端已自动使用 admin token。

### 启动所有服务

```bash
pnpm dev
```

Turborepo 会并行启动：
- `apps/api` → http://localhost:3001
- `apps/web` → http://localhost:3000
- `services/find-core` → http://localhost:8787
- `services/mcp-mock` → http://localhost:9090

---

## Docker 部署

### 一键启动

```bash
docker compose up --build
```

默认访问：
- Web 界面：http://localhost:3000
- API：http://localhost:3001

### 部署到远程服务器

`NEXT_PUBLIC_API_URL` 是在构建时嵌入 Next.js 的，需要在构建前通过环境变量指定公网地址：

```bash
NEXT_PUBLIC_API_URL=http://<服务器IP或域名>:3001 docker compose up --build
```

或在宿主机 `.env` 中添加后再 `docker compose up --build`：

```env
NEXT_PUBLIC_API_URL=http://your-server.example.com:3001
ANTHROPIC_AUTH_TOKEN=sk-ant-...
INGEST_TOKEN=your-secure-token   # HTTP 上传接口的鉴权 token
```

### 数据持久化

docker-compose 使用以下命名卷：

| 卷名 | 挂载路径 | 用途 |
|------|----------|------|
| `db_data` | `/data/db` | SQLite 数据库文件 |
| `docs_data` | `/data/docs` | 上传的文档文件 |
| `config_data` | `/data/config` | sources.json 配置 |
| `skills_data` | `/app/apps/api/skills` | Skill .md 文件 |

---

## 数据源配置

配置文件：`services/find-core/config/sources.json`（Docker 中挂载于 `/data/config/sources.json`）

```json
{
  "local": {
    "enabled": true,
    "roots": ["/data/docs"],
    "max_files": 2000,
    "max_snippets": 5
  },
  "mcp": {
    "enabled": true,
    "endpoint": "http://mcp-mock:9090",
    "timeout_ms": 5000
  },
  "db": {
    "enabled": true,
    "url": "file:/data/db/find_unified.db"
  },
  "fusion": {
    "weights": { "local": 1.0, "mcp": 1.0, "db": 1.0 },
    "top_k_default": 5
  }
}
```

- **local**：递归扫描 `roots` 目录下的所有 `.md` 文件，自动跳过 `node_modules` 和 `.git`
- **mcp**：连接实现了 `find_search(query, top_k)` 工具的 MCP 服务；若无该工具则降级为资源列表匹配
- **db**：查询 SQLite `knowledge_articles` 表，支持关键词全文检索

本地开发使用 `sources.local.json`（由 `FIND_CONFIG_PATH` 指向），此文件不纳入 git 追踪。

---

## Skill 系统

Skill 是可插拔的 AI 行为指令，以 Markdown 文件形式存放在 `apps/api/skills/`，格式：

```markdown
---
name: query-expand
stage: pre_search
enabled: true
---
在执行检索之前，请对用户的查询进行扩展优化...
```

### 阶段说明

| 阶段 | 时机 |
|------|------|
| `pre_search` | 检索前，可扩展/改写 query |
| `post_search` | 检索后、生成回答前，可对证据重排序 |
| `post_answer` | 回答生成后，可格式化输出 |

通过管理后台 `/admin/skills` 可在线启用/禁用 Skill，无需重启服务。

---

## API 接口

### 检索（流式）

```http
POST /find/search/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "CVTE 产业园区分布",
  "top_k": 5,
  "sources": ["local", "mcp", "db"],
  "user_context": {
    "platform": "find_core",
    "conversation_id": "conv-xxx"
  }
}
```

响应为 SSE 流，事件类型：`chunk`（文本片段）、`done`（含 evidence 和 source_status）、`error`

`platform` 可选值：
- `find_core`（默认）：通过 Anthropic API 生成回答
- `claude_code`：spawn `claude -p <prompt>` 进程
- `opencode` / `cursor`：spawn `opencode run <prompt>` 进程

### 文档上传

```http
POST /api/ingest/http/push
Authorization: Bearer <ingest-token>
Content-Type: application/json

{
  "filename": "my-doc.md",
  "content": "# 文档内容\n..."
}
```

### 管理接口（需 admin 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/admin/sources/mcp` | MCP 数据源配置 |
| GET/PUT | `/api/admin/sources/sqlite` | SQLite 数据源配置 |
| GET | `/api/admin/sync/jobs` | 上传任务列表 |
| GET/PUT/POST | `/api/admin/skills` | Skill 管理 |
| GET | `/api/admin/system/audit` | 审计日志 |

---

## AI 工具适配器

`adapters/` 目录提供各 AI 工具的接入配置，手动复制到对应工具的配置目录后即可使用：

- `adapters/claude-code/commands/find.md` → Claude Code 自定义命令
- `adapters/cursor/prompts/find.prompt.md` + `mcp.json` → Cursor 提示词和 MCP 配置
- `adapters/opencode/commands/find.md` + `tool-config.json` → Opencode 配置

---

## 数据模型

```
User ──< Conversation ──< Message ──< MessageEvidence
SourceConfig（local / mcp / db）
Skill
SyncJob
AuditLog
KnowledgeArticle（knowledge_articles 表，供 DB 源检索）
```

---

## 开发

```bash
# 运行测试
pnpm test

# 代码检查
pnpm lint

# 构建所有包
pnpm build

# 单独启动 find-core
cd services/find-core && pnpm dev

# 单独启动 mcp-mock
cd services/mcp-mock && pnpm dev
```

---

## MCP Mock 服务

`services/mcp-mock` 是一个内置了若干 CVTE/产品知识条目的本地 MCP 服务，用于开发和测试，无需真实外部知识库即可验证 MCP 链路。默认端口 `9090`，暴露 `find_search` 工具。

### 协议

使用 MCP SDK 的 `StreamableHTTPServerTransport`，每个请求独立创建 McpServer 实例。健康检查：`GET /health`。

### 内置知识条目

| 标题 | 主要标签 |
|------|----------|
| CVTE 产业园区布局 | cvte、视源股份、广州/武汉/成都园区 |
| find-unified 架构概览 | 架构、overview |
| 如何配置 MCP 数据源 | mcp、configuration、admin |
| SQLite 数据源接入说明 | sqlite、database、configuration |
| 文档同步：Git 仓库 | sync、git、ingest |
| 本地文件检索配置 | local、files、markdown |
| Skill 系统说明 | skills、rerank、pipeline |
| API 认证机制 | auth、jwt、security |
| 检索结果融合算法 | fusion、bm25、ranking |

### 评分算法

对 `title + content + tags` 拼接文本做 ASCII 关键词（≥2字符）和中文词（≥2字）的频次统计，每命中一次得 2 分；标题精确匹配额外加 5 分。取 `top_k`（默认 5）条结果返回。

---

## 数据库结构

项目使用两个 SQLite 数据库：

| 数据库 | 环境变量 | 用途 |
|--------|----------|------|
| `apps/api` 主库 | `DATABASE_URL` | Prisma 管理的业务数据 |
| 检索知识库 | `db.url`（sources.json） | find-core 直查的知识文章 |

### Prisma 管理的表（apps/api）

| 表名 | 说明 |
|------|------|
| `users` | 用户（id、name、role、defaultCli） |
| `conversations` | 会话（ownerUserId、title、deletedAt） |
| `messages` | 消息（conversationId、role、content、traceId） |
| `message_evidence` | 消息引用的证据（sourceType、title、snippet、score、sourceRef） |
| `source_configs` | 数据源配置（sourceType 唯一键、enabled、configJson、updatedBy） |
| `skills` | Skill 配置（name 唯一键、stage、enabled、priority、configJson） |
| `sync_jobs` | 文档同步任务记录（jobType、status、payloadJson、resultJson） |
| `audit_logs` | 审计日志（operatorUserId、action、targetType、targetId、detailJson） |
| `knowledge_articles` | 可被 DB 源检索的知识文章（见下） |

### knowledge_articles 表

find-core 的 `db` 数据源直接查询此表，支持 title + content + tags + category 关键词全文检索。

```sql
CREATE TABLE knowledge_articles (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  content   TEXT NOT NULL,
  category  TEXT NOT NULL,
  tags      TEXT NOT NULL,   -- 逗号分隔
  author    TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME
);
```

向此表插入数据即可让 DB 数据源检索到对应内容，无需重启服务。可通过 Prisma Studio（`npx prisma studio`）或直接执行 SQL 操作。

### knowledge_articles 当前内容

| 标题 | 分类 | 标签 | 作者 | 内容摘要 |
|------|------|------|------|---------|
| find-unified 项目简介 | 项目文档 | overview, architecture, introduction | 研发团队 | 统一知识检索平台介绍，整合 Markdown / MCP / DB 三源 |
| 检索接口使用指南 | API文档 | api, search, usage | 后端团队 | POST /find/search 参数说明（query、top_k、sources）及返回结构 |
| 数据同步最佳实践 | 运维指南 | sync, git, best-practices | 运维团队 | Git 仓库同步建议：公开仓库免认证，私有仓库用 Token，间隔 ≥ 30 分钟 |
| BullMQ 任务队列说明 | 技术文档 | bullmq, redis, queue | 基础架构团队 | 同步任务异步处理，依赖 Redis，状态流转 pending → running → done/failed |
| 知识库维护规范 | 文档规范 | markdown, knowledge-base, guidelines | 内容团队 | Markdown 文件以 # 标题开头，每段 ≤ 500 字，关键术语加粗提升命中率 |
| 环境变量配置清单 | 运维指南 | environment, configuration, deployment | 运维团队 | 必填：DATABASE_URL、REDIS_URL、JWT_SECRET；可选：LOG_LEVEL、FIND_CONFIG_PATH |
| MCP 服务接入规范 | API文档 | mcp, integration, protocol | 后端团队 | find_search 工具参数规范，返回 `{ title, snippet, score }` JSON，支持 StreamableHTTP / SSE |
| 权限与角色体系 | 安全文档 | auth, roles, permissions, security | 安全团队 | admin（全功能）和 dev（只读检索），role 存于 users 表，JWT 携带 userId + role |
| CVTE 成立三年发展历程 | 企业简介 | cvte, 视源股份, 发展历程 | 企业文化团队 | 第一年液晶主控板全球领先；第二年推出希沃教育平板；第三年营收复合增长率 >30%，员工突破万人 |

### Seed 初始数据

执行 `npx prisma db seed` 会写入：

- **2 个用户**：`Admin User`（admin 角色）、`Dev User`（dev 角色）
- **3 条 source_configs**：local（启用）、mcp（默认禁用）、db（默认禁用）
- **9 个 Skill**：

| Skill 名称 | 阶段 | 默认启用 |
|------------|------|---------|
| query_expand | pre_search | ✓ |
| lang_detect | pre_search | ✓ |
| query_filter | pre_search | ✗ |
| rerank | post_search | ✓ |
| source_boost | post_search | ✓ |
| dedup | post_search | ✗ |
| suggest | post_answer | ✓ |
| citation | post_answer | ✓ |
| feedback_collector | post_answer | ✗ |
