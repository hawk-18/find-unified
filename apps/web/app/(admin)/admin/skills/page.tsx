'use client'

import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import {
  useSkills,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  type Skill,
  type CreateSkillBody,
} from '@/lib/queries/admin-skills'
import { Toast, type ToastItem } from '@/components/Toast'

const STAGE_LABELS: Record<string, string> = {
  pre_search: '检索前处理 (pre_search)',
  post_search: '检索后处理 (post_search)',
  post_answer: '回答后处理 (post_answer)',
}

// ── New Skill Form ────────────────────────────────────────────────────────────
function NewSkillForm({
  onDone,
  onToast,
}: {
  onDone: () => void
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  const createSkill = useCreateSkill()
  const [form, setForm] = useState<CreateSkillBody>({
    name: '',
    description: '',
    stage: 'pre_search',
    enabled: true,
    body: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name) e.name = '名称不能为空'
    else if (!/^[a-z0-9-]+$/.test(form.name)) e.name = '只允许小写字母、数字、连字符'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    try {
      await createSkill.mutateAsync(form)
      onToast({ message: '已创建', type: 'success' })
      onDone()
    } catch {
      onToast({ message: '创建失败', type: 'error' })
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: 20,
        marginBottom: 32,
        background: 'var(--color-bg)',
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-base)', fontWeight: 600 }}>
        新增 Skill
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="名称 (文件名)" error={errors.name}>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="query-expand"
            style={inputStyle(!!errors.name)}
          />
        </Field>
        <Field label="描述">
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            style={inputStyle(false)}
          />
        </Field>
        <Field label="阶段">
          <select
            value={form.stage}
            onChange={(e) =>
              setForm((f) => ({ ...f, stage: e.target.value as CreateSkillBody['stage'] }))
            }
            style={inputStyle(false)}
          >
            <option value="pre_search">pre_search</option>
            <option value="post_search">post_search</option>
            <option value="post_answer">post_answer</option>
          </select>
        </Field>
      </div>
      <Field label="Prompt 内容 (body)">
        <textarea
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={6}
          placeholder="在此写 skill 的 prompt 内容..."
          style={{ ...inputStyle(false), resize: 'vertical', fontFamily: 'monospace' }}
        />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSubmit} disabled={createSkill.isPending} style={btnPrimaryStyle}>
          {createSkill.isPending ? '创建中…' : '创建'}
        </button>
        <button onClick={onDone} style={btnSecondaryStyle}>
          取消
        </button>
      </div>
    </div>
  )
}

