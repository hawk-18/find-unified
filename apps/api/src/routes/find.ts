import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../plugins/auth.js'

const anthropic = new Anthropic({
  ...(process.env.ANTHROPIC_AUTH_TOKEN
    ? { authToken: process.env.ANTHROPIC_AUTH_TOKEN }
    : { apiKey: process.env.ANTHROPIC_API_KEY }),
  baseURL: process.env.ANTHROPIC_BASE_URL,
})

// ── Skill system prompt builder ───────────────────────────────────────────────

const SKILLS_DIR = path.resolve(process.cwd(), 'skills')
const STAGE_ORDER = ['pre_search', 'post_search', 'post_answer'] as const

interface SkillMeta {
  name: string
  stage: string
  enabled: boolean
  body: string
}

function parseSkillFile(content: string): SkillMeta | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null
  const meta: Partial<SkillMeta> = {}
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim()
    if (key === 'name') meta.name = val
    else if (key === 'stage') meta.stage = val
    else if (key === 'enabled') meta.enabled = val === 'true'
  }
  meta.body = match[2]?.trim() ?? ''
  if (!meta.name) return null
  return meta as SkillMeta
}

async function buildSystemPrompt(): Promise<string> {
  let files: string[]
  try {
    files = await fs.readdir(SKILLS_DIR)
  } catch {
    return ''
  }

  const skills: SkillMeta[] = []
  for (const f of files.filter((f) => f.endsWith('.md'))) {
    try {
      const content = await fs.readFile(path.join(SKILLS_DIR, f), 'utf-8')
      const skill = parseSkillFile(content)
      if (skill && skill.enabled && skill.body) skills.push(skill)
    } catch { /* skip */ }
  }

  if (skills.length === 0) return ''

  const sections: string[] = []
  for (const stage of STAGE_ORDER) {
    const group = skills.filter((s) => s.stage === stage)
    for (const s of group) {
      const stageLabel = stage === 'pre_search' ? '检索前' : stage === 'post_search' ? '检索后' : '回答后'
      sections.push(`## [${stageLabel}] ${s.name}\n${s.body}`)
    }
  }

  return sections.join('\n\n')
}

async function getEnabledSkillNames(): Promise<string[]> {
  try {
    const files = await fs.readdir(SKILLS_DIR)
    const names: string[] = []
    for (const f of files.filter((f) => f.endsWith('.md'))) {
      try {
        const content = await fs.readFile(path.join(SKILLS_DIR, f), 'utf-8')
        const skill = parseSkillFile(content)
        if (skill && skill.enabled && skill.body) names.push(skill.name)
      } catch { /* skip */ }
    }
    return names
  } catch {
    return []
  }
}

function appendSkillFooter(answer: string, skillNames: string[]): string {
  if (skillNames.length === 0) return answer
  return `${answer}\n\n已应用 Skill：${skillNames.join('、')}`
}

const requestSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(20).default(5),
  sources: z.array(z.enum(['local', 'mcp', 'db'])).default(['local', 'mcp', 'db']),
  filters: z.record(z.unknown()).optional(),
  user_context: z.record(z.unknown()).optional(),
})

const FIND_CORE_URL = process.env.FIND_CORE_URL ?? 'http://127.0.0.1:8787'

// ── CLI dispatch ──────────────────────────────────────────────────────────────

function spawnCli(cmd: string, args: string[]): Promise<string> {
  const isClaudeCli = cmd.includes('claude')
  const finalArgs = isClaudeCli
    ? [...args, '--disable-slash-commands']
    : args
  const escaped = finalArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
  const shellCmd = `${cmd} ${escaped} < /dev/null`
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', shellCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90000,
      cwd: '/tmp',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}` },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`exit ${code}: ${stderr.trim().slice(0, 300)}`))
    })
    child.on('error', reject)
  })
}

function spawnCliStream(
  cmd: string,
  args: string[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const isClaudeCli = cmd.includes('claude')
  // --disable-slash-commands prevents /find skill from recursively triggering itself
  // --output-format stream-json + --verbose enables real-time streaming output
  const finalArgs = isClaudeCli
    ? [...args, '--output-format', 'stream-json', '--verbose', '--disable-slash-commands']
    : args
  const escaped = finalArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
  const shellCmd = `${cmd} ${escaped} < /dev/null`
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', shellCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90000,
      cwd: '/tmp',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}` },
    })
    let stderr = ''
    let buffer = ''
    child.stdout.on('data', (d: Buffer) => {
      if (!isClaudeCli) {
        onChunk(d.toString())
        return
      }
      buffer += d.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line) as {
            type: string
            subtype?: string
            result?: string
            message?: { content?: Array<{ type: string; text?: string }> }
          }
          if (evt.type === 'assistant' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'text' && block.text) {
                onChunk(block.text)
              }
            }
          }
          if (evt.type === 'result' && evt.subtype === 'success' && evt.result) {
            onChunk(evt.result)
          }
        } catch { /* skip non-JSON lines */ }
      }
    })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`exit ${code}: ${stderr.trim().slice(0, 300)}`))
    })
    child.on('error', reject)
  })
}

