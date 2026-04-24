import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../plugins/auth.js'

const INGEST_TOKEN = process.env.INGEST_TOKEN ?? 'ingest-dev-token'
const SYNC_HTTP_DIR = process.env.SYNC_HTTP_DIR ?? '/tmp/find-sync/http'
const FIND_CONFIG_PATH =
  process.env.FIND_CONFIG_PATH ??
  '/data/config/sources.json'

// ── sources.json helpers ──────────────────────────────────────────────────────

interface SourcesConfig {
  local?: { enabled?: boolean; roots?: string[]; [k: string]: unknown }
  [k: string]: unknown
}

async function readSourcesConfig(): Promise<SourcesConfig> {
  try {
    return JSON.parse(await fs.readFile(FIND_CONFIG_PATH, 'utf-8')) as SourcesConfig
  } catch {
    return { local: { enabled: true, roots: [] } }
  }
}

async function ensureRootInConfig(dir: string): Promise<void> {
  const cfg = await readSourcesConfig()
  const roots: string[] = Array.isArray(cfg.local?.roots) ? (cfg.local!.roots as string[]) : []
  if (roots.includes(dir)) return
  const updated: SourcesConfig = {
    ...cfg,
    local: { ...(cfg.local ?? {}), roots: [...roots, dir] },
  }
  await fs.mkdir(path.dirname(FIND_CONFIG_PATH), { recursive: true })
  await fs.writeFile(FIND_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

const pushBodySchema = z.object({
  filename: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  content: z.string(),
  ref: z.string().optional(),
}).transform((d) => ({ ...d, source: d.filename ?? d.source ?? 'upload.md' }))

async function walkDir(dir: string, base: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const results: string[] = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    const rel = path.join(base, e.name)
    if (e.isDirectory()) results.push(...await walkDir(full, rel))
    else results.push(rel)
  }
  return results
}

export async function ingestRoutes(app: FastifyInstance) {
  // POST /api/ingest/http/push — token auth (external push / CI) or admin session
  app.post('/api/ingest/http/push', async (request, reply) => {
    const authHeader = request.headers['authorization']
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const isIngestToken = bearerToken === INGEST_TOKEN
    if (!isIngestToken) {
      // Fall back to admin session auth
      if (!bearerToken) return reply.status(401).send({ error: 'Unauthorized' })
      const { MOCK_USERS } = await import('../lib/mock-tokens.js')
      const user = MOCK_USERS.get(bearerToken)
      if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'Forbidden' })
      request.user = user
    }

    const parsed = pushBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const { source, content, ref } = parsed.data

    // Path traversal guard
    const resolved = path.resolve(path.join(SYNC_HTTP_DIR, source))
    if (!resolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
      return reply.status(400).send({ error: 'Invalid source path' })
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, content, 'utf-8')
    await ensureRootInConfig(SYNC_HTTP_DIR)

    const syncJob = await prisma.syncJob.create({
      data: {
        jobType: 'http',
        status: 'done',
        payloadJson: JSON.stringify({ filename: source, ref }),
        resultJson: JSON.stringify({ filePath: resolved, bytes: content.length }),
        finishedAt: new Date(),
      },
    })

    return reply.status(200).send({ ok: true, syncJobId: syncJob.id, filePath: resolved })
  })

  // GET /api/ingest/http/files — list uploaded files (admin UI)
  app.get(
    '/api/ingest/http/files',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (_request, reply) => {
      let files: string[] = []
      try {
        files = await walkDir(SYNC_HTTP_DIR, '')
      } catch { /* dir not yet created */ }
      return reply.send({ files })
    }
  )

  // DELETE /api/ingest/http/files/* — delete an uploaded file (admin UI)
  app.delete(
    '/api/ingest/http/files/*',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (request, reply) => {
      const filename = (request.params as { '*': string })['*']
      const resolved = path.resolve(path.join(SYNC_HTTP_DIR, filename))
      if (!resolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
        return reply.status(400).send({ error: 'Invalid path' })
      }
      try {
        await fs.unlink(resolved)
      } catch {
        return reply.status(404).send({ error: 'File not found' })
      }
      return reply.send({ ok: true })
    }
  )

  // GET /api/ingest/http/content/* — read file content (admin UI preview)
  app.get(
    '/api/ingest/http/content/*',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (request, reply) => {
      const filename = (request.params as { '*': string })['*']
      const resolved = path.resolve(path.join(SYNC_HTTP_DIR, filename))
      if (!resolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
        return reply.status(400).send({ error: 'Invalid path' })
      }
      try {
        const content = await fs.readFile(resolved, 'utf-8')
        return reply.send({ content })
      } catch {
        return reply.status(404).send({ error: 'File not found' })
      }
    }
  )

  // PUT /api/ingest/http/content/* — update file content (admin UI editor)
  app.put(
    '/api/ingest/http/content/*',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (request, reply) => {
      const filename = (request.params as { '*': string })['*']
      const resolved = path.resolve(path.join(SYNC_HTTP_DIR, filename))
      if (!resolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
        return reply.status(400).send({ error: 'Invalid path' })
      }
      const body = request.body as { content?: unknown; newFilename?: unknown }
      if (typeof body?.content !== 'string') {
        return reply.status(400).send({ error: 'content must be a string' })
      }

      // Optional rename
      if (body.newFilename !== undefined) {
        if (typeof body.newFilename !== 'string' || !body.newFilename.trim()) {
          return reply.status(400).send({ error: 'newFilename must be a non-empty string' })
        }
        const newResolved = path.resolve(path.join(SYNC_HTTP_DIR, body.newFilename))
        if (!newResolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
          return reply.status(400).send({ error: 'Invalid newFilename path' })
        }
        await fs.mkdir(path.dirname(newResolved), { recursive: true })
        await fs.writeFile(newResolved, body.content, 'utf-8')
        try { await fs.unlink(resolved) } catch { /* old file may not exist */ }
        return reply.send({ ok: true, filename: body.newFilename })
      }

      try {
        await fs.writeFile(resolved, body.content, 'utf-8')
      } catch {
        return reply.status(404).send({ error: 'File not found' })
      }
      return reply.send({ ok: true })
    }
  )
}
