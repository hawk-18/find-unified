import Fastify from 'fastify'
import cors from '@fastify/cors'
import { conversationsRoutes } from './routes/conversations.js'
import { findRoutes } from './routes/find.js'
import { sourcesAdminRoutes } from './routes/admin/sources.js'
import { skillsAdminRoutes } from './routes/admin/skills.js'
import { systemAdminRoutes } from './routes/admin/system.js'
import { syncAdminRoutes } from './routes/admin/sync.js'
import { meRoutes } from './routes/me.js'
import { ingestRoutes } from './routes/ingest.js'

export async function buildApp() {
  const isDev = process.env.NODE_ENV === 'development'
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
  })

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  app.get('/health', async () => {
    return { status: 'ok' }
  })

  app.register(conversationsRoutes, { prefix: '/api/conversations' })
  app.register(findRoutes)
  app.register(sourcesAdminRoutes, { prefix: '/api/admin/sources' })
  app.register(skillsAdminRoutes, { prefix: '/api/admin/skills' })
  app.register(systemAdminRoutes, { prefix: '/api/admin/system' })
  app.register(syncAdminRoutes, { prefix: '/api/admin/sync' })
  app.register(meRoutes, { prefix: '/api/me' })
  app.register(ingestRoutes)

  return app
}