async function buildCliContext(): Promise<string> {
  const sections: string[] = []

  // ── 1. 数据源配置 ─────────────────────────────────────────────────────────
  try {
    const sourcesRaw = await fs.readFile(
      path.resolve(process.cwd(), '../../services/find-core/config/sources.json'),
      'utf-8'
    )
    const sources = JSON.parse(sourcesRaw) as {
      local?: { enabled?: boolean; roots?: string[] }
      mcp?: { enabled?: boolean; endpoint?: string }
      db?: { enabled?: boolean; host?: string; dbname?: string; user?: string }
    }

    const lines: string[] = ['## 数据源配置']
    if (sources.local?.enabled && sources.local.roots?.length) {
      lines.push(`- 本地文档目录：${sources.local.roots.join('、')}`)
    }
    if (sources.mcp?.enabled && sources.mcp.endpoint) {
      lines.push(`- MCP 端点：${sources.mcp.endpoint}`)
    }
    if (sources.db?.enabled && sources.db.host) {
      lines.push(`- 数据库：${sources.db.host}/${sources.db.dbname}（用户 ${sources.db.user}）`)
    }
    sections.push(lines.join('\n'))
  } catch { /* ignore */ }

  // ── 2. 文档更新（Git 同步配置）────────────────────────────────────────────
  try {
    const gitSource = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
    if (gitSource) {
      const cfg = JSON.parse(gitSource.configJson) as {
        repo?: string; branch?: string; sync_interval_minutes?: number
      }
      if (cfg.repo) {
        sections.push(
          `## 文档同步\n- Git 仓库：${cfg.repo}\n- 分支：${cfg.branch ?? 'main'}\n- 同步间隔：${cfg.sync_interval_minutes ?? 60} 分钟`
        )
      }
    }
  } catch { /* ignore */ }

  // ── 3. Skill 指令 ─────────────────────────────────────────────────────────
  const skillSection = await buildSystemPrompt()
  if (skillSection) {
    sections.push(`## Skill 指令\n${skillSection}`)
  }

  if (sections.length === 0) return ''
  return sections.join('\n\n')
}

async function searchViaCli(platform: string, query: string): Promise<unknown> {
  const context = await buildCliContext()
  const prompt = context
    ? `${context}\n\n## 用户问题\n${query}`
    : query

  let output: string
  if (platform === 'opencode') {
    output = await spawnCli('/opt/homebrew/bin/opencode', ['run', prompt])
  } else {
    // claude_code (default)
    output = await spawnCli('/opt/homebrew/bin/claude', ['-p', prompt])
  }
  return {
    answer: output,
    highlights: [],
    evidence: [],
    source_status: [{ source: platform, status: 'ok' }],
    trace_id: `${platform}-${Date.now()}`,
  }
}

// ── Short-term memory ─────────────────────────────────────────────────────────

async function loadRecentHistory(
  conversationId: string,
  limit = 6
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const msgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    })
    return msgs.reverse() as Array<{ role: 'user' | 'assistant'; content: string }>
  } catch {
    return []
  }
}

