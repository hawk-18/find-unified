import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../plugins/auth.js'
import { encrypt, decrypt, isEncrypted } from '../../lib/crypto.js'

const FIND_CONFIG_PATH =
  process.env.FIND_CONFIG_PATH ??
  '/data/config/sources.json'

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

function decryptIfNeeded(val: string): string {
  try {
    return isEncrypted(val) ? decrypt(val) : val
  } catch {
    return val
  }
}

const SENSITIVE_FIELDS = ['password', 'token']

function maskSensitive(configJson: string): Record<string, unknown> {
  let config: Record<string, unknown> = {}
  try {
    config = JSON.parse(configJson)
  } catch {
    return {}
  }
  const masked = { ...config }
  for (const key of SENSITIVE_FIELDS) {
    if (masked[key] !== undefined && masked[key] !== '') {
      masked[key] = '***'
    }
  }
  return masked
}

function encryptSensitive(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config }
  for (const key of SENSITIVE_FIELDS) {
    const val = result[key]
    if (typeof val === 'string' && val !== '' && !isEncrypted(val)) {
      result[key] = encrypt(val)
    }
  }
  return result
}

const mcpBodySchema = z.object({
  endpoint: z.string(),
  timeout_ms: z.number().int().min(1).max(30000),
  enabled: z.boolean(),
})

const mcpEntrySchema = z.object({
  name: z.string().min(1),
  endpoint: z.string(),
  timeout_ms: z.number().int().min(1).max(30000).default(5000),
  enabled: z.boolean(),
})

const mcpListBodySchema = z.object({
  list: z.array(mcpEntrySchema),
})

const sqliteBodySchema = z.object({
  url: z.string().min(1, '必填').refine((v) => v.startsWith('file:'), { message: '必须以 file: 开头' }),
  enabled: z.boolean(),
})

const sqliteEntrySchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1).refine((v) => v.startsWith('file:'), { message: '必须以 file: 开头' }),
  enabled: z.boolean(),
})

const sqliteListBodySchema = z.object({
  list: z.array(sqliteEntrySchema),
})

export async function sourcesAdminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireRole(['admin'])]

  // GET /mcp
  app.get('/mcp', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'mcp' } })
    if (!config) return reply.status(404).send({ error: 'Not found' })
    return reply.send({ ...config, configJson: undefined, config: maskSensitive(config.configJson) })
  })

  // PUT /mcp
  app.put('/mcp', { preHandler }, async (request, reply) => {
    const parsed = mcpBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { endpoint, timeout_ms, enabled } = parsed.data
    const rawConfig: Record<string, unknown> = { endpoint, timeout_ms }
    const configJson = JSON.stringify(encryptSensitive(rawConfig))

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'mcp' },
      update: { enabled, configJson, updatedBy: request.user!.userId },
      create: { sourceType: 'mcp', enabled, configJson, updatedBy: request.user!.userId },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_source_config',
        targetType: 'source_config',
        targetId: 'mcp',
        detailJson: JSON.stringify({ endpoint, timeout_ms, enabled }),
      },
    })

    // Sync to find-core sources.json
    await writeSourcesJson({
      mcp: { enabled, endpoint, timeout_ms },
    })

    return reply.status(200).send({ ok: true })
  })

  // GET /mcp/list — get MCP list (falls back to legacy mcp record if list not yet created)
  app.get('/mcp/list', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'mcp_list' } })
    if (config) {
      let list: unknown[] = []
      try { list = JSON.parse(config.configJson) } catch {}
      return reply.send({ list })
    }

    // Migrate from legacy single-mcp record
    const legacy = await prisma.sourceConfig.findUnique({ where: { sourceType: 'mcp' } })
    if (legacy) {
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(legacy.configJson) } catch {}
      const endpoint = typeof cfg.endpoint === 'string' ? decryptIfNeeded(cfg.endpoint) : ''
      const list = endpoint ? [{
        name: 'MCP',
        endpoint,
        timeout_ms: typeof cfg.timeout_ms === 'number' ? cfg.timeout_ms : 5000,
        enabled: legacy.enabled,
      }] : []
      return reply.send({ list })
    }

    return reply.send({ list: [] })
  })

  // PUT /mcp/list — replace full MCP list
  app.put('/mcp/list', { preHandler }, async (request, reply) => {
    const parsed = mcpListBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { list } = parsed.data
    const configJson = JSON.stringify(list)

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'mcp_list' },
      update: { enabled: true, configJson, updatedBy: request.user!.userId },
      create: { sourceType: 'mcp_list', enabled: true, configJson, updatedBy: request.user!.userId },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_source_config',
        targetType: 'source_config',
        targetId: 'mcp_list',
        detailJson: JSON.stringify({ count: list.length }),
      },
    })

    // Sync to find-core sources.json — write mcpList, keep legacy mcp for compat
    await writeSourcesJson({ mcpList: list })

    return reply.status(200).send({ ok: true })
  })

  // GET /sqlite
  app.get('/sqlite', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    if (!config) return reply.status(404).send({ error: 'Not found' })
    return reply.send({ ...config, configJson: undefined, config: maskSensitive(config.configJson) })
  })

  // PUT /sqlite
  app.put('/sqlite', { preHandler }, async (request, reply) => {
    const parsed = sqliteBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { url, enabled } = parsed.data
    const configJson = JSON.stringify({ url })

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'db' },
      update: { enabled, configJson, updatedBy: request.user!.userId },
      create: { sourceType: 'db', enabled, configJson, updatedBy: request.user!.userId },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_source_config',
        targetType: 'source_config',
        targetId: 'db',
        detailJson: JSON.stringify({ url, enabled }),
      },
    })

    await writeSourcesJson({ db: { enabled, url } })

    return reply.status(200).send({ ok: true })
  })

  // GET /sqlite/list — get SQLite list (falls back to legacy db record)
  app.get('/sqlite/list', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db_list' } })
    if (config) {
      let list: unknown[] = []
      try { list = JSON.parse(config.configJson) } catch {}
      return reply.send({ list })
    }

    // Migrate from legacy single-db record
    const legacy = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    if (legacy) {
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(legacy.configJson) } catch {}
      const url = typeof cfg.url === 'string' ? cfg.url : ''
      const list = url ? [{ name: 'SQLite', url, enabled: legacy.enabled }] : []
      return reply.send({ list })
    }

    return reply.send({ list: [] })
  })

  // PUT /sqlite/list — replace full SQLite list
  app.put('/sqlite/list', { preHandler }, async (request, reply) => {
    const parsed = sqliteListBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { list } = parsed.data
    const configJson = JSON.stringify(list)

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'db_list' },
      update: { enabled: true, configJson, updatedBy: request.user!.userId },
      create: { sourceType: 'db_list', enabled: true, configJson, updatedBy: request.user!.userId },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_source_config',
        targetType: 'source_config',
        targetId: 'db_list',
        detailJson: JSON.stringify({ count: list.length }),
      },
    })

    await writeSourcesJson({ dbList: list })

    return reply.status(200).send({ ok: true })
  })
}
