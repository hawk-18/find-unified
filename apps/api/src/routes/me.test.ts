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
  // Reset users to seed defaults
  await prisma.user.upsert({
    where: { id: 'user-admin-001' },
    update: { defaultCli: 'claude_code' },
    create: { id: 'user-admin-001', name: 'Admin User', role: 'admin', defaultCli: 'claude_code' },
  })
  await prisma.user.upsert({
    where: { id: 'user-dev-001' },
    update: { defaultCli: 'claude_code' },
    create: { id: 'user-dev-001', name: 'Dev User', role: 'dev', defaultCli: 'claude_code' },
  })
  await prisma.auditLog.deleteMany({ where: { action: 'update_cli_preference' } })
})

describe('GET /api/me/preferences/cli', () => {
  it('no token → 401', async () => {
    const res = await supertest(app.server).get('/api/me/preferences/cli')
    expect(res.status).toBe(401)
  })

  it('dev token → 200 with cli field', async () => {
    const res = await supertest(app.server)
      .get('/api/me/preferences/cli')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.cli).toBe('claude_code')
  })
})

describe('PUT /api/me/preferences/cli', () => {
  it('PUT { cli: "invalid" } → 400 with validation error', async () => {
    const res = await supertest(app.server)
      .put('/api/me/preferences/cli')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
      .send({ cli: 'invalid' })
    expect(res.status).toBe(400)
    expect(res.body.details).toBeDefined()
  })

  it('dev token PUT { cli: "cursor" } → 200; GET → returns cursor', async () => {
    const putRes = await supertest(app.server)
      .put('/api/me/preferences/cli')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
      .send({ cli: 'cursor' })
    expect(putRes.status).toBe(200)

    const getRes = await supertest(app.server)
      .get('/api/me/preferences/cli')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.cli).toBe('cursor')
  })

  it('PUT writes audit_log with action update_cli_preference', async () => {
    await supertest(app.server)
      .put('/api/me/preferences/cli')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ cli: 'opencode' })

    const log = await prisma.auditLog.findFirst({
      where: { action: 'update_cli_preference', operatorUserId: 'user-admin-001' },
    })
    expect(log).not.toBeNull()
    expect(JSON.parse(log!.detailJson).cli).toBe('opencode')
  })
})
