'use client'

import { useState, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import {
  useSyncJobs,
  useUploadedFiles,
  useDeleteFile,
  useFileContent,
  useUpdateFileContent,
  useCreateDir,
  useDeleteDir,
  useMoveFile,
  type SyncJob,
} from '@/lib/queries/admin-sync'
import { apiFetch } from '@/lib/api-client'
import { Toast, type ToastItem } from '@/components/Toast'

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  .sr-row { transition: background 0.1s; }
  .sr-row:hover { background: var(--color-surface-secondary); }
  .sr-row:hover .sr-actions { opacity: 1; pointer-events: auto; }
  .sr-actions { opacity: 0; pointer-events: none; transition: opacity 0.12s; display: flex; align-items: center; gap: 2px; }
  .sr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; cursor: pointer; color: var(--color-text-secondary); transition: background 0.1s, color 0.1s; }
  .sr-icon-btn:hover { background: var(--color-border); color: var(--color-text-primary); }
  .sr-icon-btn.danger:hover { background: #fee2e2; color: #dc2626; }
  .sr-row[data-drag-over="true"] { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-bg)) !important; box-shadow: inset 2px 0 0 var(--color-brand); }
  .sr-row[draggable="true"] { cursor: default; }
  .sr-rename { flex: 1; min-width: 0; font-size: 13px; background: var(--color-bg); border: 1px solid var(--color-brand); border-radius: 4px; padding: 2px 7px; outline: none; color: var(--color-text-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 12%, transparent); }
  .sync-upload-zone:hover { border-color: var(--color-brand) !important; background: color-mix(in srgb, var(--color-brand) 3%, var(--color-bg)) !important; }
  .sync-job-row:hover { background: var(--color-surface-secondary); }
  .sync-btn { transition: background 0.12s, color 0.12s; }
  .sync-btn:hover:not(:disabled) { background: var(--color-surface-secondary) !important; }
  .sync-btn-danger:hover:not(:disabled) { background: #fef2f2 !important; color: #dc2626 !important; }
  .sync-btn-primary:hover:not(:disabled) { filter: brightness(0.92); }
  @keyframes spin { to { transform: rotate(360deg); } }
`

// ── SVG icons ─────────────────────────────────────────────────────────────────
const Icon = {
  folder: (open: boolean) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      {open
        ? <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6l1 1.5h6.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4.5Z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.5"/>
        : <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6l1 1.5h6.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4.5Z" fill="#fcd34d" stroke="#d97706" strokeWidth="0.5"/>
      }
    </svg>
  ),
  file: (ext?: string) => {
    const color = ext === 'md' ? '#6366f1' : ext === 'txt' ? '#64748b' : '#94a3b8'
    return (
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
        <path d="M2 1.5A1 1 0 0 1 3 .5h6l3 3V14.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V1.5Z" fill={color} fillOpacity=".12" stroke={color} strokeWidth="0.75"/>
        <path d="M9 .5V3.5h3" stroke={color} strokeWidth="0.75" fill="none"/>
        <path d="M4 7h6M4 9.5h4" stroke={color} strokeWidth="0.75" strokeLinecap="round"/>
      </svg>
    )
  },
  chevron: (open: boolean) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  edit: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2.5l2 2L4 12H2v-2l7.5-7.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  trash: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M4 3.5l.5 8h5l.5-8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  folderPlus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 3.5A.5.5 0 0 1 1.5 3H5l.75 1.25H12.5a.5.5 0 0 1 .5.5V11.5a.5.5 0 0 1-.5.5H1.5a.5.5 0 0 1-.5-.5V3.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M7 6.5v3M5.5 8H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
  upload: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 13V4M10 4L7 7M10 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 14v1.5A1.5 1.5 0 0 0 4.5 17h11A1.5 1.5 0 0 0 17 15.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  newFile: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2A1 1 0 0 1 3 1h6l3 3V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M9 1V4h3" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M5 8h4M7 6v4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS: Record<string, { color: string; bg: string; label: string; dot: string }> = {
  pending: { color: '#92400e', bg: '#fef3c7', label: '等待中', dot: '#f59e0b' },
  running: { color: '#1d4ed8', bg: '#eff6ff', label: '运行中', dot: '#3b82f6' },
  done:    { color: '#166534', bg: '#f0fdf4', label: '完成',   dot: '#22c55e' },
  failed:  { color: '#991b1b', bg: '#fef2f2', label: '失败',   dot: '#ef4444' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { color: 'var(--color-text-secondary)', bg: '#f2f2f2', label: status, dot: '#aaa' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)', fontWeight: 600,
      color: s.color, background: s.bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

// ── Shared button styles ──────────────────────────────────────────────────────
const ghostBtn = (danger = false): React.CSSProperties => ({
  padding: '4px 11px',
  border: `1px solid ${danger ? '#fca5a5' : 'var(--color-border)'}`,
  borderRadius: 6,
  background: 'transparent',
  color: danger ? '#dc2626' : 'var(--color-text-secondary)',
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap' as const,
})

// ── Job row ───────────────────────────────────────────────────────────────────
function JobRow({ job }: { job: SyncJob }) {
  const [expanded, setExpanded] = useState(false)
  const createdAt = new Date(job.createdAt).toLocaleString('zh-CN')

  let payload: { filename?: string } = {}
  try { payload = JSON.parse(job.payloadJson) } catch { /* noop */ }

  return (
    <div className="sync-job-row" style={{ borderBottom: '1px solid var(--color-border)', padding: '10px 16px', transition: 'background 0.1s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={job.status} />
        {payload.filename && (
          <span style={{ fontSize: 12, color: 'var(--color-text-primary)', fontFamily: 'monospace', background: 'var(--color-surface-secondary)', padding: '1px 6px', borderRadius: 3 }}>
            {payload.filename}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>{createdAt}</span>
        {job.resultJson && (
          <button className="sync-btn" onClick={() => setExpanded((v) => !v)} style={ghostBtn()}>
            {expanded ? '收起' : '详情'}
          </button>
        )}
      </div>
      {expanded && job.resultJson && (
        <pre style={{ marginTop: 8, padding: '10px 12px', background: 'var(--color-surface-secondary)', borderRadius: 6, fontSize: 11, color: 'var(--color-text-primary)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6, border: '1px solid var(--color-border)' }}>
          {job.resultJson}
        </pre>
      )}
    </div>
  )
}

// ── Upload panel ──────────────────────────────────────────────────────────────
function UploadPanel({ onToast }: { onToast: (item: Omit<ToastItem, 'id'>) => void }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      return apiFetch('/api/ingest/http/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content: text }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] })
      qc.invalidateQueries({ queryKey: ['admin', 'sync', 'jobs'] })
    },
  })

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    let successCount = 0, failCount = 0
    for (const file of Array.from(files)) {
      try { await uploadMutation.mutateAsync(file); successCount++ }
      catch { failCount++ }
    }
    if (successCount > 0) onToast({ message: `上传成功 ${successCount} 个文件`, type: 'success' })
    if (failCount > 0) onToast({ message: `上传失败 ${failCount} 个文件`, type: 'error' })
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        className="sync-upload-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? 'var(--color-brand)' : 'var(--color-border)'}`,
          borderRadius: 10,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'color-mix(in srgb, var(--color-brand) 3%, var(--color-bg))' : 'var(--color-bg)',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ color: dragging ? 'var(--color-brand)' : 'var(--color-text-secondary)', marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          {Icon.upload()}
        </div>
        <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>
          点击或拖拽文件上传
        </p>
        <p style={{ margin: '5px 0 0', color: 'var(--color-text-secondary)', fontSize: 12 }}>
          支持 <code style={{ fontFamily: 'monospace', background: 'var(--color-surface-secondary)', padding: '0 4px', borderRadius: 3 }}>.md</code>
          {' '}· <code style={{ fontFamily: 'monospace', background: 'var(--color-surface-secondary)', padding: '0 4px', borderRadius: 3 }}>.txt</code>
          ，可多选
        </p>
      </div>
      <input ref={fileInputRef} type="file" accept=".md,.txt" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
      {uploadMutation.isPending && (
        <div style={{ marginTop: 8, padding: '7px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 13, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 15 }}>⟳</span>
          上传中…
        </div>
      )}
    </div>
  )
}

// ── File editor modal ────────────────────────────────────────────────────────
function FileEditor({ filename, onClose, onToast }: {
  filename: string
  onClose: () => void
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  const { data, isLoading } = useFileContent(filename)
  const updateContent = useUpdateFileContent()
  const [edited, setEdited] = useState<string | null>(null)
  const [editedFilename, setEditedFilename] = useState(filename)

  const content = edited ?? data?.content ?? ''
  const isDirty = (edited !== null && edited !== data?.content) || editedFilename !== filename

  const handleSave = async () => {
    const contentToSave = edited ?? data?.content ?? ''
    const newFilename = editedFilename !== filename ? editedFilename : undefined
    try {
      await updateContent.mutateAsync({ filename, content: contentToSave, newFilename })
      setEdited(null)
      onToast({ message: '已保存', type: 'success' })
      if (newFilename) onClose()
    } catch {
      onToast({ message: '保存失败', type: 'error' })
    }
  }

  const ext = editedFilename.split('.').pop()?.toLowerCase()
  const lang = ext === 'md' ? 'Markdown' : ext === 'txt' ? 'Text' : ext ?? ''

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: '0 32px 64px rgba(0,0,0,0.2)', width: '95vw', maxWidth: 1200, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 16px', height: 52, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-surface-secondary)' }}>
          <span style={{ flexShrink: 0 }}>{Icon.file(ext)}</span>
          <input value={editedFilename} onChange={(e) => setEditedFilename(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', background: 'transparent', border: 'none', outline: 'none', padding: '4px 4px' }} />
          {lang && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', padding: '1px 7px', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 }}>{lang}</span>}
          {isDirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} title="有未保存的修改" />}
          <button className="sync-btn sync-btn-primary" onClick={handleSave} disabled={!isDirty || updateContent.isPending}
            style={{ padding: '5px 16px', borderRadius: 6, border: 'none', background: isDirty ? 'var(--color-brand)' : 'var(--color-border)', color: isDirty ? '#fff' : 'var(--color-text-disabled)', fontSize: 13, fontWeight: 600, cursor: isDirty ? 'pointer' : 'default', flexShrink: 0 }}>
            {updateContent.isPending ? '保存中…' : '保存'}
          </button>
          <button className="sync-btn" onClick={onClose}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
            关闭
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {isLoading
            ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>加载中…</div>
            : <textarea value={content} onChange={(e) => setEdited(e.target.value)}
                style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', padding: '20px 24px', fontFamily: 'monospace', fontSize: 13.5, lineHeight: 1.75, color: 'var(--color-text-primary)', background: 'var(--color-bg)' }}
                spellCheck={false} />
          }
        </div>
        <div style={{ height: 26, padding: '0 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-secondary)', display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          <span style={{ opacity: 0.7 }}>{editedFilename}</span>
          <span style={{ marginLeft: 'auto' }}>{content.split('\n').length} 行 · {content.length} 字符</span>
        </div>
      </div>
    </div>
  )
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts[parts.length - 1] === '.gitkeep') continue
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const nodePath = parts.slice(0, i + 1).join('/')
      let child = cur.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: nodePath, isDir: !isLast, children: [] }
        cur.children.push(child)
      }
      if (!isLast) child.isDir = true
      cur = child
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => sort(n.children))
  }
  sort(root.children)
  return root.children
}

