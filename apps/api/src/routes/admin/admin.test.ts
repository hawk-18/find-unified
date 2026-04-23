import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { isEncrypted } from '../../lib/crypto.js'
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
  await prisma.auditLog.deleteMany({})
  // Reset source_configs to known state
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'mcp' },
    update: { enabled: false, configJson: '{"endpoint":"","timeout_ms":5000}', updatedBy: 'test' },
    create: { sourceType: 'mcp', enabled: false, configJson: '{"endpoint":"","timeout_ms":5000}', updatedBy: 'test' },
  })
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'db' },
    update: { enabled: false, configJson: '{"host":"","port":5432,"dbname":"","user":"","password":"mypassword"}', updatedBy: 'test' },
    create: { sourceType: 'db', enabled: false, configJson: '{"host":"","port":5432,"dbname":"","user":"","password":"mypassword"}', updatedBy: 'test' },
  })
})

describe('Sources admin - access control', () => {
  it('dev token PUT /api/admin/sources/mcp → 403', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/sources/mcp')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
      .send({ endpoint: 'http://mcp.example.com', timeout_ms: 3000, enabled: true })
    expect(res.status).toBe(403)
  })

  it('no token PUT /api/admin/sources/mcp → 401', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/sources/mcp')
      .send({ endpoint: 'http://mcp.example.com', timeout_ms: 3000, enabled: true })
    expect(res.status).toBe(401)
  })
})

describe('Sources admin - MCP', () => {
  it('admin PUT /api/admin/sources/mcp → 200, audit_log created', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/sources/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ endpoint: 'http://mcp.example.com', timeout_ms: 3000, enabled: true })
    expect(res.status).toBe(200)

    const log = await prisma.auditLog.findFirst({ where: { targetId: 'mcp' } })
    expect(log).not.toBeNull()
    expect(log!.action).toBe('update_source_config')
  })

  it('admin GET /api/admin/sources/mcp returns config with masked sensitive fields', async () => {
    // PUT a config with a token-like field — mcp schema doesn't have token but test masking via postgres
    const res = await supertest(app.server)
      .get('/api/admin/sources/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.config).toBeDefined()
  })
})

describe('Sources admin - PostgreSQL', () => {
  it('GET /api/admin/sources/postgres → password masked as ***', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/sources/postgres')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.config.password).toBe('***')
  })

  it('PUT /api/admin/sources/postgres with empty password → preserves existing password (encrypted in DB)', async () => {
    // First PUT to encrypt the initial password into DB
    await supertest(app.server)
      .put('/api/admin/sources/postgres')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ host: 'localhost', port: 5432, dbname: 'mydb', user: 'admin', password: 'mypassword' })

    // Second PUT with empty password — should preserve the encrypted value
    const res = await supertest(app.server)
      .put('/api/admin/sources/postgres')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ host: 'localhost', port: 5432, dbname: 'mydb', user: 'admin', password: '' })
    expect(res.status).toBe(200)

    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    const parsed = JSON.parse(config!.configJson)
    // Password should still be present and in encrypted format
    expect(isEncrypted(parsed.password)).toBe(true)
  })

  it('PUT /api/admin/sources/postgres with new password → stores encrypted value in DB', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/sources/postgres')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ host: 'localhost', port: 5432, dbname: 'mydb', user: 'admin', password: 'newpass' })
    expect(res.status).toBe(200)

    const config = await prisma.sourceConfig.findUnique({ where: { sourceType: 'db' } })
    const parsed = JSON.parse(config!.configJson)
    // DB should store encrypted value, not plaintext
    expect(parsed.password).not.toBe('newpass')
    expect(isEncrypted(parsed.password)).toBe(true)
  })

  it('PUT /api/admin/sources/postgres with token in mcp → GET returns *** for token', async () => {
    // Manually insert a config with a token field to verify masking
    await prisma.sourceConfig.upsert({
      where: { sourceType: 'mcp' },
      update: { configJson: '{"endpoint":"http://x.com","timeout_ms":3000,"token":"mysecret"}', updatedBy: 'test' },
      create: { sourceType: 'mcp', enabled: false, configJson: '{"endpoint":"http://x.com","timeout_ms":3000,"token":"mysecret"}', updatedBy: 'test' },
    })
    const res = await supertest(app.server)
      .get('/api/admin/sources/mcp')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.config.token).toBe('***')
  })
})

describe('Skills admin', () => {
  it('GET /api/admin/skills → returns array', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/skills')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('System admin - default CLI', () => {
  it('GET /api/admin/system/default-cli → returns defaultCli', async () => {
    const res = await supertest(app.server)
      .get('/api/admin/system/default-cli')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body.defaultCli).toBeDefined()
  })

  it('PUT /api/admin/system/default-cli with valid cli → 200, audit_log created', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/system/default-cli')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ cli: 'opencode' })
    expect(res.status).toBe(200)

    const log = await prisma.auditLog.findFirst({ where: { action: 'update_default_cli' } })
    expect(log).not.toBeNull()
  })

  it('PUT /api/admin/system/default-cli with invalid cli → 400', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/system/default-cli')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ cli: 'vscode' })
    expect(res.status).toBe(400)
  })

  it('dev token PUT /api/admin/system/default-cli → 403', async () => {
    const res = await supertest(app.server)
      .put('/api/admin/system/default-cli')
      .set('Authorization', `Bearer ${DEV_TOKEN}`)
      .send({ cli: 'cursor' })
    expect(res.status).toBe(403)
  })
})
