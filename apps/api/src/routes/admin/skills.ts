import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticate, requireRole } from '../../plugins/auth.js'

// Skills .md files are stored in <api-root>/skills/
const SKILLS_DIR = path.resolve(process.cwd(), 'skills')

// ── Frontmatter helpers ───────────────────────────────────────────────────────

interface SkillMeta {
  name: string
  description: string
  stage: string
  enabled: boolean
}

export interface Skill extends SkillMeta {
  filename: string // e.g. "query-expand.md"
  content: string  // full file content including frontmatter
  body: string     // content after frontmatter
}

function parseFrontmatter(raw: string): { meta: Partial<SkillMeta>; body: string } {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
  const match = raw.match(fm)
  if (!match) return { meta: {}, body: raw }

  const yamlBlock = match[1]
  const body = match[2] ?? ''
  const meta: Partial<SkillMeta> = {}

  for (const line of yamlBlock.split('\n')) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim()
    if (key === 'name') meta.name = val
    else if (key === 'description') meta.description = val
    else if (key === 'stage') meta.stage = val
    else if (key === 'enabled') meta.enabled = val === 'true'
  }

  return { meta, body }
}

function buildFrontmatter(meta: SkillMeta): string {
  return [
    '---',
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `stage: ${meta.stage}`,
    `enabled: ${meta.enabled}`,
    '---',
    '',
  ].join('\n')
}

async function ensureSkillsDir() {
  await fs.mkdir(SKILLS_DIR, { recursive: true })
}

async function readSkillFile(filename: string): Promise<Skill | null> {
  const filepath = path.join(SKILLS_DIR, filename)
  try {
    const content = await fs.readFile(filepath, 'utf-8')
    const { meta, body } = parseFrontmatter(content)
    if (!meta.name) return null
    return {
      filename,
      content,
      body,
      name: meta.name,
      description: meta.description ?? '',
      stage: meta.stage ?? 'pre_search',
      enabled: meta.enabled ?? true,
    }
  } catch {
    return null
  }
}

async function listSkills(): Promise<Skill[]> {
  await ensureSkillsDir()
  let files: string[]
  try {
    files = await fs.readdir(SKILLS_DIR)
  } catch {
    return []
  }
  const mdFiles = files.filter((f) => f.endsWith('.md')).sort()
  const skills = await Promise.all(mdFiles.map(readSkillFile))
  return skills.filter(Boolean) as Skill[]
}

// ── Validation schemas ────────────────────────────────────────────────────────

const createSkillSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, 'name must be lowercase letters, numbers, hyphens'),
  description: z.string().default(''),
  stage: z.enum(['pre_search', 'post_search', 'post_answer']),
  enabled: z.boolean().default(true),
  body: z.string().default(''),
})

const updateSkillSchema = z.object({
  description: z.string().optional(),
  stage: z.enum(['pre_search', 'post_search', 'post_answer']).optional(),
  enabled: z.boolean().optional(),
  body: z.string().optional(),
})

// ── Routes ────────────────────────────────────────────────────────────────────

export async function skillsAdminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireRole(['admin'])]

  // GET / — list all skills
  app.get('/', { preHandler }, async (_req, reply) => {
    const skills = await listSkills()
    return reply.send(skills)
  })

  // POST / — create a new skill .md file
  app.post('/', { preHandler }, async (request, reply) => {
    const parsed = createSkillSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const { name, description, stage, enabled, body } = parsed.data
    const filename = `${name}.md`
    const filepath = path.join(SKILLS_DIR, filename)

    await ensureSkillsDir()

    try {
      await fs.access(filepath)
      return reply.status(409).send({ error: `Skill "${name}" already exists` })
    } catch {
      // file doesn't exist — OK
    }

    const meta: SkillMeta = { name, description, stage, enabled }
    const content = buildFrontmatter(meta) + body
    await fs.writeFile(filepath, content, 'utf-8')

    const skill = await readSkillFile(filename)
    return reply.status(201).send(skill)
  })

  // PUT /:filename — update an existing skill .md file
  app.put('/:filename', { preHandler }, async (request, reply) => {
    const { filename } = request.params as { filename: string }
    if (!filename.endsWith('.md')) {
      return reply.status(400).send({ error: 'filename must end with .md' })
    }

    const filepath = path.join(SKILLS_DIR, filename)
    const existing = await readSkillFile(filename)
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const parsed = updateSkillSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues })
    }

    const updated: SkillMeta = {
      name: existing.name,
      description: parsed.data.description ?? existing.description,
      stage: parsed.data.stage ?? existing.stage,
      enabled: parsed.data.enabled ?? existing.enabled,
    }
    const body = parsed.data.body ?? existing.body
    const content = buildFrontmatter(updated) + body
    await fs.writeFile(filepath, content, 'utf-8')

    const skill = await readSkillFile(filename)
    return reply.status(200).send(skill)
  })

  // DELETE /:filename — delete a skill .md file
  app.delete('/:filename', { preHandler }, async (request, reply) => {
    const { filename } = request.params as { filename: string }
    if (!filename.endsWith('.md')) {
      return reply.status(400).send({ error: 'filename must end with .md' })
    }

    const filepath = path.join(SKILLS_DIR, filename)
    try {
      await fs.access(filepath)
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }

    await fs.unlink(filepath)
    return reply.status(200).send({ ok: true })
  })
}
