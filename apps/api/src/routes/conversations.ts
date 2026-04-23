import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../plugins/auth.js'

const createSchema = z.object({
  title: z.string().optional(),
})

const listQuerySchema = z.object({
  keyword: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

export async function conversationsRoutes(app: FastifyInstance) {
  // POST / - create conversation
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request', details: body.error.issues })
    }

    const userId = request.user!.userId
    const title = body.data.title ?? 'New Conversation'

    const conversation = await prisma.conversation.create({
      data: { ownerUserId: userId, title },
    })

    return reply.status(201).send(conversation)
  })

  // GET / - list conversations
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query', details: query.error.issues })
    }

    const { keyword, page, size } = query.data
    const userId = request.user!.userId
    const role = request.user!.role

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null }

    if (role !== 'admin') {
      where.ownerUserId = userId
    }

    if (keyword) {
      where.title = { contains: keyword }
    }

    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.conversation.count({ where }),
    ])

    return reply.send({ data, total, page, size })
  })

  // GET /:id - get single conversation with messages
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.userId
    const role = request.user!.role

    const conversation = await prisma.conversation.findFirst({
      where: { id, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { evidence: true },
        },
      },
    })

    if (!conversation) {
      return reply.status(404).send({ error: 'Not found' })
    }

    if (role !== 'admin' && conversation.ownerUserId !== userId) {
      return reply.status(404).send({ error: 'Not found' })
    }

    return reply.send(conversation)
  })

  // DELETE /:id - soft delete
  app.delete(
    '/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const userId = request.user!.userId
      const role = request.user!.role

      const conversation = await prisma.conversation.findFirst({
        where: { id, deletedAt: null },
      })

      if (!conversation) {
        return reply.status(404).send({ error: 'Not found' })
      }

      if (role !== 'admin' && conversation.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      await prisma.conversation.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      await prisma.auditLog.create({
        data: {
          operatorUserId: userId,
          action: 'delete_conversation',
          targetType: 'conversation',
          targetId: id,
          detailJson: JSON.stringify({ title: conversation.title }),
        },
      })

      return reply.status(204).send()
    }
  )
}

export { requireRole }
