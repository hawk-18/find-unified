/**
 * Migrate data from PostgreSQL to SQLite using raw pg + Prisma SQLite client
 * Usage: node --experimental-vm-modules scripts/migrate-pg-to-sqlite.mjs
 *   or:  cd apps/api && DATABASE_URL="file:/tmp/find_unified_dev.db" node ../../scripts/migrate-pg-to-sqlite.mjs
 */
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'

const PG_URL = process.env.PG_URL ?? 'postgresql://postgres:1234@localhost:5432/find_unified'
const SQLITE_URL = process.env.DATABASE_URL ?? 'file:/tmp/find_unified_dev.db'

// Tables in dependency order (parents before children)
const TABLES = [
  { pg: 'users',               model: 'user' },
  { pg: 'conversations',       model: 'conversation' },
  { pg: 'messages',            model: 'message' },
  { pg: 'message_evidence',    model: 'messageEvidence' },
  { pg: 'source_configs',      model: 'sourceConfig' },
  { pg: 'skills',              model: 'skill' },
  { pg: 'sync_jobs',           model: 'syncJob' },
  { pg: 'audit_logs',          model: 'auditLog' },
  { pg: 'knowledge_articles',  model: 'knowledgeArticle' },
]

function normalizeRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v  // Prisma accepts Date objects
    } else {
      out[k] = v
    }
  }
  return out
}

// camelCase column names from snake_case PG columns
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function camelizeRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] = v instanceof Date ? v : v
  }
  return out
}

async function main() {
  const pg = new Client({ connectionString: PG_URL })
  await pg.connect()
  console.log(`Connected to PostgreSQL`)

  const sqlite = new PrismaClient({
    datasources: { db: { url: SQLITE_URL } },
  })
  await sqlite.$connect()
  console.log(`Connected to SQLite: ${SQLITE_URL}`)

  for (const { pg: tableName, model } of TABLES) {
    // Check PG table exists
    const existsRes = await pg.query(
      `SELECT to_regclass($1) AS tbl`, [`public.${tableName}`]
    )
    if (!existsRes.rows[0].tbl) {
      console.log(`  [skip] ${tableName} — not in PostgreSQL`)
      continue
    }

    const { rows } = await pg.query(`SELECT * FROM "${tableName}"`)
    if (rows.length === 0) {
      console.log(`  [ok]   ${tableName} — 0 rows`)
      continue
    }

    // Check model exists in Prisma client
    if (!(model in sqlite)) {
      console.log(`  [skip] ${tableName} — no Prisma model '${model}'`)
      continue
    }

    let inserted = 0
    let skipped = 0
    for (const row of rows) {
      const data = camelizeRow(row)
      try {
        await sqlite[model].upsert({
          where: { id: data.id },
          create: data,
          update: data,
        })
        inserted++
      } catch (e) {
        console.warn(`    [warn] ${tableName} id=${data.id}: ${e.message}`)
        skipped++
      }
    }
    console.log(`  [ok]   ${tableName} — ${inserted} upserted, ${skipped} skipped`)
  }

  await pg.end()
  await sqlite.$disconnect()
  console.log('\nMigration complete!')
}

main().catch((e) => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
