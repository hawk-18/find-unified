import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '../../lib/prisma.js'
import { ingestQueue } from '../../queue/ingest.queue.js'
import { authenticate, requireRole } from '../../plugins/auth.js'

const FIND_CONFIG_PATH =
  process.env.FIND_CONFIG_PATH ??
  path.resolve(process.cwd(), '../../services/find-core/config/sources.json')

async function readSourcesJson(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FIND_CONFIG_PATH, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSourcesJson(patch: Record<string, unknown>): Promise<void> {
  const current = await readSourcesJson()
  const updated = { ...current, ...patch }
  await fs.mkdir(path.dirname(FIND_CONFIG_PATH), { recursive: true })
  await fs.writeFile(FIND_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

const preHandler = [authenticate, requireRole(['admin'])]

function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...config }
  for (const key of ['token', 'password']) {
    if (masked[key] !== undefined && masked[key] !== '') {
      masked[key] = '***'
    }
  }
  return masked
}

const gitConfigSchema = z.object({
  repo: z.string(),
  branch: z.string(),
  auth_type: z.enum(['none', 'token', 'ssh']),
  token: z.string().optional(),
  sync_interval_minutes: z.number().int().min(1).max(1440),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

export async function syncAdminRoutes(app: FastifyInstance) {
  // GET /git/config
  app.get('/git/config', { preHandler }, async (_request, reply) => {
    const source = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
    if (!source) return reply.status(404).send({ error: 'local source config not found' })

    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(source.configJson)
    } catch { /* ignore */ }

    const { repo = '', branch = 'main', auth_type = 'none', token, sync_interval_minutes = 60 } = config as {
      repo?: string
      branch?: string
      auth_type?: string
      token?: string
      sync_interval_minutes?: number
    }

    return reply.send({
      repo,
      branch,
      auth_type,
      token: token ? '***' : '',
      sync_interval_minutes,
    })
  })

  // PUT /git/config
  app.put('/git/config', { preHandler }, async (request, reply) => {
    const parsed = gitConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { repo, branch, auth_type, token, sync_interval_minutes } = parsed.data

    // Read existing config to preserve token if not provided
    const existing = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
    let existingConfig: Record<string, unknown> = {}
    try {
      existingConfig = existing ? JSON.parse(existing.configJson) : {}
    } catch { /* ignore */ }

    const newConfig: Record<string, unknown> = {
      ...existingConfig,
      repo,
      branch,
      auth_type,
      sync_interval_minutes,
    }

    if (token !== undefined && token !== '') {
      newConfig.token = token
    }

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'local' },
      update: { configJson: JSON.stringify(newConfig), updatedBy: request.user!.userId },
      create: {
        sourceType: 'local',
        enabled: true,
        configJson: JSON.stringify(newConfig),
        updatedBy: request.user!.userId,
      },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_git_config',
        targetType: 'source_config',
        targetId: 'local',
        detailJson: JSON.stringify({ repo, branch, auth_type, sync_interval_minutes }),
      },
    })

    return reply.status(200).send({ ok: true })
  })

  // POST /git/run
  app.post('/git/run', { preHandler }, async (request, reply) => {
    const source = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
    let config: Record<string, unknown> = {}
    try {
      config = source ? JSON.parse(source.configJson) : {}
    } catch { /* ignore */ }

    const repo = (config.repo as string) ?? ''
    if (!repo) {
      return reply.status(400).send({ error: 'Git repo not configured' })
    }

    const branch = (config.branch as string) ?? 'main'

    const syncJob = await prisma.syncJob.create({
      data: {
        jobType: 'git',
        status: 'pending',
        payloadJson: JSON.stringify({ repo, branch }),
      },
    })

    await ingestQueue.add('ingest', { jobType: 'git', syncJobId: syncJob.id })

    return reply.status(202).send({ syncJobId: syncJob.id })
  })

  // GET /local/config — return current local roots
  app.get('/local/config', { preHandler }, async (_request, reply) => {
    const cfg = await readSourcesJson()
    const local = (cfg.local ?? {}) as Record<string, unknown>
    const roots: string[] = Array.isArray(local.roots) ? (local.roots as string[]) : []
    return reply.send({ roots })
  })

  // PUT /local/config — update local roots
  app.put(
    '/local/config',
    { preHandler },
    async (request, reply) => {
      const parsed = z.object({ roots: z.array(z.string()) }).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.data })
      }
      const cfg = await readSourcesJson()
      const existing = (cfg.local ?? {}) as Record<string, unknown>
      await writeSourcesJson({ local: { ...existing, roots: parsed.data.roots } })
      return reply.status(200).send({ ok: true })
    }
  )

  // GET /jobs
  app.get('/jobs', { preHandler }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query', details: query.error.issues })
    }
    const { page, size } = query.data

    const [data, total] = await Promise.all([
      prisma.syncJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.syncJob.count(),
    ])

    return reply.send({ data, total, page, size })
  })
}
