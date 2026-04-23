import Fastify from 'fastify'
import cors from '@fastify/cors'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import Database from 'better-sqlite3'

const CONFIG_PATH =
  process.env.FIND_CONFIG_PATH ||
  '/data/config/sources.json'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceConfig {
  local?: { enabled?: boolean; roots?: string[]; max_files?: number; max_snippets?: number }
  mcp?: { enabled?: boolean; endpoint?: string; timeout_ms?: number }
  db?: { enabled?: boolean; url?: string }
  fusion?: { weights?: { local?: number; mcp?: number; db?: number }; top_k_default?: number }
}

interface Evidence {
  id: string
  source_type: 'local' | 'mcp' | 'db'
  title: string
  snippet: string
  score: number
  source_ref: string
  updated_at?: string
}

interface SourceStatus {
  source: 'local' | 'mcp' | 'db'
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
  latency_ms?: number
}

// ─── Request Schema (Zod, aligns with contracts/find.request.schema.json) ────

const FindRequestSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(20).optional(),
  sources: z.array(z.enum(['local', 'mcp', 'db'])).optional(),
  filters: z.record(z.unknown()).optional(),
  user_context: z.record(z.unknown()).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now()
}

function loadConfig(): SourceConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as SourceConfig
  } catch {
    return {
      local: { enabled: true, roots: ['/data/docs', '/tmp/find-sync/http'], max_files: 200, max_snippets: 5 },
      mcp: { enabled: true, endpoint: '' },
      db: { enabled: true, host: '', dbname: '' },
      fusion: { weights: { local: 1.0, mcp: 1.0, db: 1.0 }, top_k_default: 5 },
    }
  }
}

function walkMdFiles(root: string, maxFiles: number, out: string[]): void {
  const stack = [root]
  while (stack.length && out.length < maxFiles) {
    const cur = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = path.join(cur, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue
        stack.push(p)
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push(p)
        if (out.length >= maxFiles) break
      }
    }
  }
}

function scoreSnippet(text: string, keywords: string[]): number {
  const t = text.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    if (!kw) continue
    const c = t.split(kw).length - 1
    score += c * 2
  }
  return score
}

// ─── Fuzzy correction (edit distance) ────────────────────────────────────────

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Build a vocabulary of ASCII tokens found across all indexed files
function buildVocab(files: string[]): Set<string> {
  const vocab = new Set<string>()
  for (const file of files) {
    let content: string
    try { content = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const m of content.toLowerCase().matchAll(/[a-z0-9]{2,}/g)) {
      vocab.add(m[0])
    }
  }
  return vocab
}

// For a given token, find the closest word in vocab within maxDist
function findClosest(token: string, vocab: Set<string>, maxDist: number): string | null {
  let best: string | null = null
  let bestDist = maxDist + 1
  for (const word of vocab) {
    // Skip if length difference is too large (quick pre-filter)
    if (Math.abs(word.length - token.length) > maxDist) continue
    const d = editDistance(token, word)
    if (d > 0 && d <= maxDist && d < bestDist) {
      bestDist = d
      best = word
    }
  }
  return best
}

// Expand keywords: for each ASCII token not found in vocab, add the closest match
function expandWithFuzzy(keywords: string[], vocab: Set<string>): string[] {
  const expanded = [...keywords]
  for (const kw of keywords) {
    // Only apply to ASCII tokens
    if (!/^[a-z0-9]+$/.test(kw)) continue
    // Already exists in vocab → no correction needed
    if (vocab.has(kw)) continue
    // Max edit distance scales with token length: 1 for ≤5 chars, 2 for longer
    const maxDist = kw.length <= 5 ? 1 : 2
    const correction = findClosest(kw, vocab, maxDist)
    if (correction && !expanded.includes(correction)) {
      expanded.push(correction)
    }
  }
  return expanded
}

