import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { authenticate, requireRole } from '../plugins/auth.js'

function buildTestApp() {
  const app = Fastify()

  // Route that only requires authentication
  app.get('/protected', { preHandler: authenticate }, async (request) => {
    return { role: request.user?.role }
  })

  // Route that requires admin role
  app.get(
    '/admin-only',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async () => {
      return { ok: true }
    }
  )

  return app
}

describe('authenticate', () => {
  it('returns 401 when no token is provided', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/protected' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('resolves admin user from mock admin token', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer mock-admin-token-find-unified' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'admin' })
  })

  it('returns 403 when dev token accesses admin-only route', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: 'Bearer mock-dev-token-find-unified' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })
})
