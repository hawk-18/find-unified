import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../plugins/auth.js'
import { encrypt, decrypt, isEncrypted } from '../../lib/crypto.js'

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

const postgresBodySchema = z.object({
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  dbname: z.string(),
  user: z.string(),
  password: z.string().optional(),
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

  // GET /postgres
  app.get('/postgres', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    if (!config) return reply.status(404).send({ error: 'Not found' })
    return reply.send({ ...config, configJson: undefined, config: maskSensitive(config.configJson) })
  })

  // PUT /postgres
  app.put('/postgres', { preHandler }, async (request, reply) => {
    const parsed = postgresBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { host, port, dbname, user, password } = parsed.data

    // Read existing config to preserve password if not provided
    const existing = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    let existingConfig: Record<string, unknown> = {}
    try {
      existingConfig = existing ? JSON.parse(existing.configJson) : {}
    } catch { /* ignore */ }

    const newConfig: Record<string, unknown> = { host, port, dbname, user }
    if (password !== undefined && password !== '') {
      newConfig.password = password
    } else {
      // Preserve existing (already-encrypted) password value as-is
      newConfig.password = existingConfig.password ?? ''
    }

    // Encrypt sensitive fields before storing (skips already-encrypted values)
    const configJson = JSON.stringify(encryptSensitive(newConfig))

    await prisma.sourceConfig.upsert({
      where: { sourceType: 'db' },
      update: { configJson, updatedBy: request.user!.userId },
      create: { sourceType: 'db', enabled: false, configJson, updatedBy: request.user!.userId },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_source_config',
        targetType: 'source_config',
        targetId: 'db',
        detailJson: JSON.stringify({ host, port, dbname, user }),
      },
    })

    // Sync to find-core sources.json (password decrypted so find-core can use it directly)
    const plainPassword = decryptIfNeeded(
      (newConfig.password as string | undefined) ?? ''
    )
    await writeSourcesJson({
      db: { enabled: true, host, port, dbname, user, password: plainPassword },
    })

    return reply.status(200).send({ ok: true })
  })
}