function extractKeywords(query: string): string[] {
  const lower = query.toLowerCase()
  // Extract ASCII tokens (e.g. "cvte", "api", "v2")
  const asciiTokens = Array.from(lower.matchAll(/[a-z0-9]+/g), (m) => m[0]).filter((t) => t.length >= 2)
  // Split CJK text on common function words/particles, keep segments ≥2 chars as nouns
  const cjkNounSegments = lower
    .replace(/[a-z0-9]+/g, ' ')
    .split(/[\s\u7684\u4e86\u662f\u5728\u6709\u548c\u4e0e\u6216\u4e3a\u5bf9\u4ece\u5230\u628a\u88ab\u8ba9\u4f7f\u4e86\u800c\u4ee5\u53ca\u7b49\u554a\u5417\u5440\u5462\u5417\u8bf7\u4f60\u6211\u4ed6\u5979\u5b83\u4e86\u4e48\u4e2a\u5c31\u90a3\u8fd9]+/)
    .map((s) => s.replace(/[^\u4e00-\u9fff]/g, '').trim())
    .filter((s) => s.length >= 2)

  const candidates = [...asciiTokens, ...cjkNounSegments]
  const uniq: string[] = []
  for (const t of candidates) {
    if (!uniq.includes(t)) uniq.push(t)
    if (uniq.length >= 8) break
  }
  return uniq.length ? uniq : [lower]
}

function toTitleFromFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const line = content.split('\n').find((l) => l.startsWith('# '))
    if (line) return line.slice(2).trim()
  } catch {}
  return path.basename(filePath)
}

function findLocal(
  query: string,
  cfg: SourceConfig
): { status: SourceStatus; evidence: Evidence[] } {
  const start = nowMs()
  if (!cfg.local?.enabled) {
    return {
      status: { source: 'local', status: 'unavailable', message: 'local source disabled', latency_ms: 0 },
      evidence: [],
    }
  }

  const roots =
    Array.isArray(cfg.local?.roots) && cfg.local.roots.length ? cfg.local.roots : ['/data/docs']
  const maxFiles = Number(cfg.local?.max_files || 200)
  const maxSnippets = Number(cfg.local?.max_snippets || 5)
  const files: string[] = []
  for (const r of roots) walkMdFiles(r, maxFiles, files)

  const keywords = extractKeywords(query)
  // Build vocab from indexed files and expand keywords with fuzzy correction
  const vocab = buildVocab(files)
  const expandedKeywords = expandWithFuzzy(keywords, vocab)
  const scored: { file: string; snippet: string; score: number }[] = []

  for (const file of files) {
    let content: string
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const s = scoreSnippet(line, expandedKeywords)
      if (s <= 0) continue
      const prev = lines[i - 1] || ''
      const next = lines[i + 1] || ''
      const snippet = [prev, line, next].filter(Boolean).join(' ').slice(0, 300)
      scored.push({ file, snippet, score: s + (line.startsWith('#') ? 2 : 0) })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, maxSnippets)
  const evidence: Evidence[] = top.map((x, idx) => ({
    id: `local-${idx + 1}`,
    source_type: 'local',
    title: toTitleFromFile(x.file),
    snippet: x.snippet,
    score: Number((x.score * (cfg.fusion?.weights?.local || 1.0)).toFixed(2)),
    source_ref: x.file,
  }))

  const latency = nowMs() - start
  return {
    status: {
      source: 'local',
      status: 'ok',
      message: evidence.length ? `命中 ${evidence.length} 条` : '未命中本地 Markdown',
      latency_ms: latency,
    },
    evidence,
  }
}

// ─── MCP search ───────────────────────────────────────────────────────────────

