import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../plugins/auth.js'

const preHandler = [authenticate, requireRole(['admin'])]

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

export async function syncAdminRoutes(app: FastifyInstance) {
  // GET /jobs — list upload job history
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
