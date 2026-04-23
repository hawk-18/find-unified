import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Upsert users
  await prisma.user.upsert({
    where: { id: 'user-admin-001' },
    update: {},
    create: { id: 'user-admin-001', name: 'Admin User', role: 'admin', defaultCli: 'claude_code' },
  })
  await prisma.user.upsert({
    where: { id: 'user-dev-001' },
    update: {},
    create: { id: 'user-dev-001', name: 'Dev User', role: 'dev', defaultCli: 'claude_code' },
  })

  // Upsert source_configs
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'local' },
    update: {},
    create: { sourceType: 'local', enabled: true, configJson: '{}', updatedBy: 'seed' },
  })
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'mcp' },
    update: {},
    create: {
      sourceType: 'mcp',
      enabled: false,
      configJson: '{"endpoint":"","timeout_ms":5000}',
      updatedBy: 'seed',
    },
  })
  await prisma.sourceConfig.upsert({
    where: { sourceType: 'db' },
    update: {},
    create: {
      sourceType: 'db',
      enabled: false,
      configJson: '{"host":"","port":5432,"dbname":"","user":"","password":""}',
      updatedBy: 'seed',
    },
  })

  // Upsert skills
  const skillDefs = [
    {
      id: 'skill-query-expand',
      name: 'query_expand',
      stage: 'pre_search',
      enabled: true,
      priority: 0,
      configJson: JSON.stringify({
        synonyms: { '检索': ['搜索', '查找', '查询'], 'API': ['接口', '服务'] },
        max_expansions: 3,
      }),
    },
    {
      id: 'skill-lang-detect',
      name: 'lang_detect',
      stage: 'pre_search',
      enabled: true,
      priority: 1,
      configJson: JSON.stringify({ fallback_lang: 'zh', supported: ['zh', 'en'] }),
    },
    {
      id: 'skill-query-filter',
      name: 'query_filter',
      stage: 'pre_search',
      enabled: false,
      priority: 2,
      configJson: JSON.stringify({
        stop_words: ['的', '了', '是', '在'],
        min_query_length: 2,
      }),
    },
    {
      id: 'skill-rerank',
      name: 'rerank',
      stage: 'post_search',
      enabled: true,
      priority: 0,
      configJson: JSON.stringify({
        model: 'bm25',
        top_k: 5,
        score_threshold: 0.3,
      }),
    },
    {
      id: 'skill-source-boost',
      name: 'source_boost',
      stage: 'post_search',
      enabled: true,
      priority: 1,
      configJson: JSON.stringify({
        weights: { local: 1.0, mcp: 0.8, db: 0.9 },
      }),
    },
    {
      id: 'skill-dedup',
      name: 'dedup',
      stage: 'post_search',
      enabled: false,
      priority: 2,
      configJson: JSON.stringify({ similarity_threshold: 0.85 }),
    },
    {
      id: 'skill-suggest',
      name: 'suggest',
      stage: 'post_answer',
      enabled: true,
      priority: 0,
      configJson: JSON.stringify({
        template: '您也可以尝试搜索：{related_queries}',
        max_suggestions: 3,
      }),
    },
    {
      id: 'skill-citation',
      name: 'citation',
      stage: 'post_answer',
      enabled: true,
      priority: 1,
      configJson: JSON.stringify({
        format: '[{index}] {title} — {source_ref}',
        show_score: true,
      }),
    },
    {
      id: 'skill-feedback',
      name: 'feedback_collector',
      stage: 'post_answer',
      enabled: false,
      priority: 2,
      configJson: JSON.stringify({
        thumbs_up_action: 'log',
        thumbs_down_action: 'log_and_alert',
      }),
    },
  ]
  for (const s of skillDefs) {
    await prisma.skill.upsert({
      where: { id: s.id },
      update: { enabled: s.enabled, priority: s.priority, configJson: s.configJson },
      create: {
        id: s.id,
        name: s.name,
        stage: s.stage,
        enabled: s.enabled,
        priority: s.priority,
        configJson: s.configJson,
      },
    })
  }

  console.log('Seed complete: 2 users, 3 source_configs, 9 skills')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
