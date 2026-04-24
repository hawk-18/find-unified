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
  .sync-tree-row:hover { background: var(--color-surface-secondary); }
  .sync-tree-row:hover .sync-row-actions { opacity: 1; }
  .sync-row-actions { opacity: 0; transition: opacity 0.1s; }
  .sync-job-row:hover { background: var(--color-surface-secondary); }
  .sync-btn { transition: background 0.12s, border-color 0.12s, color 0.12s; }
  .sync-btn:hover:not(:disabled) { background: var(--color-surface-secondary) !important; }
  .sync-btn-danger:hover:not(:disabled) { background: #fef2f2 !important; }
  .sync-btn-primary:hover:not(:disabled) { filter: brightness(0.92); }
  .sync-upload-zone:hover { border-color: var(--color-brand) !important; background: var(--color-surface-secondary) !important; }
  .sync-input:focus { border-color: var(--color-brand) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .sync-tree-row[data-drag-over="true"] { background: color-mix(in srgb, var(--color-brand) 8%, var(--color-bg)) !important; outline: 2px dashed var(--color-brand); outline-offset: -2px; }
  .sync-tree-row[draggable="true"] { cursor: grab; }
  .sync-rename-input { flex: 1; font-family: monospace; font-size: var(--text-sm); background: var(--color-bg); border: 1px solid var(--color-brand); border-radius: 3px; padding: 1px 6px; outline: none; color: var(--color-text-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand) 15%, transparent); }
`

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
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h2 style={{
        fontSize: 'var(--text-sm)', fontWeight: 600,
        color: 'var(--color-text-secondary)', margin: 0,
        textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

// ── Shared button styles ──────────────────────────────────────────────────────
const ghostBtn = (danger = false): React.CSSProperties => ({
  padding: '3px 10px',
  border: `1px solid ${danger ? 'var(--color-error)' : 'var(--color-border)'}`,
  borderRadius: 'var(--radius-xs)',
  background: 'transparent',
  color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)',
  fontSize: 'var(--text-xs)', fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap' as const,
})

// ── Job row ───────────────────────────────────────────────────────────────────
function JobRow({ job }: { job: SyncJob }) {
  const [expanded, setExpanded] = useState(false)
  const createdAt = new Date(job.createdAt).toLocaleString('zh-CN')
  const finishedAt = job.finishedAt ? new Date(job.finishedAt).toLocaleString('zh-CN') : null

  let payload: { filename?: string } = {}
  try { payload = JSON.parse(job.payloadJson) } catch { /* noop */ }

  return (
    <div className="sync-job-row" style={{
      borderBottom: '1px solid var(--color-border)',
      padding: '10px 16px',
      transition: 'background 0.1s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          padding: '2px 8px', borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)', fontWeight: 600,
          background: 'var(--color-surface-secondary)',
          color: 'var(--color-text-secondary)',
        }}>
          {job.jobType}
        </span>

        <StatusBadge status={job.status} />

        {payload.filename && (
          <span style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)',
            fontFamily: 'monospace',
            background: 'var(--color-surface-secondary)',
            padding: '1px 6px', borderRadius: 3,
          }}>
            {payload.filename}
          </span>
        )}

        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flex: 1 }}>
          {createdAt}
        </span>

        {finishedAt && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)' }}>
            完成 {finishedAt}
          </span>
        )}

        {job.resultJson && (
          <button
            className="sync-btn"
            onClick={() => setExpanded((v) => !v)}
            style={ghostBtn()}
          >
            {expanded ? '收起' : '详情'}
          </button>
        )}
      </div>

      {expanded && job.resultJson && (
        <pre style={{
          marginTop: 10,
          padding: '10px 12px',
          background: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-xs)',
          fontSize: 12,
          color: 'var(--color-text-primary)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
          border: '1px solid var(--color-border)',
        }}>
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div style={{ marginBottom: 32 }}>
      <div
        className="sync-upload-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-brand)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--color-surface-secondary)' : 'var(--color-bg)',
          transition: 'all 0.15s',
        }}
      >
        {/* Upload icon */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--color-surface-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          fontSize: 20,
        }}>
          ↑
        </div>
        <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--text-body)', fontWeight: 500 }}>
          点击或拖拽文件到此处上传
        </p>
        <p style={{ margin: '6px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          支持 <code style={{ fontFamily: 'monospace', background: 'var(--color-surface-secondary)', padding: '1px 5px', borderRadius: 3 }}>.md</code>
          {' '}和{' '}
          <code style={{ fontFamily: 'monospace', background: 'var(--color-surface-secondary)', padding: '1px 5px', borderRadius: 3 }}>.txt</code>
          {' '}格式，可多文件同时上传
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept=".md,.txt" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />

      {uploadMutation.isPending && (
        <div style={{
          marginTop: 10, padding: '8px 12px',
          background: '#eff6ff', borderRadius: 'var(--radius-xs)',
          fontSize: 'var(--text-sm)', color: '#1d4ed8',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg)',
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
        width: '95vw', maxWidth: 1200,
        height: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '0 16px',
          height: 52,
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--color-surface-secondary)',
        }}>
          {/* File icon */}
          <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>

          <input
            value={editedFilename}
            onChange={(e) => setEditedFilename(e.target.value)}
            style={{
              flex: 1, fontFamily: 'monospace',
              fontSize: 'var(--text-sm)', fontWeight: 500,
              color: 'var(--color-text-primary)',
              background: 'transparent', border: 'none', outline: 'none',
              padding: '4px 6px', borderRadius: 4,
            }}
          />

          {lang && (
            <span style={{
              fontSize: 11, color: 'var(--color-text-secondary)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              padding: '1px 7px', borderRadius: 3,
              fontFamily: 'monospace', flexShrink: 0,
            }}>
              {lang}
            </span>
          )}

          {isDirty && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} title="有未保存的修改" />
          )}

          <button
            className="sync-btn sync-btn-primary"
            onClick={handleSave}
            disabled={!isDirty || updateContent.isPending}
            style={{
              padding: '5px 16px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              background: isDirty ? 'var(--color-brand)' : 'var(--color-border)',
              color: isDirty ? '#fff' : 'var(--color-text-disabled)',
              fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: isDirty ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            {updateContent.isPending ? '保存中…' : '保存'}
          </button>
          <button
            className="sync-btn"
            onClick={onClose}
            style={{
              padding: '5px 12px', borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            关闭
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              加载中…
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setEdited(e.target.value)}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                padding: '20px 24px',
                fontFamily: 'monospace', fontSize: 14,
                lineHeight: 1.7,
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg)',
              }}
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer status bar */}
        <div style={{
          height: 28, padding: '0 16px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface-secondary)',
          display: 'flex', alignItems: 'center', gap: 16,
          fontSize: 11, color: 'var(--color-text-secondary)',
        }}>
          <span>{editedFilename}</span>
          <span style={{ marginLeft: 'auto' }}>
            {content.split('\n').length} 行 · {content.length} 字符
          </span>
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
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', paddingLeft: indent + 36,
      borderBottom: '1px solid var(--color-border)',
      background: 'color-mix(in srgb, var(--color-brand) 4%, var(--color-bg))',
    }}>
      <span style={{ fontSize: 13 }}>{type === 'dir' ? '📁' : '📄'}</span>
      <input
        className="sync-input"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (name.trim()) onConfirm(name.trim()) }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={type === 'dir' ? '文件夹名称' : '文件名称（如 doc.md）'}
        style={{
          flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'monospace',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)',
          padding: '3px 8px', outline: 'none', background: 'var(--color-bg)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      />
      <button className="sync-btn" onClick={() => { if (name.trim()) onConfirm(name.trim()) }} style={{ ...ghostBtn(), fontSize: 11 }}>确认</button>
      <button className="sync-btn" onClick={onCancel} style={{ ...ghostBtn(), fontSize: 11 }}>取消</button>
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

  const indent = depth * 18

  // Start rename on double-click
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

  // Drag handlers
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
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!node.isDir) return
    const fromPath = e.dataTransfer.getData('text/plain')
    if (!fromPath || fromPath === node.path) return
    // Prevent dropping into own subtree
    if (fromPath.startsWith(node.path + '/')) {
      onToast({ message: '不能将文件夹拖入自身', type: 'error' })
      return
    }
    const name = fromPath.includes('/') ? fromPath.slice(fromPath.lastIndexOf('/') + 1) : fromPath
    const toPath = `${node.path}/${name}`
    try {
      await moveFile.mutateAsync({ from: fromPath, to: toPath })
      onToast({ message: `已移动到 ${node.path}/`, type: 'success' })
    } catch {
      onToast({ message: '移动失败', type: 'error' })
    }
  }

  return (
    <>
      <div
        className="sync-tree-row"
        draggable
        data-drag-over={dragOver ? 'true' : undefined}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', paddingLeft: 12 + indent,
          borderBottom: '1px solid var(--color-border)',
          transition: 'background 0.1s',
          minHeight: 36,
        }}
      >
        {node.isDir ? (
          <>
            <span
              onClick={() => setOpen((v) => !v)}
              style={{
                cursor: 'pointer', fontSize: 10, userSelect: 'none',
                width: 16, textAlign: 'center',
                color: 'var(--color-text-secondary)',
                transition: 'transform 0.15s',
                display: 'inline-block',
                transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            >
              ▾
            </span>
            <span style={{ fontSize: 15, flexShrink: 0 }}>📁</span>
            {renaming ? (
              <input
                ref={renameRef}
                className="sync-rename-input"
                value={renameVal}
                autoFocus
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={handleDoubleClick}
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: 'var(--color-text-primary)', flex: 1,
                  userSelect: 'none',
                }}
                title="双击重命名"
              >
                {node.name}
              </span>
            )}
            <div className="sync-row-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="sync-btn" onClick={() => setAddingItem('dir')} style={ghostBtn()}>+ 文件夹</button>
              <button className="sync-btn sync-btn-danger" onClick={() => onDeleteDir(node.path)} style={ghostBtn(true)}>删除</button>
            </div>
          </>
        ) : (
          <>
            <span style={{ width: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>
            {renaming ? (
              <input
                ref={renameRef}
                className="sync-rename-input"
                value={renameVal}
                autoFocus
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={handleDoubleClick}
                style={{
                  fontSize: 'var(--text-sm)', fontFamily: 'monospace',
                  color: 'var(--color-text-primary)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
                title="双击重命名"
              >
                {node.name}
              </span>
            )}
            <div className="sync-row-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="sync-btn" onClick={() => onEdit(node.path)} style={ghostBtn()}>预览 / 编辑</button>
              <button className="sync-btn sync-btn-danger" onClick={() => onDeleteFile(node.path)} style={ghostBtn(true)}>删除</button>
            </div>
          </>
        )}
      </div>

      {node.isDir && open && addingItem && (
        <InlineNameInput
          type={addingItem}
          indent={indent}
          onConfirm={handleAddConfirm}
          onCancel={() => setAddingItem(null)}
        />
      )}

      {node.isDir && open && node.children.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDeleteFile={onDeleteFile}
          onDeleteDir={onDeleteDir}
          onToast={onToast}
        />
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

  return (
    <div style={{ marginBottom: 36 }}>
      <SectionHeader title="已上传文件">
        <button className="sync-btn" onClick={() => setAddingRoot('dir')} style={ghostBtn()}>+ 文件夹</button>
        <button className="sync-btn" onClick={() => setAddingRoot('file')} style={ghostBtn()}>+ 文件</button>
      </SectionHeader>

      <div style={{
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}>
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            加载中…
          </div>
        ) : (
          <>
            {addingRoot && (
              <InlineNameInput
                type={addingRoot}
                indent={0}
                onConfirm={handleRootAddConfirm}
                onCancel={() => setAddingRoot(null)}
              />
            )}
            {tree.length === 0 && !addingRoot ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>暂无文件，点击上方上传或新建</p>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNodeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  onEdit={setEditingFile}
                  onDeleteFile={handleDeleteFile}
                  onDeleteDir={handleDeleteDir}
                  onToast={onToast}
                />
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

      {/* Page title */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
          文档上传
        </h1>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          上传本地 Markdown / 文本文件，或在线创建和编辑文档。
        </p>
      </div>

      <UploadPanel onToast={addToast} />
      <FilesList onToast={addToast} />

      {/* Upload records */}
      <div>
        <SectionHeader title="上传记录">
          {hasActiveJobs && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 'var(--text-xs)', color: '#1d4ed8',
              background: '#eff6ff', padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 1.5s infinite' }} />
              运行中，每 3 秒刷新
            </span>
          )}
        </SectionHeader>

        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--color-bg)',
        }}>
          {jobs.length === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
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
