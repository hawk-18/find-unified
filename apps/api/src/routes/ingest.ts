import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ingestQueue } from '../queue/ingest.queue.js'

const INGEST_TOKEN = process.env.INGEST_TOKEN ?? 'ingest-dev-token'

const pushBodySchema = z.object({
  source: z.string().min(1),
  content: z.string(),
  ref: z.string().optional(),
})

export async function ingestRoutes(app: FastifyInstance) {
  app.post('/api/ingest/http/push', async (request, reply) => {
    // Token auth (not mock-user auth)
    const authHeader = request.headers['authorization']
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token || token !== INGEST_TOKEN) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const parsed = pushBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const { source, content, ref } = parsed.data

    const syncJob = await prisma.syncJob.create({
      data: {
        jobType: 'http',
        status: 'pending',
        payloadJson: JSON.stringify({ source, ref, content }),
      },
    })

    await ingestQueue.add('ingest', { jobType: 'http', syncJobId: syncJob.id })

    return reply.status(202).send({ syncJobId: syncJob.id })
  })
}