function historyToText(history: Array<{ role: string; content: string }>): string {
  if (history.length === 0) return ''
  return history
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 300)}`)
    .join('\n')
}

// ── History persistence ───────────────────────────────────────────────────────

async function persistHistory(
  userId: string,
  conversationId: string,
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseBody: any
) {
  try {
    const evidence: Array<{
      source_type: string
      title: string
      snippet: string
      score: number
      source_ref: string
    }> = responseBody.evidence ?? []

    await prisma.message.create({
      data: { conversationId, role: 'user', content: query },
    })

    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: responseBody.answer ?? '',
        traceId: responseBody.trace_id ?? null,
        evidence: {
          create: evidence.map((e) => ({
            sourceType: e.source_type,
            title: e.title,
            snippet: e.snippet,
            score: e.score,
            sourceRef: e.source_ref,
          })),
        },
      },
    })

    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })
  } catch (err) {
    console.error('[find] persistHistory error', err)
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function findRoutes(app: FastifyInstance) {
  // ── Streaming endpoint (SSE) ──────────────────────────────────────────────
  app.post('/find/search/stream', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const body = parsed.data
    const platform = (body.user_context?.platform as string) ?? 'claude_code'

    request.log.info({ userId: request.user?.userId, action: 'find_search_stream', query: body.query, platform })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*')
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
    reply.raw.flushHeaders()

    const sendEvent = (event: string, data: string) => {
      reply.raw.write(`event: ${event}\ndata: ${data}\n\n`)
    }

    if (platform === 'claude_code' || platform === 'opencode' || platform === 'cursor') {
      const effectivePlatform = platform === 'cursor' ? 'opencode' : platform
      try {
        // First fetch evidence from find-core (local + MCP + DB)
        let evidenceText = '未检索到相关内容。'
        let coreData: Record<string, unknown> = {}
        try {
          // Fetch more evidence internally so low-scoring sources (MCP) aren't cut off
          const internalTopK = Math.max((body.top_k ?? 5) * 2, 10)
          const coreRes = await fetch(`${FIND_CORE_URL}/find/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, top_k: internalTopK }),
          })
          coreData = await coreRes.json() as Record<string, unknown>
          const allEvidence = (coreData.evidence as Array<{ title: string; snippet: string; source_ref: string }>) ?? []
          if (allEvidence.length) {
            evidenceText = allEvidence.map((e, i) => `[${i + 1}] ${e.title}\n${e.snippet}\n来源: ${e.source_ref}${(e as {source_type?:string}).source_type === 'mcp' ? '（mcp数据源）' : ''}`).join('\n\n')
          }
        } catch { /* find-core unavailable, continue with CLI only */ }

        const convId = (body.user_context?.conversation_id as string) ?? null
        const history = convId ? await loadRecentHistory(convId) : []

        const cliContext = await buildCliContext()  // includes skill instructions
        const skillNames = await getEnabledSkillNames()
        const prompt = [
          cliContext,
          history.length ? `## 对话历史（近期记忆）\n${historyToText(history)}` : '',
          `## 检索结果（已由知识库聚合，请仅基于以下内容回答，不要自行读取文件）\n${evidenceText}`,
          `## 用户问题\n${body.query}`,
        ].filter(Boolean).join('\n\n')

        const cliCmd = effectivePlatform === 'opencode'
          ? { cmd: '/opt/homebrew/bin/opencode', args: ['run', prompt] }
          : { cmd: '/opt/homebrew/bin/claude', args: ['-p', prompt] }

        let fullAnswer = ''
        try {
          await spawnCliStream(cliCmd.cmd, cliCmd.args, (chunk) => {
            fullAnswer += chunk
            sendEvent('chunk', JSON.stringify({ text: chunk }))
          })
        } catch {
          // CLI unavailable — fall back to raw evidence summary
          const coreEvidence = (coreData.evidence as Array<{ title: string; snippet: string }>) ?? []
          fullAnswer = coreEvidence.length
            ? `已检索到 ${coreEvidence.length} 条相关知识片段：\n\n${coreEvidence.map((e, i) => `[${i + 1}] **${e.title}**\n${e.snippet}`).join('\n\n')}`
            : `未检索到与"${body.query}"相关的内容。`
          sendEvent('chunk', JSON.stringify({ text: fullAnswer }))
        }

        const evidence = (coreData.evidence as unknown[]) ?? []
        sendEvent('done', JSON.stringify({
          answer: fullAnswer.trim(),
          highlights: (coreData.highlights as string[]) ?? [],
          evidence,
          source_status: (coreData.source_status as unknown[]) ?? [{ source: platform, status: 'ok' }],
          trace_id: (coreData.trace_id as string) ?? `${platform}-${Date.now()}`,
          skill_names: skillNames,
        }))

        if (request.user && convId) {
          persistHistory(request.user.userId, convId, body.query, {
            answer: fullAnswer.trim(),
            highlights: (coreData.highlights as string[]) ?? [],
            evidence,
            trace_id: (coreData.trace_id as string) ?? `${platform}-${Date.now()}`,
          })
        }
      } catch (err) {
        sendEvent('error', JSON.stringify({ message: String(err) }))
      }
    } else {
      // find-core: retrieve evidence, then stream LLM answer
      try {
        const convId = (body.user_context?.conversation_id as string) ?? null
        const history = convId ? await loadRecentHistory(convId) : []

        const internalTopK = Math.max((body.top_k ?? 5) * 2, 10)
        const coreRes = await fetch(`${FIND_CORE_URL}/find/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, top_k: internalTopK }),
        })
        const data = await coreRes.json() as Record<string, unknown>
        const evidence = ((data.evidence as Array<{ title: string; snippet: string; source_ref: string }>) ?? []).slice(0, body.top_k ?? 5)
        const systemPrompt = await buildSystemPrompt()
        const skillNames = systemPrompt ? await getEnabledSkillNames() : []

        // Build context from evidence
        const evidenceText = evidence.length
          ? evidence.map((e, i) => `[${i + 1}] ${e.title}\n${e.snippet}\n来源: ${e.source_ref}${e.source_type === 'mcp' ? '（mcp数据源）' : ''}`).join('\n\n')
          : '未检索到相关内容。'

        const messages: Anthropic.MessageParam[] = [
          ...(history.length
            ? history.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content.slice(0, 500),
              }))
            : []),
          {
            role: 'user' as const,
            content: `请根据以下检索到的知识库内容，回答用户的问题。如果检索内容与问题无关，请如实说明。

## 检索结果
${evidenceText}

## 用户问题
${body.query}`,
          },
        ]

        let fullAnswer = ''
        try {
          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages,
          })

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullAnswer += event.delta.text
              sendEvent('chunk', JSON.stringify({ text: event.delta.text }))
            }
          }
        } catch {
          // LLM unavailable — build fallback answer incorporating history if relevant
          const historyContext = history.length
            ? `\n\n**对话历史参考：**\n${historyToText(history)}`
            : ''
          fullAnswer = evidence.length
            ? `已检索到 ${evidence.length} 条相关知识片段，请参考以下内容：\n\n${evidence.map((e, i) => `[${i + 1}] **${e.title}**\n${e.snippet}`).join('\n\n')}${historyContext}`
            : `未检索到与"${body.query}"相关的内容。${historyContext}`
          sendEvent('chunk', JSON.stringify({ text: fullAnswer }))
        }

        const result = {
          answer: fullAnswer,
          highlights: (data.highlights as string[]) ?? [],
          evidence,
          source_status: (data.source_status as unknown[]) ?? [],
          trace_id: (data.trace_id as string) ?? `find_core-${Date.now()}`,
          skill_names: skillNames,
        }
        sendEvent('done', JSON.stringify(result))

        if (request.user && convId) {
          persistHistory(request.user.userId, convId, body.query, result)
        }
      } catch (err) {
        sendEvent('error', JSON.stringify({ message: String(err) }))
      }
    }

    reply.raw.end()
    return reply
  })

  app.post('/find/search', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const body = parsed.data
    const platform = (body.user_context?.platform as string) ?? 'claude_code'

    request.log.info({ userId: request.user?.userId, action: 'find_search', query: body.query, platform })

    let responseBody: unknown

    const searchViaCore = async () => {
      let coreRes: Response
      try {
        coreRes = await fetch(`${FIND_CORE_URL}/find/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (err) {
        return reply.status(502).send({ error: 'find-core unreachable', detail: String(err) })
      }
      return coreRes.json()
    }

    try {
      if (platform === 'claude_code' || platform === 'opencode' || platform === 'cursor') {
        const effectivePlatform = platform === 'cursor' ? 'opencode' : platform
        try {
          // Fetch evidence from find-core first
          let coreData: Record<string, unknown> = {}
          let evidenceText = '未检索到相关内容。'
          try {
            const coreRes = await fetch(`${FIND_CORE_URL}/find/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            coreData = await coreRes.json() as Record<string, unknown>
            const evidence = (coreData.evidence as Array<{ title: string; snippet: string; source_ref: string }>) ?? []
            if (evidence.length) {
              evidenceText = evidence.map((e, i) => `[${i + 1}] ${e.title}\n${e.snippet}\n来源: ${e.source_ref}${(e as {source_type?:string}).source_type === 'mcp' ? '（mcp数据源）' : ''}`).join('\n\n')
            }
          } catch { /* find-core unavailable */ }

          const cliContext = await buildCliContext()
          const prompt = [
            cliContext,
            `## 检索结果\n${evidenceText}`,
            `## 用户问题\n${body.query}`,
          ].filter(Boolean).join('\n\n')

          const cliOutput = await spawnCli(
            effectivePlatform === 'opencode' ? '/opt/homebrew/bin/opencode' : '/opt/homebrew/bin/claude',
            effectivePlatform === 'opencode' ? ['run', prompt] : ['-p', prompt],
          )
          responseBody = {
            answer: cliOutput,
            highlights: (coreData.highlights as string[]) ?? [],
            evidence: (coreData.evidence as unknown[]) ?? [],
            source_status: (coreData.source_status as unknown[]) ?? [{ source: platform, status: 'ok' }],
            trace_id: (coreData.trace_id as string) ?? `${platform}-${Date.now()}`,
          }
        } catch (cliErr) {
          request.log.warn({ platform, err: String(cliErr) }, 'CLI search failed, falling back to find-core')
          responseBody = await searchViaCore()
        }
      } else {
        responseBody = await searchViaCore()
      }
    } catch (err) {
      return reply.status(502).send({ error: 'Search failed', detail: String(err) })
    }

    const conversationId = (body.user_context?.conversation_id as string) ?? null
    if (request.user && conversationId) {
      persistHistory(request.user.userId, conversationId, body.query, responseBody)
    }

    const systemPrompt = await buildSystemPrompt()
    const result = systemPrompt
      ? { ...(responseBody as object), system_prompt: systemPrompt }
      : responseBody

    return reply.send(result)
  })
}

