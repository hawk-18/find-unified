# find-unified

> 统一知识检索系统：将本地 Markdown 文件、MCP 知识库、SQLite 数据库聚合为单一检索接口，通过 LLM 生成流式回答，并提供 Web 聊天界面和管理后台。

---

## 项目是什么

企业内部往往存在大量分散的知识——技术文档放在 Git 仓库、产品知识存在数据库、外部服务通过 MCP 协议暴露。find-unified 把这三类来源统一聚合，用户只需在聊天界面输入自然语言问题，系统会：

1. CLI并行检索三个数据源后生成回答
2. 通过 SSE 实时流式输出答案，并标注引用来源

---

## 整体架构

```
┌─────────────────────────────────────────────────┐
│              用户 / AI 工具                      │
│   Web 聊天界面  │  Claude Code  │  Cursor        │
└────────────────┬────────────────────────────────┘
                 │ HTTP / SSE
                 ▼
┌────────────────────────────────────────────────────┐
│                   apps/api（:3001）                 │
│  认证 · 对话历史 · Skill 管道 · LLM 流式回答        │
└───────────────────┬────────────────────────────────┘
                    │ HTTP
                    ▼
┌────────────────────────────────────────────────────┐
│              services/find-core（:8787）            │
│                         三源并行检索                 │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  local   │  │   MCP    │  │       DB         │ │
│  │ .md 文件  │  │ 外部知识库│  │ knowledge_       │ │
│  │  扫描    │  │ 协议调用  │  │ articles 表      │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────┘
```

### 目录结构

```
find-unified/
├── apps/
│   ├── api/          # Fastify REST API（主后端，:3001）
│   └── web/          # Next.js 前端（聊天 + 管理后台，:3000）
├── services/
│   ├── find-core/    # 检索核心微服务（:8787）
│   └── mcp-mock/     # 本地 MCP 测试服务（:9090）
├── adapters/         # Claude Code / Cursor / Opencode 适配配置
└── contracts/        # API 接口 JSON Schema 契约
```

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **三源聚合检索** | local（Markdown）/ MCP（外部知识库）/ DB（SQLite） |
| **LLM 流式回答** | 证据片段送入 CLI，通过 SSE 实时输出答案，带引用来源 |
| **多平台支持** | `claude_code` / `cursor` / `opencode`（spawn CLI） |
| **Skill 管道** | 可插拔的检索增强指令（pre_search / post_search / post_answer 三阶段） |
| **对话历史** | 多轮会话记忆，基于 SQLite 持久化 |
| **管理后台** | 配置数据源、管理 Skill、上传文档、查看审计日志 |

---

## 使用说明

### 提问与对话

打开 http://localhost:3000，在底部输入框输入问题，按 Enter 发送。

- 系统会并行检索三个数据源，将命中的内容片段作为证据，送入 Claude 生成回答
- 回答下方展示引用来源（本地文件路径 / MCP 条目 / 数据库记录）
- 支持多轮对话，历史上下文自动保留
- 点击左侧历史会话可恢复之前的对话

**支持模糊搜索**：输入有拼写错误的关键词（如 `cvtt`）系统会自动计算编辑距离并纠正为最近的词（`cvte`）再检索，无需精确拼写。

### 上传知识文档

有两种方式将文档加入检索：

**方式一：通过管理后台上传**

打开 http://localhost:3000/admin/sync，点击上传区域选择 `.md` 文件，上传后立即可被检索。

**方式二：通过 API 推送**

```bash
curl -X POST http://localhost:3001/api/ingest/http/push \
  -H 'Authorization: Bearer mock-admin-token-find-unified' \
  -H 'Content-Type: application/json' \
  -d '{"filename": "my-doc.md", "content": "# 标题\n正文内容..."}'
```

文档格式建议：
- 以 `# 标题` 开头，find-core 会自动提取作为文档名展示
- 关键术语建议加粗（`**术语**`），提升检索命中率
- 每段不超过 500 字，便于片段截取

