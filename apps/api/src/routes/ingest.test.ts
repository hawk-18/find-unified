import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import type { FastifyInstance } from 'fastify'

const INGEST_TOKEN = 'ingest-dev-token'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/ingest/http/push', () => {
  it('wrong token → 401', async () => {
    const res = await supertest(app.server)
      .post('/api/ingest/http/push')
      .set('Authorization', 'Bearer wrong-token')
      .send({ source: 'wiki', content: '# Hello', ref: 'doc.md' })
    expect(res.status).toBe(401)
  })

  it('no token → 401', async () => {
    const res = await supertest(app.server)
      .post('/api/ingest/http/push')
      .send({ source: 'wiki', content: '# Hello', ref: 'doc.md' })
    expect(res.status).toBe(401)
  })

  it('correct token + valid body → 202 with syncJobId', async () => {
    const res = await supertest(app.server)
      .post('/api/ingest/http/push')
      .set('Authorization', `Bearer ${INGEST_TOKEN}`)
      .send({ source: 'wiki', content: '# Hello World', ref: 'test-p3-03.md' })
    expect(res.status).toBe(202)
    expect(res.body.syncJobId).toBeDefined()

    // Verify sync_jobs table has the record
    const job = await prisma.syncJob.findUnique({ where: { id: res.body.syncJobId } })
    expect(job).not.toBeNull()
    expect(job!.jobType).toBe('http')
    expect(['pending', 'running', 'done']).toContain(job!.status)
  })

  it('correct token + missing required field → 400', async () => {
    const res = await supertest(app.server)
      .post('/api/ingest/http/push')
      .set('Authorization', `Bearer ${INGEST_TOKEN}`)
      .send({ content: '# Hello' }) // missing source
    expect(res.status).toBe(400)
  })

  it('job appears in GET /api/admin/sync/jobs', async () => {
    const pushRes = await supertest(app.server)
      .post('/api/ingest/http/push')
      .set('Authorization', `Bearer ${INGEST_TOKEN}`)
      .send({ source: 'wiki', content: '# Visible', ref: 'visible.md' })
    expect(pushRes.status).toBe(202)

    const listRes = await supertest(app.server)
      .get('/api/admin/sync/jobs')
      .set('Authorization', 'Bearer mock-admin-token-find-unified')
    expect(listRes.status).toBe(200)
    const ids = listRes.body.data.map((j: { id: string }) => j.id)
    expect(ids).toContain(pushRes.body.syncJobId)
  })
})
