import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
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
  await prisma.auditLog.deleteMany({ where: { action: 'update_git_config' } })
  // Reset local source config to no repo
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'local' },
    update: { configJson: '{}', updatedBy: 'test' },
    create: { sourceType: 'local', enabled: true, configJson: '{}', updatedBy: 'test' },
  })
})

describe('GET /api/admin/sync/git/config', () => {
  it('dev token → 403', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
    expect(res.status).toBe(403)
  })

  it('admin token → 200 with expected fields', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      repo: expect.any(String),
      branch: expect.any(String),
      auth_type: expect.any(String),
      sync_interval_minutes: expect.any(Number),
    })
  })
})

describe('PUT /api/admin/sync/git/config', () => {
  it('valid body → 200, GET returns updated values, token masked as ***', async () => {
    const putRes = await supertest(app.server)
      .put('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        repo: 'https://github.com/test/repo',
        branch: 'main',
        auth_type: 'token',
        token: 'mytoken123',
        sync_interval_minutes: 30,
      })
    expect(putRes.status).toBe(200)

    const getRes = await supertest(app.server)
      .get('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.repo).toBe('https://github.com/test/repo')
    expect(getRes.body.branch).toBe('main')
    expect(getRes.body.token).toBe('***')
    expect(getRes.body.sync_interval_minutes).toBe(30)
  })

  it('empty token → preserves existing token', async () => {
    // First PUT with a token
    await supertest(app.server)
      .put('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ repo: 'https://github.com/test/repo', branch: 'main', auth_type: 'token', token: 'secret', sync_interval_minutes: 60 })

    // Second PUT without token
    await supertest(app.server)
      .put('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ repo: 'https://github.com/test/repo', branch: 'dev', auth_type: 'token', sync_interval_minutes: 60 })

    const source = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
    const config = JSON.parse(source!.configJson)
    expect(config.token).toBe('secret')
    expect(config.branch).toBe('dev')
  })
})

describe('POST /api/admin/sync/git/run', () => {
  it('no repo configured → 400', async () => {
    const res = await supertest(app.server)
      .post('/api/admin/sync/git/run')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Git repo not configured')
  })

  it('repo configured → 202 with syncJobId, sync_jobs table has pending record', async () => {
    // Configure repo first (use local path to avoid network in tests)
    await supertest(app.server)
      .put('/api/admin/sync/git/config')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ repo: 'file:///tmp/find-unified-test-repo', branch: 'main', auth_type: 'none', sync_interval_minutes: 60 })

    const res = await supertest(app.server)
      .post('/api/admin/sync/git/run')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(202)
    expect(res.body.syncJobId).toBeDefined()

    const job = await prisma.syncJob.findUnique({ where: { id: res.body.syncJobId } })
    expect(job).not.toBeNull()
    expect(['pending', 'running', 'done', 'failed']).toContain(job!.status)
  })
})

describe('GET /api/admin/sync/jobs', () => {
  it('returns paginated list', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/sync/jobs')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ data: expect.any(Array), total: expect.any(Number), page: 1, size: 20 })
  })
})