### 配置数据源

打开 http://localhost:3000/admin/sources：

- **MCP**：填写 MCP 服务地址（如 `http://localhost:9090`），该服务需暴露 `find_search` 工具
- **SQLite**：填写数据库路径（格式 `file:/path/to/db.db`），find-core 会检索其中的 `knowledge_articles` 表

配置保存后立即生效，无需重启。

### 管理 Skill

打开 http://localhost:3000/admin/skills，可启用/禁用各阶段的 Skill：

- `pre_search` 阶段的 Skill 会在检索前对 query 进行扩展或过滤
- `post_search` 阶段的 Skill 会对检索结果重排序或去重
- `post_answer` 阶段的 Skill 会对回答进行格式化或推荐相关问题

### 查看审计日志

打开 http://localhost:3000/admin/audit，可查看所有管理操作记录（数据源变更、Skill 修改等）。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js ≥ 22，pnpm workspace，Turborepo |
| API 层 | Fastify 5，Zod 校验，Prisma ORM（SQLite） |
| 前端 | Next.js 15 App Router，Zustand，TanStack Query |
| 检索核心 | Fastify，MCP SDK，better-sqlite3 |
| AI | Anthropic SDK（claude-sonnet），支持自定义 base URL |
| 容器化 | Docker multi-stage build，docker-compose |

---

## 快速开始

### 前置依赖

- Node.js ≥ 22
- pnpm ≥ 10

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

根目录已提供 `.env` 示例，按需填写：

```env
# 数据库
DATABASE_URL=file:/tmp/find_unified_dev.db

# Anthropic API（使用 find_core 平台时必填）
ANTHROPIC_AUTH_TOKEN=sk-ant-...
ANTHROPIC_BASE_URL=              # 代理地址，不用代理留空

# 服务端口
API_PORT=3001
FIND_CORE_PORT=8787
MCP_PORT=9090

# 本地检索配置文件路径（指向 sources.local.json）
FIND_CONFIG_PATH=/path/to/find-unified/services/find-core/config/sources.local.json

# 文档上传目录（本地开发）
SYNC_HTTP_DIR=/tmp/find-sync/http
```

### 3. 初始化数据库

```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

Seed 会写入：2 个测试用户、3 条数据源配置、9 个内置 Skill。

### 4. 启动所有服务

```bash
pnpm dev
```

Turborepo 并行启动四个服务：

| 服务 | 地址 |
|------|------|
| Web 聊天界面 + 管理后台 | http://localhost:3000 |
| API | http://localhost:3001 |
| find-core 检索引擎 | http://localhost:8787 |
| MCP Mock | http://localhost:9090 |

> **注意**：如果修改了 `.env`，需要重启 `pnpm dev` 才能生效。旧进程不会自动读取新配置。

---

## 认证（开发模式）

项目使用固定 mock token，无需登录：

| Token | 角色 | 权限 |
|-------|------|------|
| `mock-admin-token-find-unified` | admin | 全部功能 |
| `mock-dev-token-find-unified` | dev | 只读检索 |

API 请求携带：`Authorization: Bearer mock-admin-token-find-unified`

Web 前端已自动使用 admin token，无需手动配置。

---

## 使用指南

### 聊天界面（localhost:3000）

- 左侧边栏：会话历史，支持搜索和删除
- 右上角：跳转管理后台
- 直接输入问题即可检索，支持多轮对话
- 回答下方展示引用来源（文件路径 / MCP / 数据库记录）

### 上传文档

通过管理后台 `localhost:3000/admin/sync` 上传 `.md` 文件，文件保存后立即可被检索。

也可通过 API 直接推送：

```http
POST /api/ingest/http/push
Authorization: Bearer mock-admin-token-find-unified
Content-Type: application/json

