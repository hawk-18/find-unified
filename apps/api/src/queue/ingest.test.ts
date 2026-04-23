import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { ingestQueue } from './ingest.queue.js'
import { ingestWorker } from './ingest.worker.js'
import { prisma } from '../lib/prisma.js'

// Use a dedicated connection for QueueEvents (not the shared singleton)
const eventsRedis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
})

let queueEvents: QueueEvents

beforeAll(async () => {
  queueEvents = new QueueEvents('ingest', { connection: eventsRedis })
  await queueEvents.waitUntilReady()
  await ingestWorker.waitUntilReady()
})

beforeEach(async () => {
  await prisma.syncJob.deleteMany({ where: { id: { startsWith: 'test-job-p3' } } })
})

afterAll(async () => {
  await ingestWorker.close()
  await queueEvents.close()
  await ingestQueue.close()
  await eventsRedis.quit()
})

describe('ingestQueue', () => {
  it('processes a git job and sets sync_jobs status to done', async () => {
    // Create a SyncJob record in DB
    const syncJob = await prisma.syncJob.create({
      data: {
        id: 'test-job-p3-01',
        jobType: 'git',
        status: 'pending',
        payloadJson: JSON.stringify({ repo: 'file:///tmp/find-unified-test-repo', branch: 'main' }),
      },
    })

    // Enqueue job
    const job = await ingestQueue.add('ingest', {
      jobType: 'git',
      syncJobId: syncJob.id,
    })

    // Wait for completion
    await job.waitUntilFinished(queueEvents, 5000)

    // Verify DB status
    const updated = await prisma.syncJob.findUnique({ where: { id: syncJob.id } })
    expect(updated!.status).toBe('done')
    expect(updated!.finishedAt).not.toBeNull()
  })
})


describe('ingestQueue', () => {
  it('processes a git job and sets sync_jobs status to done', async () => {
    // Create a SyncJob record in DB
    const syncJob = await prisma.syncJob.create({
      data: {
        id: 'test-job-p3-01',
        jobType: 'git',
        status: 'pending',
        payloadJson: JSON.stringify({ repo: 'file:///tmp/find-unified-test-repo', branch: 'main' }),
      },
    })

    // Enqueue job
    const job = await ingestQueue.add('ingest', {
      jobType: 'git',
      syncJobId: syncJob.id,
    })

    // Wait for completion
    await job.waitUntilFinished(queueEvents, 5000)

    // Verify DB status
    const updated = await prisma.syncJob.findUnique({ where: { id: syncJob.id } })
    expect(updated!.status).toBe('done')
    expect(updated!.finishedAt).not.toBeNull()
  })
})
