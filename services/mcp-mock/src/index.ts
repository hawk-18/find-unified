import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import http from 'node:http'

const PORT = Number(process.env.MCP_PORT ?? 9090)

// ── Mock knowledge base ───────────────────────────────────────────────────────

const KNOWLEDGE: Array<{ title: string; content: string; tags: string[] }> = [
  {
    title: 'CVTE 产业园区布局',
    content:
      'CVTE（视源股份）目前在全国拥有 5 个产业园区，形成完整的研发、生产与运营体系：\n\n' +
      '1. 广州天河园区（总部）：位于广州天河区科韵路，是 CVTE 核心研发与管理中心，汇聚了最主要的研发团队和职能部门。\n\n' +
      '2. 广州番禺园区：主要承载显示主控板的规模化生产，配备现代化 SMT 产线，是核心制造基地。\n\n' +
      '3. 广州南沙园区：聚焦新业务孵化与智能硬件研发，承接部分希沃（Seewo）产品线的研发工作。\n\n' +
      '4. 武汉园区：中部区域研发与销售中心，支撑教育信息化业务在华中地区的快速扩张。\n\n' +
      '5. 成都园区：西部区域运营中心，负责西南市场的技术支持与售后服务体系建设。\n\n' +
      '五大园区协同运作，覆盖华南、华中、西部核心市场，支撑 CVTE 全国化战略落地。',
    tags: ['cvte', '视源股份', '产业园区', '园区', '布局', '广州', '武汉', '成都'],
  },
  {
    title: 'find-unified 架构概览',
    content:
      '1. apps/api — Fastify REST API，负责对话管理、admin 配置和文档同步调度\n' +
      '2. apps/web — Next.js 前端，提供检索界面和管理后台\n' +
      '3. services/find-core — 检索核心，聚合 local/MCP/DB 三个数据源',
    tags: ['架构', 'find-unified', 'overview'],
  },
  {
    title: '如何配置 MCP 数据源',
    content:
      '进入 /admin/sources 页面，切换到 MCP 选项卡。\n' +
      '填写 Endpoint URL（例如 http://localhost:9090）并启用开关，点击保存。\n' +
      '配置会同步写入 services/find-core/config/sources.json，find-core 下次检索时生效。\n' +
      'MCP 服务需要暴露 find_search 工具，接受 query 和 top_k 参数。',
    tags: ['mcp', 'configuration', 'admin'],
  },
  {
    title: 'PostgreSQL 数据源接入说明',
    content:
      '进入 /admin/sources 页面，切换到 PostgreSQL 选项卡。\n' +
      '填写 host、port、database、user、password 后保存。\n' +
      'find-core 会自动发现 public schema 下含有文本列的表，并执行 ILIKE 检索。\n' +
      '敏感字段（password）在数据库中加密存储，写入 sources.json 时自动解密。',
    tags: ['postgresql', 'database', 'configuration'],
  },
  {
    title: '文档同步：Git 仓库',
    content:
      '进入 /admin/sync 页面展开"Git 仓库配置"面板。\n' +
      '填写仓库地址（HTTPS 或 SSH）、分支名称和认证方式后保存。\n' +
      '点击"立即同步"触发 BullMQ 任务，克隆/更新到 /tmp/find-sync/git/<slug>/。\n' +
      '同步完成后，目录自动注册到 sources.json，find-core 即可检索其中的 Markdown 文件。',
    tags: ['sync', 'git', 'ingest'],
  },
  {
    title: '本地文件检索配置',
    content:
      'find-core 从 sources.json 的 local.roots 数组读取本地检索根目录。\n' +
      '支持通过 /admin/sync/local/config 接口 GET/PUT 管理 roots 列表。\n' +
      '只有 .md 文件会被索引，node_modules 和 .git 目录自动跳过。\n' +
      'max_files 默认 2000，可在 sources.json 中调整。',
    tags: ['local', 'files', 'markdown', 'roots'],
  },
  {
    title: 'Skill 系统说明',
    content:
      'Skill 是可插拔的检索增强模块，分三个阶段：\n' +
      '- pre_search：query_expand（同义词扩展）、lang_detect、query_filter\n' +
      '- post_search：rerank（重排序）、source_boost（来源权重）、dedup（去重）\n' +
      '- post_answer：suggest（相关推荐）、citation（引用格式化）、feedback_collector\n' +
      '通过 /admin/skills 页面可启用/禁用和调整配置。',
    tags: ['skills', 'rerank', 'pipeline'],
  },
  {
    title: 'API 认证机制',
    content:
      'API 使用 JWT 认证（@fastify/jwt）。\n' +
      '管理接口需要 admin 角色，普通检索接口需要有效 token。\n' +
      '开发模式下可通过 /api/me/token 获取测试 token。\n' +
      'Token 有效期默认 7 天，可通过环境变量 JWT_EXPIRES_IN 调整。',
    tags: ['auth', 'jwt', 'security'],
  },
  {
    title: '检索结果融合算法',
    content:
      'find-core 并行查询 local、MCP、db 三个源，各自返回 Evidence 列表。\n' +
      '每个 Evidence 包含 score，由 BM25 风格的关键词匹配计算得出。\n' +
      'fusion.weights 可以为每个源设置权重系数（默认均为 1.0）。\n' +
      '合并后按 score 降序排列，SHA1 去重，取 top_k 条返回。',
    tags: ['fusion', 'ranking', 'algorithm', 'bm25'],
  },
]

// ── Score helper ─────────────────────────────────────────────────────────────

function scoreDoc(doc: typeof KNOWLEDGE[0], query: string): number {
  const q = query.toLowerCase()
  // Split ASCII tokens and CJK tokens separately so mixed queries like "检索cvte" work
  const asciiTokens = Array.from(q.matchAll(/[a-z0-9]+/g), (m) => m[0]).filter((t) => t.length >= 2)
  const cjkTokens = Array.from(q.matchAll(/[\u4e00-\u9fff]{2,}/g), (m) => m[0])
  const tokens = [...asciiTokens, ...cjkTokens]
  if (tokens.length === 0) tokens.push(q)

  const text = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase()
  let score = 0
  for (const t of tokens) {
    score += (text.split(t).length - 1) * 2
  }
  if (doc.title.toLowerCase().split(q).length > 1) score += 5
  return score
}

// ── Build MCP server ──────────────────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: 'find-mock-mcp', version: '1.0.0' })

  server.tool(
    'find_search',
    'Search the mock knowledge base',
    { query: z.string().describe('Search query'), top_k: z.number().int().min(1).max(10).optional() },
    async ({ query, top_k = 5 }) => {
      const scored = KNOWLEDGE.map((doc) => ({ doc, score: scoreDoc(doc, query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, top_k)

      if (!scored.length) {
        return { content: [{ type: 'text' as const, text: '未找到相关知识条目' }] }
      }

      const items = scored.map(({ doc, score }) => ({
        type: 'text' as const,
        text: JSON.stringify({ title: doc.title, snippet: doc.content.slice(0, 300), score, tags: doc.tags }),
      }))
      return { content: items }
    }
  )

  return server
}

// ── HTTP server (StreamableHTTP transport) ────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'mcp-mock' }))
    return
  }

  const mcpServer = buildMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on('close', () => {
    transport.close().catch(() => {})
    mcpServer.close().catch(() => {})
  })

  try {
    await mcpServer.connect(transport)
    await transport.handleRequest(req, res)
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[mcp-mock] listening on http://0.0.0.0:${PORT}`)
})
