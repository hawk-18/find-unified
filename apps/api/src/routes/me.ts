import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../plugins/auth.js'

const cliSchema = z.object({
  cli: z.enum(['claude_code', 'opencode', 'cursor']),
})

export async function meRoutes(app: FastifyInstance) {
  const preHandler = [authenticate]

  // GET /preferences/cli
  app.get('/preferences/cli', { preHandler }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: { defaultCli: true },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return reply.send({ cli: user.defaultCli })
  })

  // PUT /preferences/cli
  app.put('/preferences/cli', { preHandler }, async (request, reply) => {
    const parsed = cliSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { cli } = parsed.data
    const userId = request.user!.userId

    await prisma.user.update({
      where: { id: userId },
      data: { defaultCli: cli },
    })

    await prisma.auditLog.create({
      data: {
        operatorUserId: userId,
        action: 'update_cli_preference',
        targetType: 'user',
        targetId: userId,
        detailJson: JSON.stringify({ cli }),
      },
    })

    return reply.status(200).send({ ok: true })
  })
}
