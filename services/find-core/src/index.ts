import { buildApp } from './app.js'

const PORT = Number(process.env.FIND_CORE_PORT || process.env.PORT || 8787)

const app = await buildApp()

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