async function findMcp(
  query: string,
  cfg: SourceConfig
): Promise<{ status: SourceStatus; evidence: Evidence[] }> {
  const start = nowMs()
  const mcpCfg = cfg.mcp

  if (!mcpCfg?.enabled) {
    return {
      status: { source: 'mcp', status: 'unavailable', message: 'mcp source disabled', latency_ms: 0 },
      evidence: [],
    }
  }
  if (!mcpCfg.endpoint) {
    return {
      status: { source: 'mcp', status: 'degraded', message: '未配置 MCP endpoint', latency_ms: nowMs() - start },
      evidence: [],
    }
  }

  const timeoutMs = mcpCfg.timeout_ms ?? 8000
  const client = new Client({ name: 'find-core', version: '1.0.0' })

  try {
    const endpointUrl = new URL(mcpCfg.endpoint)

    // Try StreamableHTTP first, fall back to SSE
    let transport
    try {
      transport = new StreamableHTTPClientTransport(endpointUrl)
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), timeoutMs)),
      ])
    } catch {
      transport = new SSEClientTransport(endpointUrl)
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), timeoutMs)),
      ])
    }

    const evidence: Evidence[] = []

    // Try calling find_search tool if available
    const toolsResult = await client.listTools()
    const hasFindSearch = toolsResult.tools.some((t) => t.name === 'find_search')

    if (hasFindSearch) {
      const result = await client.callTool({ name: 'find_search', arguments: { query, top_k: 5 } })
      const items = Array.isArray(result.content) ? result.content : []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type === 'text') {
          // Try to parse structured JSON result from MCP server
          let title = `MCP 结果 ${i + 1}`
          let snippet = String(item.text).slice(0, 400)
          let score = Number(((5 - i) / 5).toFixed(2))
          try {
            const parsed = JSON.parse(String(item.text))
            if (parsed.title) title = parsed.title
            if (parsed.snippet) snippet = String(parsed.snippet).slice(0, 400)
            if (typeof parsed.score === 'number') {
              score = Number((parsed.score * (cfg.fusion?.weights?.mcp ?? 1.0)).toFixed(2))
            }
          } catch { /* not JSON, use raw text */ }
          evidence.push({
            id: `mcp-${i + 1}`,
            source_type: 'mcp',
            title,
            snippet,
            score,
            source_ref: mcpCfg.endpoint,
          })
        }
      }
    } else {
      // Fall back: search through resources
      const resources = await client.listResources()
      const keywords = extractKeywords(query)
      const scored: { res: typeof resources.resources[0]; score: number }[] = []
      for (const res of resources.resources) {
        const text = `${res.name} ${res.description ?? ''} ${res.uri}`
        const s = scoreSnippet(text, keywords)
        if (s > 0) scored.push({ res, score: s })
      }
      scored.sort((a, b) => b.score - a.score)
      for (let i = 0; i < Math.min(scored.length, 5); i++) {
        const { res, score } = scored[i]
        evidence.push({
          id: `mcp-${i + 1}`,
          source_type: 'mcp',
          title: res.name,
          snippet: res.description ?? res.uri,
          score: Number((score * (cfg.fusion?.weights?.mcp ?? 1.0)).toFixed(2)),
          source_ref: res.uri,
        })
      }
    }

    await client.close()

    return {
      status: {
        source: 'mcp',
        status: 'ok',
        message: evidence.length ? `命中 ${evidence.length} 条` : '未命中 MCP 资源',
        latency_ms: nowMs() - start,
      },
      evidence,
    }
  } catch (err) {
    return {
      status: {
        source: 'mcp',
        status: 'degraded',
        message: `MCP 调用失败: ${String(err).slice(0, 100)}`,
        latency_ms: nowMs() - start,
      },
      evidence: [],
    }
  }
}

// ─── SQLite search ────────────────────────────────────────────────────────────

