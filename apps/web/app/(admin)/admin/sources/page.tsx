'use client'

import { useEffect, useRef, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useSqliteConfig,
  useUpdateSqlite,
  useLocalConfig,
  useUpdateLocalConfig,
  useMcpList,
  useUpdateMcpList,
  type McpEntry,
} from '@/lib/queries/admin-sources'
import { useChatStore } from '@/lib/store/chat'
import { Toast, type ToastItem } from '@/components/Toast'

// ── Zod schemas ──────────────────────────────────────────────────────────────
const sqliteSchema = z.object({
  url: z.string().min(1, '必填').refine((v) => v.startsWith('file:'), { message: '必须以 file: 开头' }),
  enabled: z.boolean(),
})
type SqliteForm = z.infer<typeof sqliteSchema>

// ── Shared style helpers ──────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-body)',
  color: 'var(--color-text-primary)',
  background: 'var(--color-bg)',
  boxSizing: 'border-box',
}
const errorStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
  marginTop: 3,
}
const fieldGroup: React.CSSProperties = { marginBottom: 16 }
const saveBtn: React.CSSProperties = {
  marginTop: 8,
  padding: '9px 20px',
  background: 'var(--color-brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  cursor: 'pointer',
}
const saveBtnDisabled: React.CSSProperties = {
  ...saveBtn,
  opacity: 0.6,
  cursor: 'not-allowed',
}

// ── Status badge ──────────────────────────────────────────────────────────────
function SourceStatusBadge({ sourceType }: { sourceType: string }) {
  const sourceStatus = useChatStore((s) => s.sourceStatus)
  const entry = sourceStatus.find((s) => s.source === sourceType)

  if (!entry) {
    return (
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        暂无状态（发起一次检索后更新）
      </span>
    )
  }

  const colorMap: Record<string, string> = {
    ok: 'var(--color-status-ok)',
    degraded: 'var(--color-status-degraded)',
    unavailable: 'var(--color-status-unavailable)',
  }
  const labelMap: Record<string, string> = {
    ok: '正常',
    degraded: '降级',
    unavailable: '不可用',
  }
  const color = colorMap[entry.status] ?? 'var(--color-text-secondary)'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
        }}
      />
      <span style={{ fontSize: 'var(--text-sm)', color }}>
        {labelMap[entry.status] ?? entry.status}
      </span>
      {entry.message && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          — {entry.message}
        </span>
      )}
    </span>
  )
}

