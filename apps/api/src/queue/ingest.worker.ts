import { Worker } from 'bullmq'
import { simpleGit } from 'simple-git'
import * as fs from 'fs'
import * as path from 'path'
import { redisConnection } from './client.js'
import { prisma } from '../lib/prisma.js'
import type { IngestJobData } from './ingest.queue.js'

const SYNC_GIT_DIR = process.env.SYNC_GIT_DIR ?? '/tmp/find-sync/git'
const SYNC_HTTP_DIR = process.env.SYNC_HTTP_DIR ?? '/tmp/find-sync/http'
const FIND_CORE_SOURCES_PATH =
  process.env.FIND_CONFIG_PATH ??
  path.resolve(process.cwd(), '../../services/find-core/config/sources.json')

// ── sources.json helpers ──────────────────────────────────────────────────────

interface SourcesConfig {
  local?: { enabled?: boolean; roots?: string[]; [k: string]: unknown }
  [k: string]: unknown
}

function readSourcesConfig(): SourcesConfig {
  try {
    return JSON.parse(fs.readFileSync(FIND_CORE_SOURCES_PATH, 'utf-8')) as SourcesConfig
  } catch {
    return { local: { enabled: true, roots: [] } }
  }
}

function ensureRootInConfig(dir: string): void {
  const cfg = readSourcesConfig()
  const roots: string[] = Array.isArray(cfg.local?.roots) ? (cfg.local!.roots as string[]) : []
  if (roots.includes(dir)) return

  const updated: SourcesConfig = {
    ...cfg,
    local: { ...(cfg.local ?? {}), roots: [...roots, dir] },
  }

  fs.mkdirSync(path.dirname(FIND_CORE_SOURCES_PATH), { recursive: true })
  fs.writeFileSync(FIND_CORE_SOURCES_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

// ── Git sync ──────────────────────────────────────────────────────────────────

async function handleGit(syncJobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: syncJobId } })
  if (!job) throw new Error(`SyncJob ${syncJobId} not found`)

  const { repo, branch } = JSON.parse(job.payloadJson) as { repo: string; branch: string }

  // Derive a stable directory name from the repo URL
  const repoSlug = repo
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const targetDir = path.join(SYNC_GIT_DIR, repoSlug)
  fs.mkdirSync(targetDir, { recursive: true })

  // Read token from sourceConfig if available
  const sourceConfig = await prisma.sourceConfig.findUnique({ where: { sourceType: 'local' } })
  let authToken = ''
  try {
    const cfg = sourceConfig ? (JSON.parse(sourceConfig.configJson) as { token?: string }) : {}
    authToken = cfg.token ?? ''
  } catch { /* ignore */ }

  // Build authenticated URL if token provided
  const repoUrl = authToken
    ? repo.replace(/^(https?:\/\/)/, `$1oauth2:${authToken}@`)
    : repo

  let changedFiles: string[] = []

  if (fs.existsSync(path.join(targetDir, '.git'))) {
    // Already cloned — pull latest
    const g = simpleGit(targetDir)
    await g.pull('origin', branch)
    try {
      const diff = await g.diff(['--name-only', 'HEAD~1', 'HEAD'])
      changedFiles = diff.trim().split('\n').filter(f => f.endsWith('.md') && Boolean(f))
    } catch {
      changedFiles = []
    }
  } else {
    // Fresh clone
    await simpleGit().clone(repoUrl, targetDir, ['--branch', branch, '--depth', '1'])
    // Count all .md files as "new"
    changedFiles = findMdFiles(targetDir)
  }

  // Make sure find-core can see this directory
  ensureRootInConfig(targetDir)

  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: {
      status: 'done',
      resultJson: JSON.stringify({ targetDir, changedFiles, totalMd: findMdFiles(targetDir).length }),
      finishedAt: new Date(),
    },
  })
}

function findMdFiles(dir: string): string[] {
  const results: string[] = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()!
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(cur, e.name)
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git' && !e.name.startsWith('.')) {
        stack.push(p)
      } else if (e.isFile() && e.name.endsWith('.md')) {
        results.push(p)
      }
    }
  }
  return results
}

// ── HTTP push ─────────────────────────────────────────────────────────────────

async function handleHttp(syncJobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: syncJobId } })
  if (!job) throw new Error(`SyncJob ${syncJobId} not found`)

  const { source, content, ref } = JSON.parse(job.payloadJson) as {
    source: string
    content?: string
    ref?: string
  }

  if (!content) {
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'done', resultJson: JSON.stringify({ skipped: true, reason: 'no content' }), finishedAt: new Date() },
    })
    return
  }

  // Write content to SYNC_HTTP_DIR/<source>, ensuring no path traversal
  const filePath = path.join(SYNC_HTTP_DIR, source)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(SYNC_HTTP_DIR))) {
    throw new Error(`Path traversal detected: ${source}`)
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, content, 'utf-8')

  // Make sure find-core can see this directory
  ensureRootInConfig(SYNC_HTTP_DIR)

  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: {
      status: 'done',
      resultJson: JSON.stringify({ filePath: resolved, ref: ref ?? null, bytes: content.length }),
      finishedAt: new Date(),
    },
  })
}

// ── Worker ────────────────────────────────────────────────────────────────────

export const ingestWorker = new Worker<IngestJobData>(
  'ingest',
  async (job) => {
    const { jobType, syncJobId } = job.data

    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'running' },
    })

    try {
      if (jobType === 'git') {
        await handleGit(syncJobId)
      } else if (jobType === 'http') {
        await handleHttp(syncJobId)
      }
    } catch (err) {
      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'failed',
          resultJson: JSON.stringify({ error: String(err) }),
          finishedAt: new Date(),
        },
      })
      throw err
    }
  },
  { connection: redisConnection }
)