{
  "filename": "my-doc.md",
  "content": "# 文档标题\n正文内容..."
}
```

### 数据源配置（localhost:3000/admin/sources）

- **local**：自动扫描 `SYNC_HTTP_DIR` 目录下所有 `.md` 文件
- **MCP**：填写实现了 `find_search(query, top_k)` 工具的 MCP 服务地址
- **SQLite**：填写包含 `knowledge_articles` 表的数据库路径（`file:/path/to/db`）

配置保存后同步写入 `sources.json`，find-core 下次检索时生效。

---



## 数据源详解

### local 源

递归扫描 `sources.json` 中 `local.roots` 列出的目录，索引所有 `.md` 文件。自动跳过 `node_modules`、`.git` 等目录。

配置示例：
```json
{
  "local": {
    "enabled": true,
    "roots": ["/data/docs", "/tmp/find-sync/http"],
    "max_files": 2000,
    "max_snippets": 5
  }
}
```

### MCP 源

连接任意实现了 `find_search` 工具的 MCP 服务：

```
find_search(query: string, top_k?: number)
→ [{ title, snippet, score }]
```

若 MCP 服务没有 `find_search` 工具，自动降级为资源列表关键词匹配。

项目内置 `mcp-mock`（:9090）用于开发测试，包含 9 条 CVTE/产品相关知识条目：

| 条目 | 标签 |
|------|------|
| CVTE 产业园区布局 | cvte、广州/武汉/成都园区 |
| find-unified 架构概览 | 架构、overview |
| 如何配置 MCP 数据源 | mcp、configuration |
| SQLite 数据源接入说明 | sqlite、database |
| 文档同步 Git 仓库 | sync、git |
| 本地文件检索配置 | local、markdown |
| Skill 系统说明 | skills、pipeline |
| API 认证机制 | auth、security |
| 检索结果融合算法 | fusion、bm25 |

### DB 源

直接查询 SQLite `knowledge_articles` 表：

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

向此表插入记录即可被检索，无需重启服务。可用 `npx prisma studio` 可视化操作。

当前预置的 9 条知识记录：

| 标题 | 分类 | 内容摘要 |
|------|------|---------|
| find-unified 项目简介 | 项目文档 | 整合 Markdown / MCP / DB 三源的统一检索平台 |
| 检索接口使用指南 | API文档 | POST /find/search 参数与返回结构说明 |
| 数据同步最佳实践 | 运维指南 | Git 同步建议，间隔 ≥ 30 分钟 |
| BullMQ 任务队列说明 | 技术文档 | 异步任务状态流转（已作为历史参考，当前不依赖 Redis） |
| 知识库维护规范 | 文档规范 | Markdown 文件格式建议 |
| 环境变量配置清单 | 运维指南 | 必填与可选环境变量列表 |
| MCP 服务接入规范 | API文档 | find_search 工具参数与返回格式 |
| 权限与角色体系 | 安全文档 | admin / dev 角色说明 |
| CVTE 成立三年发展历程 | 企业简介 | 三年发展里程碑，营收复合增长率 >30% |

---

## Skill 系统

Skill 是插入检索管道的 prompt 指令片段，以 Markdown 文件存放在 `apps/api/skills/`：

```markdown
---
name: query-expand
stage: pre_search
enabled: true
---
在执行检索之前，请对用户的查询进行同义词扩展...
```

三个执行阶段：

| 阶段 | 时机 | 典型用途 |
|------|------|---------|
| `pre_search` | 检索前 | 扩展 query、语言检测、过滤无效词 |
| `post_search` | 检索后、生成回答前 | 重排序、来源加权、去重 |
| `post_answer` | 回答生成后 | 格式化引用、推荐相关问题 |

内置 Skill（`npx prisma db seed` 写入）：

| Skill | 阶段 | 默认启用 |
|-------|------|---------|
| query_expand | pre_search | ✓ |
| lang_detect | pre_search | ✓ |
| query_filter | pre_search | ✗ |
| rerank | post_search | ✓ |
| source_boost | post_search | ✓ |
| dedup | post_search | ✗ |
| suggest | post_answer | ✓ |
| citation | post_answer | ✓ |
| feedback_collector | post_answer | ✗ |

通过 `localhost:3000/admin/skills` 可在线启用/禁用，无需重启。

---

## 数据库结构

项目使用 SQLite，由 Prisma 管理以下表：

| 表名 | 说明 |
|------|------|
| `users` | 用户（id、name、role、defaultCli） |
| `conversations` | 会话（ownerUserId、title、deletedAt） |
| `messages` | 消息（conversationId、role、content） |
| `message_evidence` | 消息引用的证据片段 |
| `source_configs` | 数据源配置（mcp / db 的 endpoint 和开关） |
| `skills` | Skill 元数据和 JSON 配置 |
| `sync_jobs` | 文档上传任务记录 |
| `audit_logs` | 管理操作审计日志 |
| `knowledge_articles` | DB 数据源的知识文章 |

---

## API 参考

### 流式检索

```http
POST /find/search/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "CVTE 是什么公司",
  "top_k": 5,
  "sources": ["local", "mcp", "db"],
  "user_context": {
    "platform": "find_core",
    "conversation_id": "conv-xxx"
  }
}
```

SSE 事件类型：

| 事件 | 内容 |
|------|------|
| `chunk` | `{ text: "..." }` 文本片段 |
| `done` | `{ evidence: [...], source_status: [...], skill_names: [...] }` |
| `error` | `{ message: "..." }` |

`platform` 可选值：

| 值 | 回答方式 |
|----|---------|
| `find_core`（默认） | 调用 Anthropic API |
| `claude_code` | spawn `claude -p <prompt>` |
| `cursor` / `opencode` | spawn `opencode run <prompt>` |

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/admin/sources/mcp` | MCP 数据源配置 |
| GET/PUT | `/api/admin/sources/sqlite` | SQLite 数据源配置 |
| POST | `/api/ingest/http/push` | 上传文档 |
| GET | `/api/ingest/http/files` | 已上传文件列表 |
| DELETE | `/api/ingest/http/files/*` | 删除文件 |
| GET/PUT/POST | `/api/admin/skills` | Skill 管理 |
| GET | `/api/admin/system/audit` | 审计日志 |

