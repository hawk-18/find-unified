import type { FastifyRequest, FastifyReply } from 'fastify'
import { MOCK_USERS, type MockUser } from '../lib/mock-tokens.js'

// Augment FastifyRequest to carry the resolved user
declare module 'fastify' {
  interface FastifyRequest {
    user?: MockUser
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const user = MOCK_USERS.get(token)
  if (!user) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  request.user = user
}

export function requireRole(roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
