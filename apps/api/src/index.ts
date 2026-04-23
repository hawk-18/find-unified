import { buildApp } from './app.js'

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001)

const app = await buildApp()

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