---

## Docker 部署

### 一键启动

```bash
docker compose up --build
```

访问：
- Web 界面：http://localhost:3000
- API：http://localhost:3001

### 部署到远程服务器

`NEXT_PUBLIC_API_URL` 在构建时嵌入 Next.js，需提前指定：

```bash
NEXT_PUBLIC_API_URL=http://<服务器IP>:3001 docker compose up --build
```

或在 `.env` 中设置后再构建：

```env
NEXT_PUBLIC_API_URL=http://your-server.example.com:3001
ANTHROPIC_AUTH_TOKEN=sk-ant-...
INGEST_TOKEN=your-secure-token
```

### 数据持久化

| 卷名 | 挂载路径 | 用途 |
|------|----------|------|
| `db_data` | `/data/db` | SQLite 数据库 |
| `docs_data` | `/data/docs` | 上传的文档 |
| `config_data` | `/data/config` | sources.json 配置 |
| `skills_data` | `/app/apps/api/skills` | Skill .md 文件 |

---

## AI 工具适配器

`adapters/` 目录提供各工具的接入配置，复制到对应工具的配置目录后即可使用：

- `adapters/claude-code/commands/find.md` → Claude Code 自定义命令
- `adapters/cursor/prompts/find.prompt.md` + `mcp.json` → Cursor
- `adapters/opencode/commands/find.md` + `tool-config.json` → Opencode

---

## 常用开发命令

```bash
# 启动所有服务
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 构建所有包
pnpm build

# 单独启动某个服务
cd services/find-core && pnpm dev
cd services/mcp-mock && pnpm dev

# 数据库可视化
cd apps/api && npx prisma studio
```