// ── Skill Row ─────────────────────────────────────────────────────────────────
function SkillRow({
  skill,
  onToast,
}: {
  skill: Skill
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  const updateSkill = useUpdateSkill()
  const deleteSkill = useDeleteSkill()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'prompt' | 'script'>('prompt')
  const [body, setBody] = useState(skill.body)
  const [script, setScript] = useState(skill.script ?? '')
  const [switchLoading, setSwitchLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setSwitchLoading(true)
    try {
      await updateSkill.mutateAsync({ filename: skill.filename, body: { enabled: checked } })
      onToast({ message: '已保存', type: 'success' })
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    } finally {
      setSwitchLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      await updateSkill.mutateAsync({
        filename: skill.filename,
        body: tab === 'prompt' ? { body } : { script },
      })
      onToast({ message: '已保存', type: 'success' })
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await deleteSkill.mutateAsync(skill.filename)
      onToast({ message: '已删除', type: 'success' })
    } catch {
      onToast({ message: '删除失败', type: 'error' })
      setConfirmDelete(false)
    }
  }

  const SCRIPT_PLACEHOLDER = `// 可在此编写 JavaScript 脚本，运行于服务端。
// 接收参数：query（字符串）、evidence（数组）、answer（字符串）
// 返回对象中包含要修改的字段，例如：
//
// pre_search 阶段示例（修改查询词）：
// return { query: query + ' 同义词扩展' }
//
// post_search 阶段示例（过滤低分 evidence）：
// return { evidence: evidence.filter(e => e.score >= 2) }
//
// post_answer 阶段示例（追加免责声明）：
// return { answer: answer + '\\n\\n> 以上内容仅供参考。' }
`

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', padding: '12px 0' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch.Root
          checked={skill.enabled}
          onCheckedChange={handleToggle}
          disabled={switchLoading}
          style={{
            width: 36,
            height: 20,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: skill.enabled ? 'var(--color-brand)' : 'var(--color-border)',
            cursor: switchLoading ? 'not-allowed' : 'pointer',
            position: 'relative',
            flexShrink: 0,
            opacity: switchLoading ? 0.6 : 1,
          }}
        >
          <Switch.Thumb
            style={{
              display: 'block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: skill.enabled ? 19 : 3,
              transition: 'left 0.15s',
            }}
          />
        </Switch.Root>

        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-body)',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            fontFamily: 'monospace',
          }}
        >
          {skill.name}
          {skill.description && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 'var(--text-sm)',
                fontWeight: 400,
                color: 'var(--color-text-secondary)',
                fontFamily: 'inherit',
              }}
            >
              — {skill.description}
            </span>
          )}
          {skill.script && (
            <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--color-brand)', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>
              JS
            </span>
          )}
        </span>

        <button onClick={() => setExpanded((v) => !v)} style={btnSecondaryStyle}>
          {expanded ? '收起' : '编辑'}
        </button>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)' }}>确认删除?</span>
            <button onClick={handleDelete} disabled={deleteSkill.isPending} style={{ ...btnSecondaryStyle, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              {deleteSkill.isPending ? '删除中…' : '确认'}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnSecondaryStyle}>取消</button>
          </>
        ) : (
          <button onClick={handleDelete} style={{ ...btnSecondaryStyle, color: 'var(--color-error)' }}>
            删除
          </button>
        )}
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ marginTop: 10, paddingLeft: 48 }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
            文件：<code>{skill.filename}</code>　阶段：<code>{skill.stage}</code>
          </p>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
            {(['prompt', 'script'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '5px 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid var(--color-brand)' : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {t === 'prompt' ? 'Prompt' : 'JS 脚本'}
              </button>
            ))}
          </div>

          {tab === 'prompt' ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Skill prompt 内容..."
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 'var(--text-sm)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px',
                resize: 'vertical',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={12}
              placeholder={SCRIPT_PLACEHOLDER}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 13,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px',
                resize: 'vertical',
                color: 'var(--color-text-primary)',
                background: '#1e1e2e',
                color: '#cdd6f4',
                boxSizing: 'border-box',
              } as React.CSSProperties}
            />
          )}

          <button
            onClick={handleSave}
            disabled={updateSkill.isPending}
            style={{ ...btnPrimaryStyle, marginTop: 8 }}
          >
            {updateSkill.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Stage section ─────────────────────────────────────────────────────────────
function StageSection({
  stage,
  skills,
  onToast,
}: {
  stage: string
  skills: Skill[]
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  if (skills.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          margin: '0 0 4px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {STAGE_LABELS[stage] ?? stage}
      </h2>
      <div
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 16px',
        }}
      >
        {skills.map((skill) => (
          <SkillRow key={skill.filename} skill={skill} onToast={onToast} />
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const { data: skills, isLoading } = useSkills()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [showNewForm, setShowNewForm] = useState(false)

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...item, id }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const stages = ['pre_search', 'post_search', 'post_answer']

  return (
    <div style={{ padding: '32px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
          SKILL 配置
        </h1>
        <button onClick={() => setShowNewForm((v) => !v)} style={btnPrimaryStyle}>
          {showNewForm ? '取消' : '+ 新增 Skill'}
        </button>
      </div>

      {showNewForm && (
        <NewSkillForm onDone={() => setShowNewForm(false)} onToast={addToast} />
      )}

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-body)' }}>加载中…</p>
      )}

      {!isLoading && skills && skills.length === 0 && !showNewForm && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-body)' }}>
          暂无 Skill，点击「新增 Skill」创建第一个。
        </p>
      )}

      {!isLoading &&
        skills &&
        stages.map((stage) => (
          <StageSection
            key={stage}
            stage={stage}
            skills={skills.filter((s) => s.stage === stage)}
            onToast={addToast}
          />
        ))}

      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 34,
    padding: '0 8px',
    border: `1px solid ${hasError ? 'var(--color-error)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-xs)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    boxSizing: 'border-box',
  }
}

const btnPrimaryStyle: React.CSSProperties = {
  padding: '6px 16px',
  background: 'var(--color-brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-xs)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondaryStyle: React.CSSProperties = {
  padding: '4px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xs)',
  background: 'transparent',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 'var(--text-sm)', marginBottom: 4, color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', margin: '3px 0 0' }}>{error}</p>
      )}
    </div>
  )
}