// ── Local Tab ─────────────────────────────────────────────────────────────────
function LocalTab({ onToast }: { onToast: (item: Omit<ToastItem, 'id'>) => void }) {
  const { data, isLoading } = useLocalConfig()
  const updateLocal = useUpdateLocalConfig()
  const [roots, setRoots] = useState<string[]>([])
  const [newRoot, setNewRoot] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setRoots(data.roots ?? [])
    }
  }, [data])

  const handleAdd = () => {
    const trimmed = newRoot.trim()
    if (!trimmed || roots.includes(trimmed)) return
    setRoots((prev) => [...prev, trimmed])
    setNewRoot('')
  }

  const handleRemove = (r: string) => setRoots((prev) => prev.filter((x) => x !== r))

  const handleSave = async () => {
    try {
      await updateLocal.mutateAsync({ roots })
      onToast({ message: '保存成功', type: 'success' })
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    }
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-secondary)', padding: '24px 0' }}>加载中…</div>
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        find-core 会扫描以下目录中的 .md 文件并建立检索索引。
      </p>

      {/* existing roots */}
      <div style={{ marginBottom: 16 }}>
        {roots.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>暂无本地目录</p>
        )}
        {roots.map((r) => (
          <div
            key={r}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              marginBottom: 6,
              background: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'monospace',
            }}
          >
            <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{r}</span>
            <button
              onClick={() => handleRemove(r)}
              style={{
                marginLeft: 10,
                flexShrink: 0,
                padding: '2px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                background: 'transparent',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-error)',
                cursor: 'pointer',
              }}
            >
              移除
            </button>
          </div>
        ))}
      </div>

      {/* add new root */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newRoot}
          onChange={(e) => setNewRoot(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="/path/to/your/notes"
          style={{
            flex: 1,
            height: 36,
            padding: '0 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-body)',
            color: 'var(--color-text-primary)',
            background: 'var(--color-bg)',
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '0 16px',
            height: 36,
            background: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-body)',
            cursor: 'pointer',
          }}
        >
          添加
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={updateLocal.isPending}
        style={{
          ...saveBtn,
          opacity: updateLocal.isPending ? 0.6 : 1,
          cursor: updateLocal.isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {updateLocal.isPending ? '保存中…' : '保存'}
      </button>
    </div>
  )
}

// ── MCP Tab ───────────────────────────────────────────────────────────────────
function McpTab({ onToast }: { onToast: (item: Omit<ToastItem, 'id'>) => void }) {
  const { data, isLoading } = useMcpList()
  const updateMcpList = useUpdateMcpList()
  const [list, setList] = useState<McpEntry[]>([])
  const [editing, setEditing] = useState<number | null>(null)  // index being edited
  const [draft, setDraft] = useState<McpEntry>({ name: '', endpoint: '', timeout_ms: 5000, enabled: true })
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setList(data.list ?? [])
    }
  }, [data])

  const openAdd = () => {
    setDraft({ name: '', endpoint: '', timeout_ms: 5000, enabled: true })
    setEditing(-1)  // -1 = new
  }

  const openEdit = (idx: number) => {
    setDraft({ ...list[idx] })
    setEditing(idx)
  }

  const handleDraftSave = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) return
    if (editing === -1) {
      setList((prev) => [...prev, draft])
    } else if (editing !== null) {
      setList((prev) => prev.map((e, i) => (i === editing ? draft : e)))
    }
    setEditing(null)
  }

  const handleDelete = (idx: number) => setList((prev) => prev.filter((_, i) => i !== idx))

  const handleToggle = (idx: number) =>
    setList((prev) => prev.map((e, i) => (i === idx ? { ...e, enabled: !e.enabled } : e)))

  const handleSave = async () => {
    try {
      await updateMcpList.mutateAsync(list)
      onToast({ message: '保存成功', type: 'success' })
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    }
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-secondary)', padding: '24px 0' }}>加载中…</div>
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        配置一个或多个 MCP 数据源，检索时并行查询所有已启用的 MCP。
      </p>

      {/* List */}
      <div style={{ marginBottom: 16 }}>
        {list.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>
            暂无 MCP 数据源
          </p>
        )}
        {list.map((entry, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              marginBottom: 8,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg)',
            }}
          >
            {/* enable toggle */}
            <Switch.Root
              checked={entry.enabled}
              onCheckedChange={() => handleToggle(idx)}
              style={{
                width: 34, height: 20, borderRadius: 'var(--radius-full)', border: 'none',
                background: entry.enabled ? 'var(--color-brand)' : 'var(--color-border)',
                cursor: 'pointer', position: 'relative', flexShrink: 0,
              }}
            >
              <Switch.Thumb
                style={{
                  display: 'block', width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: entry.enabled ? 17 : 3, transition: 'left 0.15s',
                }}
              />
            </Switch.Root>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {entry.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.endpoint || '未配置 endpoint'}
              </div>
            </div>

            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              {entry.timeout_ms} ms
            </span>

            <button
              onClick={() => openEdit(idx)}
              style={{ padding: '3px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', background: 'transparent', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              编辑
            </button>
            <button
              onClick={() => handleDelete(idx)}
              style={{ padding: '3px 10px', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-xs)', background: 'transparent', fontSize: 'var(--text-xs)', color: 'var(--color-error)', cursor: 'pointer' }}
            >
              删除
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      {editing === null && (
        <button
          onClick={openAdd}
          style={{
            marginBottom: 20, padding: '6px 16px',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-secondary)', fontSize: 'var(--text-body)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          + 添加 MCP
        </button>
      )}

      {/* Inline edit/add form */}
      {editing !== null && (
        <div
          style={{
            marginBottom: 20, padding: 16,
            border: '1px solid var(--color-brand)', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-secondary)',
          }}
        >
          <div style={fieldGroup}>
            <label style={fieldLabel}>名称</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="如：内部知识库 MCP"
              style={inputStyle}
            />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Endpoint URL</label>
            <input
              value={draft.endpoint}
              onChange={(e) => setDraft((d) => ({ ...d, endpoint: e.target.value }))}
              placeholder="https://mcp.example.com/api"
              style={inputStyle}
            />
          </div>
          <div style={{ ...fieldGroup, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div>
              <label style={fieldLabel}>Timeout (ms)</label>
              <input
                type="number"
                value={draft.timeout_ms}
                onChange={(e) => setDraft((d) => ({ ...d, timeout_ms: Number(e.target.value) }))}
                style={{ ...inputStyle, width: 120 }}
                min={1} max={30000}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
              <Switch.Root
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
                style={{
                  width: 34, height: 20, borderRadius: 'var(--radius-full)', border: 'none',
                  background: draft.enabled ? 'var(--color-brand)' : 'var(--color-border)',
                  cursor: 'pointer', position: 'relative', flexShrink: 0,
                }}
              >
                <Switch.Thumb
                  style={{
                    display: 'block', width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: draft.enabled ? 17 : 3, transition: 'left 0.15s',
                  }}
                />
              </Switch.Root>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>启用</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDraftSave}
              disabled={!draft.name.trim() || !draft.endpoint.trim()}
              style={{ ...saveBtn, marginTop: 0, opacity: (!draft.name.trim() || !draft.endpoint.trim()) ? 0.5 : 1 }}
            >
              确认
            </button>
            <button
              onClick={() => setEditing(null)}
              style={{ marginTop: 0, padding: '9px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', fontSize: 'var(--text-body)', cursor: 'pointer' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* connectivity status */}
      <div style={{ ...fieldGroup }}>
        <label style={fieldLabel}>连通性状态</label>
        <SourceStatusBadge sourceType="mcp" />
      </div>

      <button
        onClick={handleSave}
        disabled={updateMcpList.isPending}
        style={{ ...saveBtn, opacity: updateMcpList.isPending ? 0.6 : 1, cursor: updateMcpList.isPending ? 'not-allowed' : 'pointer' }}
      >
        {updateMcpList.isPending ? '保存中…' : '保存'}
      </button>
    </div>
  )
}

// ── SQLite Tab ────────────────────────────────────────────────────────────────
function SqliteTab({ onToast }: { onToast: (item: Omit<ToastItem, 'id'>) => void }) {
  const { data, isLoading } = useSqliteConfig()
  const updateSqlite = useUpdateSqlite()
  const initialized = useRef(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SqliteForm>({
    resolver: zodResolver(sqliteSchema),
    defaultValues: { url: 'file:/tmp/find_unified_dev.db', enabled: true },
  })

  const enabled = watch('enabled')

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setValue('url', (data.config.url as string) ?? 'file:/tmp/find_unified_dev.db')
      setValue('enabled', data.enabled)
    }
  }, [data, setValue])

  const onSubmit = async (values: SqliteForm) => {
    try {
      await updateSqlite.mutateAsync(values)
      onToast({ message: '保存成功', type: 'success' })
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    }
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-secondary)', padding: '24px 0' }}>加载中…</div>
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 480 }}>
      {/* enabled switch */}
      <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch.Root
          checked={enabled}
          onCheckedChange={(v) => setValue('enabled', v)}
          style={{
            width: 42,
            height: 24,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: enabled ? 'var(--color-brand)' : 'var(--color-border)',
            cursor: 'pointer',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <Switch.Thumb
            style={{
              display: 'block',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: enabled ? 21 : 3,
              transition: 'left 0.15s',
            }}
          />
        </Switch.Root>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-primary)' }}>
          启用 SQLite 数据源
        </span>
      </div>

      {/* url */}
      <div style={fieldGroup}>
        <label style={fieldLabel}>数据库文件路径</label>
        <input
          {...register('url')}
          style={inputStyle}
          placeholder="file:/tmp/find_unified_dev.db"
        />
        {errors.url && <p style={errorStyle}>{errors.url.message}</p>}
      </div>

      {/* connectivity status */}
      <div style={{ ...fieldGroup, marginTop: 24 }}>
        <label style={fieldLabel}>连通性状态</label>
        <SourceStatusBadge sourceType="db" />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={isSubmitting ? saveBtnDisabled : saveBtn}
      >
        {isSubmitting ? '保存中…' : '保存'}
      </button>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SourcesPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...item, id }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <div style={{ padding: '32px', maxWidth: 640 }}>
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: '0 0 24px',
        }}
      >
        数据源配置
      </h1>

      <style>{`
        .tab-trigger { padding: 8px 20px; border: none; border-bottom: 2px solid transparent; background: transparent; font-size: var(--text-body); font-weight: 400; color: var(--color-text-secondary); cursor: pointer; }
        .tab-trigger[data-state="active"] { border-bottom-color: var(--color-brand); font-weight: 600; color: var(--color-text-primary); }
      `}</style>

      <Tabs.Root defaultValue="local">
        <Tabs.List
          style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 28 }}
        >
          <Tabs.Trigger value="local" className="tab-trigger">
            本地文件
          </Tabs.Trigger>
          <Tabs.Trigger value="mcp" className="tab-trigger">
            MCP
          </Tabs.Trigger>
          <Tabs.Trigger value="sqlite" className="tab-trigger">
            SQLite
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="local">
          <LocalTab onToast={addToast} />
        </Tabs.Content>
        <Tabs.Content value="mcp">
          <McpTab onToast={addToast} />
        </Tabs.Content>
        <Tabs.Content value="sqlite">
          <SqliteTab onToast={addToast} />
        </Tabs.Content>
      </Tabs.Root>

      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
