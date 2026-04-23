import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import type { FastifyInstance } from 'fastify'

const ADMIN_TOKEN = 'mock-admin-token-find-unified'
const DEV_TOKEN = 'mock-dev-token-find-unified'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  // Clean up test conversations (keep seeded users)
  await prisma.auditLog.deleteMany({})
  await prisma.messageEvidence.deleteMany({})
  await prisma.message.deleteMany({})
  await prisma.conversation.deleteMany({})
})

describe('POST /api/conversations', () => {
  it('no token → 401', async () => {
    const res = await supertest(app.server).post('/api/conversations').send({ title: 'Test' })
    expect(res.status).toBe(401)
  })

  it('admin token creates conversation → 201', async () => {
    const res = await supertest(app.server)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ title: 'My Conv' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('My Conv')
    expect(res.body.ownerUserId).toBe('user-admin-001')
  })
})

describe('GET /api/conversations', () => {
  it('admin can see all conversations', async () => {
    // Create a conversation as admin
    await supertest(app.server)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ title: 'Admin Conv' })

    const res = await supertest(app.server)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThanOrEqual(1)
    expect(res.body.data).toBeInstanceOf(Array)
  })
})

describe('DELETE /api/conversations/:id', () => {
  it('dev token DELETE other user conversation → 403', async () => {
    // Admin creates a conversation
    const createRes = await supertest(app.server)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ title: 'Admin conv' })
    expect(createRes.status).toBe(201)
    const convId = createRes.body.id

    // Dev tries to delete it
    const delRes = await supertest(app.server)
      .delete(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
    expect(delRes.status).toBe(403)
  })

  it('admin DELETE → 204 → GET /:id returns 404', async () => {
    const createRes = await supertest(app.server)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ title: 'To delete' })
    const convId = createRes.body.id

    const delRes = await supertest(app.server)
      .delete(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(delRes.status).toBe(204)

    const getRes = await supertest(app.server)
      .get(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(getRes.status).toBe(404)
  })
})