async function findSqlite(
  query: string,
  cfg: SourceConfig
): Promise<{ status: SourceStatus; evidence: Evidence[] }> {
  const start = nowMs()
  const dbCfg = cfg.db

  if (!dbCfg?.enabled) {
    return {
      status: { source: 'db', status: 'unavailable', message: 'db source disabled', latency_ms: 0 },
      evidence: [],
    }
  }

  const dbUrl = dbCfg.url ?? process.env.DATABASE_URL ?? ''
  const dbPath = dbUrl.replace(/^file:/, '')

  if (!dbPath) {
    return {
      status: { source: 'db', status: 'degraded', message: '未配置 SQLite 路径', latency_ms: nowMs() - start },
      evidence: [],
    }
  }

  try {
    const db = new Database(dbPath, { readonly: true })
    const keywords = extractKeywords(query)

    // Build vocab from DB content and expand with fuzzy correction
    const dbVocab = new Set<string>()
    try {
      const allRows = db.prepare('SELECT title, content, tags FROM knowledge_articles LIMIT 500').all() as Array<{ title: string; content: string; tags: string }>
      for (const row of allRows) {
        for (const m of `${row.title} ${row.content} ${row.tags}`.toLowerCase().matchAll(/[a-z0-9]{2,}/g)) {
          dbVocab.add(m[0])
        }
      }
    } catch { /* table may not exist */ }
    const expandedKeywords = expandWithFuzzy(keywords, dbVocab)

    const evidence: Evidence[] = []

    // Search knowledge_articles
    const whereClauses = expandedKeywords.map(() => `(title LIKE ? OR content LIKE ?)`).join(' OR ')
    const params = expandedKeywords.flatMap((kw) => [`%${kw}%`, `%${kw}%`])

    try {
      const rows = db.prepare(
        `SELECT id, title, content, category, tags FROM knowledge_articles WHERE ${whereClauses} LIMIT 20`
      ).all(...params) as Array<{ id: string; title: string; content: string; category: string; tags: string }>

      for (const row of rows) {
        const score = scoreSnippet(`${row.title} ${row.content}`, expandedKeywords)
        if (score <= 0) continue
        const snippet = row.content.slice(0, 300)
        evidence.push({
          id: `db-${evidence.length + 1}`,
          source_type: 'db',
          title: row.title,
          snippet,
          score: Number((score * (cfg.fusion?.weights?.db ?? 1.0)).toFixed(2)),
          source_ref: `db:knowledge_articles/${row.id}`,
        })
      }
    } catch { /* table may not exist */ }

    db.close()
    evidence.sort((a, b) => b.score - a.score)

    return {
      status: {
        source: 'db',
        status: 'ok',
        message: evidence.length ? `命中 ${evidence.length} 条` : '数据库中未命中相关记录',
        latency_ms: nowMs() - start,
      },
      evidence: evidence.slice(0, 5),
    }
  } catch (err) {
    return {
      status: {
        source: 'db',
        status: 'degraded',
        message: `SQLite 查询失败: ${String(err).slice(0, 100)}`,
        latency_ms: nowMs() - start,
      },
      evidence: [],
    }
  }
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const seen = new Set<string>()
  const out: Evidence[] = []
  for (const item of list) {
    const key = crypto
      .createHash('sha1')
      .update(`${item.source_type}|${item.title}|${item.snippet}`)
      .digest('hex')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function buildAnswer(
  query: string,
  evidence: Evidence[],
  sourceStatus: SourceStatus[]
): { answer: string; highlights: string[]; evidence: Evidence[]; source_status: SourceStatus[] } {
  if (!evidence.length) {
    return {
      answer: `未检索到与"${query}"直接相关的高置信知识点。`,
      highlights: ['建议缩短问题并增加关键词', '可指定产品/版本/时间范围以提高命中率'],
      evidence: [],
      source_status: sourceStatus,
    }
  }

  const highlights = evidence.slice(0, 3).map((e) => `${e.title}: ${e.snippet.slice(0, 60)}`)
  const answer = `已检索到与"${query}"相关的 ${evidence.length} 条证据，优先依据高分片段给出结论：请先参考首条来源并结合其余来源交叉确认。`

  return { answer, highlights, evidence, source_status: sourceStatus }
}

// ─── App Builder ──────────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors)

  app.get('/health', async () => {
    return { ok: true }
  })

  app.post('/find/search', async (request, reply) => {
    const parsed = FindRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' })
    }

    const body = parsed.data
    const cfg = loadConfig()
    const query = body.query.trim()
    const topK = body.top_k ?? cfg.fusion?.top_k_default ?? 5
    const sources =
      Array.isArray(body.sources) && body.sources.length ? body.sources : ['local', 'mcp', 'db'] as const

    const sourceStatus: SourceStatus[] = []
    let evidence: Evidence[] = []

    if (sources.includes('local')) {
      const r = findLocal(query, cfg)
      sourceStatus.push(r.status)
      evidence = evidence.concat(r.evidence)
    }

    if (sources.includes('mcp')) {
      const r = await findMcp(query, cfg)
      sourceStatus.push(r.status)
      evidence = evidence.concat(r.evidence)
    }

    if (sources.includes('db')) {
      const r = await findSqlite(query, cfg)
      sourceStatus.push(r.status)
      evidence = evidence.concat(r.evidence)
    }

    evidence.sort((a, b) => b.score - a.score)
    evidence = dedupeEvidence(evidence).slice(0, topK)

    const result = buildAnswer(query, evidence, sourceStatus)
    return reply.send({ ...result, trace_id: crypto.randomUUID() })
  })

  return app
}