// ── Inline name input ─────────────────────────────────────────────────────────
function InlineNameInput({ type, indent, onConfirm, onCancel }: {
  type: 'file' | 'dir'
  indent: number
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', paddingLeft: 16 + indent + 24, borderBottom: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-brand) 3%, var(--color-bg))' }}>
      <span style={{ flexShrink: 0, opacity: 0.6 }}>{type === 'dir' ? Icon.folder(true) : Icon.file()}</span>
      <input
        ref={inputRef}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onConfirm(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={type === 'dir' ? '文件夹名称' : '文件名（如 notes.md）'}
        style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', border: '1px solid var(--color-border)', borderRadius: 5, padding: '4px 8px', outline: 'none', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
      />
      <button onClick={() => name.trim() && onConfirm(name.trim())} style={{ ...ghostBtn(), fontSize: 12 }}>确认</button>
      <button onClick={onCancel} style={{ ...ghostBtn(), fontSize: 12 }}>取消</button>
    </div>
  )
}

// ── Tree node row ─────────────────────────────────────────────────────────────
function TreeNodeRow({ node, depth, onEdit, onDeleteFile, onDeleteDir, onToast }: {
  node: TreeNode
  depth: number
  onEdit: (path: string) => void
  onDeleteFile: (path: string) => void
  onDeleteDir: (path: string) => void
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  const [open, setOpen] = useState(true)
  const [addingItem, setAddingItem] = useState<'file' | 'dir' | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)
  const renameRef = useRef<HTMLInputElement>(null)
  const createDir = useCreateDir()
  const moveFile = useMoveFile()
  const qc = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) =>
      apiFetch('/api/ingest/http/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })

  const indent = depth * 20

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRenameVal(node.name)
    setRenaming(true)
    setTimeout(() => renameRef.current?.select(), 0)
  }

  const commitRename = async () => {
    const trimmed = renameVal.trim()
    setRenaming(false)
    if (!trimmed || trimmed === node.name) return
    const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${trimmed}` : trimmed
    try {
      await moveFile.mutateAsync({ from: node.path, to: newPath })
      onToast({ message: `已重命名为 ${trimmed}`, type: 'success' })
    } catch {
      onToast({ message: '重命名失败', type: 'error' })
    }
  }

  const handleAddConfirm = async (trimmed: string) => {
    const fullPath = node.path ? `${node.path}/${trimmed}` : trimmed
    try {
      if (addingItem === 'dir') {
        await createDir.mutateAsync(fullPath)
        onToast({ message: `已创建文件夹 ${fullPath}`, type: 'success' })
      } else {
        await uploadMutation.mutateAsync({ filename: fullPath, content: '' })
        onToast({ message: `已创建文件 ${fullPath}`, type: 'success' })
        onEdit(fullPath)
      }
    } catch {
      onToast({ message: '创建失败', type: 'error' })
    }
    setAddingItem(null)
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.path)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (!node.isDir) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (!node.isDir) return
    const fromPath = e.dataTransfer.getData('text/plain')
    if (!fromPath || fromPath === node.path) return
    if (fromPath.startsWith(node.path + '/')) { onToast({ message: '不能将文件夹拖入自身', type: 'error' }); return }
    const name = fromPath.includes('/') ? fromPath.slice(fromPath.lastIndexOf('/') + 1) : fromPath
    try {
      await moveFile.mutateAsync({ from: fromPath, to: `${node.path}/${name}` })
      onToast({ message: `已移动到 ${node.name}/`, type: 'success' })
    } catch { onToast({ message: '移动失败', type: 'error' }) }
  }

  const ext = node.isDir ? undefined : node.name.split('.').pop()?.toLowerCase()

  return (
    <>
      <div
        className="sr-row"
        draggable
        data-drag-over={dragOver ? 'true' : undefined}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex', alignItems: 'center',
          height: 38,
          paddingLeft: 12 + indent,
          paddingRight: 8,
          borderBottom: '1px solid var(--color-border)',
          gap: 0,
          position: 'relative',
        }}
      >
        {/* indent lines */}
        {depth > 0 && Array.from({ length: depth }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: 20 + i * 20, top: 0, bottom: 0, width: 1, background: 'var(--color-border)', opacity: 0.5 }} />
        ))}

        {node.isDir ? (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0, borderRadius: 4 }}
            >
              {Icon.chevron(open)}
            </button>
            <span style={{ flexShrink: 0, marginRight: 7 }}>{Icon.folder(open)}</span>
            {renaming ? (
              <input ref={renameRef} className="sr-rename" value={renameVal} autoFocus
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
                onBlur={commitRename} onClick={(e) => e.stopPropagation()} />
            ) : (
              <span onDoubleClick={handleDoubleClick}
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', flex: 1, userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title="双击重命名">
                {node.name}
              </span>
            )}
            <div className="sr-actions">
              <button className="sr-icon-btn" onClick={() => setAddingItem('dir')} title="新建子文件夹">
                {Icon.folderPlus()}
              </button>
              <button className="sr-icon-btn danger" onClick={() => onDeleteDir(node.path)} title="删除文件夹">
                {Icon.trash()}
              </button>
            </div>
          </>
        ) : (
          <>
            <span style={{ width: 24, flexShrink: 0 }} />
            {renaming ? (
              <input ref={renameRef} className="sr-rename" value={renameVal} autoFocus
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
                onBlur={commitRename} onClick={(e) => e.stopPropagation()} />
            ) : (
              <span onDoubleClick={handleDoubleClick}
                style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'none' }}
                title="双击重命名">
                {node.name}
              </span>
            )}
            <div className="sr-actions">
              <button className="sr-icon-btn" onClick={() => onEdit(node.path)} title="预览 / 编辑">
                {Icon.edit()}
              </button>
              <button className="sr-icon-btn danger" onClick={() => onDeleteFile(node.path)} title="删除">
                {Icon.trash()}
              </button>
            </div>
          </>
        )}
      </div>

      {node.isDir && open && addingItem && (
        <InlineNameInput type={addingItem} indent={indent} onConfirm={handleAddConfirm} onCancel={() => setAddingItem(null)} />
      )}

      {node.isDir && open && node.children.map((child) => (
        <TreeNodeRow key={child.path} node={child} depth={depth + 1}
          onEdit={onEdit} onDeleteFile={onDeleteFile} onDeleteDir={onDeleteDir} onToast={onToast} />
      ))}
    </>
  )
}

// ── Uploaded files list ───────────────────────────────────────────────────────
function FilesList({ onToast }: { onToast: (item: Omit<ToastItem, 'id'>) => void }) {
  const { data, isLoading } = useUploadedFiles()
  const deleteFile = useDeleteFile()
  const deleteDir = useDeleteDir()
  const createDir = useCreateDir()
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [addingRoot, setAddingRoot] = useState<'file' | 'dir' | null>(null)
  const qc = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) =>
      apiFetch('/api/ingest/http/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })

  const handleDeleteFile = async (filename: string) => {
    try { await deleteFile.mutateAsync(filename); onToast({ message: `已删除 ${filename}`, type: 'success' }) }
    catch { onToast({ message: '删除失败', type: 'error' }) }
  }
  const handleDeleteDir = async (dirname: string) => {
    try { await deleteDir.mutateAsync(dirname); onToast({ message: `已删除文件夹 ${dirname}`, type: 'success' }) }
    catch { onToast({ message: '删除失败', type: 'error' }) }
  }
  const handleRootAddConfirm = async (trimmed: string) => {
    try {
      if (addingRoot === 'dir') {
        await createDir.mutateAsync(trimmed)
        onToast({ message: `已创建文件夹 ${trimmed}`, type: 'success' })
      } else {
        await uploadMutation.mutateAsync({ filename: trimmed, content: '' })
        onToast({ message: `已创建文件 ${trimmed}`, type: 'success' })
        setEditingFile(trimmed)
      }
    } catch { onToast({ message: '创建失败', type: 'error' }) }
    setAddingRoot(null)
  }

  const tree = buildTree(data?.files ?? [])
  const fileCount = (data?.files ?? []).filter((f) => !f.endsWith('.gitkeep')).length

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            已上传文件
          </h2>
          {fileCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', opacity: 0.6 }}>{fileCount} 个文件</span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="sync-btn" onClick={() => setAddingRoot('dir')} style={ghostBtn()}
            title="新建文件夹">
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {Icon.folderPlus()}
              <span>文件夹</span>
            </span>
          </button>
          <button className="sync-btn" onClick={() => setAddingRoot('file')} style={ghostBtn()}
            title="新建文件">
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {Icon.newFile()}
              <span>新建文件</span>
            </span>
          </button>
        </div>
      </div>

      {/* Tree container */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--color-bg)' }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
            加载中…
          </div>
        ) : (
          <>
            {addingRoot && (
              <InlineNameInput type={addingRoot} indent={0} onConfirm={handleRootAddConfirm} onCancel={() => setAddingRoot(null)} />
            )}
            {tree.length === 0 && !addingRoot ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }}>
                  <rect x="3" y="8" width="34" height="26" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M3 14h34" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 8l5-5h8l3 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>暂无文件</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', opacity: 0.6 }}>拖拽上传或点击右上角新建</p>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNodeRow key={node.path} node={node} depth={0}
                  onEdit={setEditingFile} onDeleteFile={handleDeleteFile} onDeleteDir={handleDeleteDir} onToast={onToast} />
              ))
            )}
          </>
        )}
      </div>

      {editingFile && (
        <FileEditor filename={editingFile} onClose={() => setEditingFile(null)} onToast={onToast} />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SyncPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...item, id }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const { data: jobsData } = useSyncJobs(false)
  const hasActiveJobs = jobsData?.data.some((j) => j.status === 'pending' || j.status === 'running') ?? false
  const { data: polledJobsData } = useSyncJobs(hasActiveJobs)
  const jobs = polledJobsData?.data ?? jobsData?.data ?? []

  return (
    <div style={{ padding: '36px 40px', maxWidth: 820 }}>
      <style>{GLOBAL_STYLES}</style>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 5px' }}>
          文档上传
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          上传 Markdown / 文本文件，或在线创建和编辑文档
        </p>
      </div>

      <UploadPanel onToast={addToast} />
      <FilesList onToast={addToast} />

      {/* Upload records */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
            上传记录
          </h2>
          {hasActiveJobs && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1d4ed8', background: '#eff6ff', padding: '2px 10px', borderRadius: 'var(--radius-full)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6' }} />
              运行中，每 3 秒刷新
            </span>
          )}
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--color-bg)' }}>
          {jobs.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13, opacity: 0.6 }}>
              暂无上传记录
            </div>
          ) : (
            jobs.map((job) => <JobRow key={job.id} job={job} />)
          )}
        </div>
      </div>

      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
