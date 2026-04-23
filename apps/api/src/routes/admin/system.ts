import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../plugins/auth.js'

const cliSchema = z.object({
  cli: z.enum(['claude_code', 'opencode', 'cursor']),
})

const SYSTEM_SOURCE_TYPE = 'system'

export async function systemAdminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireRole(['admin'])]

  // GET /default-cli
  app.get('/default-cli', { preHandler }, async (_request, reply) => {
    const config = await prisma.sourceConfig.findUnique({
      where: { sourceType: SYSTEM_SOURCE_TYPE },
    })
    const defaultCli = config ? (JSON.parse(config.configJson) as { defaultCli?: string }).defaultCli ?? 'claude_code' : 'claude_code'
    return reply.send({ defaultCli })
  })

  // PUT /default-cli
  app.put('/default-cli', { preHandler }, async (request, reply) => {
    const parsed = cliSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { cli } = parsed.data
    const configJson = JSON.stringify({ defaultCli: cli })

    await prisma.sourceConfig.upsert({
      where: { sourceType: SYSTEM_SOURCE_TYPE },
      update: { configJson, updatedBy: request.user!.userId },
      create: {
        sourceType: SYSTEM_SOURCE_TYPE,
        enabled: true,
        configJson,
        updatedBy: request.user!.userId,
      },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: request.user!.userId,
        action: 'update_default_cli',
        targetType: 'system',
        targetId: 'default-cli',
        detailJson: JSON.stringify({ cli }),
      },
    })

    return reply.status(200).send({ ok: true })
  })
}
