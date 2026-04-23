# find-unified

统一知识检索系统。将本地 Markdown 文件、MCP 知识库、PostgreSQL 数据库聚合为单一检索接口，通过 LLM 生成回答，并提供 Web 管理后台和多 AI 工具适配器。

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
  apps/api  ──────────────────────────────────────────┐
  （认证 / 对话历史 / Skill 指令 / LLM 流式回答）     │
      │                                               │
      ▼                                               ▼
 services/find-core                            Anthropic API
 （三源并行检索 + 结果融合）                    （claude-sonnet）
  ├── local：扫描本地 Markdown 文件
  ├── mcp：  通过 MCP 协议查询外部知识库
  └── db：   查询 PostgreSQL 数据库
```

---

## 功能特性

- **三源聚合检索**：同时查询本地文件、MCP 服务、PostgreSQL，BM25 关键词打分后加权融合
- **LLM 流式回答**：证据送入 Claude，通过 SSE 实时流式输出答案
- **多平台支持**：`find_core`（直连 LLM）、`claude_code`、`opencode`、`cursor`（spawn CLI 进程）
- **Skill 系统**：可插拔的检索增强管道，分 pre_search / post_search / post_answer 三阶段
- **对话历史**：基于 PostgreSQL 的多轮会话记忆，支持上下文联系
- **管理后台**：Web UI 配置数据源、管理 Skill、触发 Git 同步、查看审计日志
- **Git 同步**：BullMQ 任务队列定时 clone/pull 远程仓库，自动注册到检索根目录

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js ≥ 22，pnpm workspace，Turborepo |
| API | Fastify 5，Zod，@fastify/jwt，BullMQ，Prisma |
| 前端 | Next.js 14，Tailwind CSS，Zustand，TanStack Query |
| 检索核心 | Fastify，MCP SDK，node-pg |
| 数据库 | PostgreSQL，Redis（BullMQ） |
| AI | Anthropic SDK（claude-sonnet） |

---

## 快速开始

### 前置依赖

- Node.js ≥ 22
- pnpm ≥ 10
- PostgreSQL（数据库名 `find_unified`）
- Redis

### 安装

```bash
pnpm install
```

### 环境变量

在 `apps/api/` 下创建 `.env`：

```env
DATABASE_URL=postgresql://postgres:1234@localhost:5432/find_unified
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your-secret-key
FIND_CORE_URL=http://127.0.0.1:8787
```

### 初始化数据库

```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

Seed 会创建：
- 2 个测试用户（admin / dev）
- 3 条数据源配置（local / mcp / db）
- 9 个内置 Skill

### 启动所有服务

```bash
pnpm dev
```

Turborepo 会并行启动：
- `apps/api` → `http://localhost:3001`
- `apps/web` → `http://localhost:3000`
- `services/find-core` → `http://localhost:8787`
- `services/mcp-mock` → `http://localhost:9090`

---

## 数据源配置

配置文件：`services/find-core/config/sources.json`（也可通过管理后台写入）

```json
{
  "local": {
    "enabled": true,
    "roots": ["/path/to/docs", "/tmp/find-sync/git/your-repo"],
    "max_files": 2000,
    "max_snippets": 5
  },
  "mcp": {
    "enabled": true,
    "endpoint": "http://127.0.0.1:9090",
    "timeout_ms": 5000
  },
  "db": {
    "enabled": true,
    "host": "localhost",
    "port": 5432,
    "dbname": "find_unified",
    "user": "postgres",
    "password": "..."
  },
  "fusion": {
    "weights": { "local": 1.0, "mcp": 1.0, "db": 1.0 },
    "top_k_default": 5
  }
}
```

- **local**：递归扫描 `roots` 目录下的所有 `.md` 文件，自动跳过 `node_modules` 和 `.git`
- **mcp**：连接任何实现了 `find_search(query, top_k)` 工具的 MCP 服务；若无该工具则降级为资源列表匹配
- **db**：自动发现 `public` schema 下含有文本列的表，执行 `ILIKE` 全文检索

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

### 内置 Skill

| Skill | 阶段 | 说明 |
|-------|------|------|
| `intent-classify` | pre_search | 识别用户意图（事实/概念/操作/排障/对比） |
| `query-expand` | pre_search | 同义词扩展、中英互译，提升召回率 |
| `evidence-rerank` | post_search | 依据相关性对检索结果重排序 |
| `cite-sources` | post_answer | 在回答末尾附加引用来源 |
| `answer-format` | post_answer | 规范化回答格式 |

通过管理后台 `/admin/skills` 可在线启用/禁用 Skill，无需重启服务。

---

## API 接口

### 检索

```http
POST /find/search
POST /find/search/stream    # SSE 流式
Authorization: Bearer <token>

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

`platform` 可选值：
- `find_core`（默认）：通过 Anthropic API 生成回答
- `claude_code`：spawn `claude -p <prompt>` 进程
- `opencode` / `cursor`：spawn `opencode run <prompt>` 进程

### 管理接口（需 admin 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/admin/sources/mcp` | MCP 数据源配置 |
| GET/PUT | `/api/admin/sources/postgres` | PostgreSQL 数据源配置 |
| GET/PUT | `/api/admin/sync/git/config` | Git 同步配置 |
| POST | `/api/admin/sync/git/trigger` | 立即触发同步 |
| GET | `/api/admin/sync/jobs` | 同步任务列表 |
| GET/PUT/POST | `/api/admin/skills` | Skill 管理 |
| GET | `/api/admin/system/audit` | 审计日志 |

---

## AI 工具适配器

`adapters/` 目录提供各 AI 工具的接入配置，**手动复制到对应工具的配置目录**后即可使用：

- `adapters/claude-code/commands/find.md` → Claude Code 自定义命令
- `adapters/cursor/prompts/find.prompt.md` + `mcp.json` → Cursor 提示词和 MCP 配置
- `adapters/opencode/commands/find.md` + `tool-config.json` → Opencode 配置

---

## 数据模型

```
User ──< Conversation ──< Message ──< MessageEvidence
SourceConfig（local / mcp / db 三条记录）
Skill
SyncJob
AuditLog
KnowledgeArticle（可供 DB 源检索的示例表）
```

---

## 开发

```bash
# 只运行测试
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

`services/mcp-mock` 是一个内置了若干知识条目的本地 MCP 服务，用于开发和测试，无需真实外部知识库即可验证 MCP 链路。默认端口 `9090`，暴露 `find_search` 工具。
