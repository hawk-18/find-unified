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
  type SyncJob,
} from '@/lib/queries/admin-sync'
import { apiFetch } from '@/lib/api-client'
import { Toast, type ToastItem } from '@/components/Toast'

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-text-secondary)',
  running: '#2563eb',
  done: 'var(--color-status-ok)',
  failed: 'var(--color-error)',
}
const STATUS_BG: Record<string, string> = {
  pending: '#f2f2f2',
  running: '#eff6ff',
  done: '#f0fdf4',
  failed: '#fef2f2',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  done: '完成',
  failed: '失败',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: STATUS_COLOR[status] ?? 'var(--color-text-secondary)',
        background: STATUS_BG[status] ?? '#f2f2f2',
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── Job row ───────────────────────────────────────────────────────────────────
function JobRow({ job }: { job: SyncJob }) {
  const [expanded, setExpanded] = useState(false)
  const createdAt = new Date(job.createdAt).toLocaleString('zh-CN')
  const finishedAt = job.finishedAt ? new Date(job.finishedAt).toLocaleString('zh-CN') : '—'

  let payload: { filename?: string } = {}
  try { payload = JSON.parse(job.payloadJson) } catch { /* noop */ }

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            background: 'var(--color-surface-secondary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {job.jobType}
        </span>

        <StatusBadge status={job.status} />

        {payload.filename && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            {payload.filename}
          </span>
        )}

        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', flex: 1 }}>
          {createdAt}
        </span>

        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          完成：{finishedAt}
        </span>

        {job.resultJson && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              padding: '2px 10px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              background: 'transparent',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {expanded ? '收起' : '详情'}
          </button>
        )}
      </div>

      {expanded && job.resultJson && (
        <pre
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
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
    let successCount = 0
    let failCount = 0
    for (const file of Array.from(files)) {
      try {
        await uploadMutation.mutateAsync(file)
        successCount++
      } catch {
        failCount++
      }
    }
    if (successCount > 0) onToast({ message: `上传成功 ${successCount} 个文件`, type: 'success' })
    if (failCount > 0) onToast({ message: `上传失败 ${failCount} 个文件`, type: 'error' })
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-brand)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '32px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--color-surface-secondary)' : 'var(--color-bg)',
          transition: 'all 0.15s',
          marginBottom: 12,
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--text-body)' }}>
          点击或拖拽上传 <strong>.md</strong> / <strong>.txt</strong> 文件
        </p>
        <p style={{ margin: '6px 0 0', color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)' }}>
          支持多文件同时上传
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadMutation.isPending && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: '4px 0' }}>
          上传中…
        </p>
      )}
    </div>
  )
}

// ── File editor modal ────────────────────────────────────────────────────────
function FileEditor({
  filename,
  onClose,
  onToast,
}: {
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

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          width: '95vw', maxWidth: 1200,
          height: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <input
            value={editedFilename}
            onChange={(e) => setEditedFilename(e.target.value)}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--color-border)',
              outline: 'none',
              padding: '2px 4px',
            }}
          />
          <button
            onClick={handleSave}
            disabled={!isDirty || updateContent.isPending}
            style={{
              padding: '4px 14px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              background: isDirty ? 'var(--color-brand)' : 'var(--color-surface-secondary)',
              color: isDirty ? '#fff' : 'var(--color-text-disabled)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: isDirty ? 'pointer' : 'default',
            }}
          >
            {updateContent.isPending ? '保存中…' : '保存'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {isLoading ? (
            <p style={{ padding: 24, color: 'var(--color-text-secondary)' }}>加载中…</p>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setEdited(e.target.value)}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg)',
              }}
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
interface TreeNode {
  name: string
  path: string       // relative path from root
  isDir: boolean
  children: TreeNode[]
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }

  for (const f of files) {
    // normalize separators and skip .gitkeep
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

  // Sort: dirs first, then files, alphabetically
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

// ── Tree node row ─────────────────────────────────────────────────────────────
function TreeNodeRow({
  node,
  depth,
  onEdit,
  onDeleteFile,
  onDeleteDir,
  onToast,
}: {
  node: TreeNode
  depth: number
  onEdit: (path: string) => void
  onDeleteFile: (path: string) => void
  onDeleteDir: (path: string) => void
  onToast: (item: Omit<ToastItem, 'id'>) => void
}) {
  const [open, setOpen] = useState(true)
  const [addingItem, setAddingItem] = useState<'file' | 'dir' | null>(null)
  const [newName, setNewName] = useState('')
  const createDir = useCreateDir()
  const uploadMutation = useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) =>
      apiFetch('/api/ingest/http/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      }),
    onSuccess: () => {
      useQueryClient().invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] })
    },
  })

  const indent = depth * 20

  const handleAddConfirm = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
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
    setNewName('')
  }

  const btnStyle: React.CSSProperties = {
    padding: '1px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 0',
          paddingLeft: indent,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {node.isDir ? (
          <>
            <span
              onClick={() => setOpen((v) => !v)}
              style={{ cursor: 'pointer', fontSize: 'var(--text-sm)', userSelect: 'none', width: 16 }}
            >
              {open ? '▾' : '▸'}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>
              📁 {node.name}
            </span>
            <button style={btnStyle} onClick={() => { setAddingItem('dir'); setNewName('') }}>+ 文件夹</button>
            <button style={btnStyle} onClick={() => { setAddingItem('file'); setNewName('') }}>+ 文件</button>
            <button
              onClick={() => onDeleteDir(node.path)}
              style={{ ...btnStyle, border: '1px solid var(--color-error)', color: 'var(--color-error)' }}
            >
              删除
            </button>
          </>
        ) : (
          <>
            <span style={{ width: 16 }} />
            <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'monospace', color: 'var(--color-text-primary)', flex: 1 }}>
              📄 {node.name}
            </span>
            <button style={btnStyle} onClick={() => onEdit(node.path)}>预览 / 编辑</button>
            <button
              onClick={() => onDeleteFile(node.path)}
              style={{ ...btnStyle, border: '1px solid var(--color-error)', color: 'var(--color-error)' }}
            >
              删除
            </button>
          </>
        )}
      </div>

      {/* Inline new-item input */}
      {node.isDir && addingItem && open && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', paddingLeft: indent + 36,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-secondary)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {addingItem === 'dir' ? '📁' : '📄'}
          </span>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddConfirm()
              if (e.key === 'Escape') { setAddingItem(null); setNewName('') }
            }}
            placeholder={addingItem === 'dir' ? '文件夹名称' : '文件名称（如 doc.md）'}
            style={{
              flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'monospace',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)',
              padding: '2px 6px', outline: 'none', background: 'var(--color-bg)',
            }}
          />
          <button style={btnStyle} onClick={handleAddConfirm}>确认</button>
          <button style={btnStyle} onClick={() => { setAddingItem(null); setNewName('') }}>取消</button>
        </div>
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
  const [rootNewName, setRootNewName] = useState('')
  const qc = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) =>
      apiFetch('/api/ingest/http/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })

  const handleDeleteFile = async (filename: string) => {
    try {
      await deleteFile.mutateAsync(filename)
      onToast({ message: `已删除 ${filename}`, type: 'success' })
    } catch {
      onToast({ message: '删除失败', type: 'error' })
    }
  }

  const handleDeleteDir = async (dirname: string) => {
    try {
      await deleteDir.mutateAsync(dirname)
      onToast({ message: `已删除文件夹 ${dirname}`, type: 'success' })
    } catch {
      onToast({ message: '删除失败', type: 'error' })
    }
  }

  const handleRootAddConfirm = async () => {
    const trimmed = rootNewName.trim()
    if (!trimmed) return
    try {
      if (addingRoot === 'dir') {
        await createDir.mutateAsync(trimmed)
        onToast({ message: `已创建文件夹 ${trimmed}`, type: 'success' })
      } else {
        await uploadMutation.mutateAsync({ filename: trimmed, content: '' })
        onToast({ message: `已创建文件 ${trimmed}`, type: 'success' })
        setEditingFile(trimmed)
      }
    } catch {
      onToast({ message: '创建失败', type: 'error' })
    }
    setAddingRoot(null)
    setRootNewName('')
  }

  const tree = buildTree(data?.files ?? [])

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <h2
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            flex: 1,
          }}
        >
          已上传文件
        </h2>
        <button
          onClick={() => { setAddingRoot('dir'); setRootNewName('') }}
          style={{
            padding: '3px 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          + 文件夹
        </button>
        <button
          onClick={() => { setAddingRoot('file'); setRootNewName('') }}
          style={{
            padding: '3px 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          + 文件
        </button>
      </div>

      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 16px',
          background: 'var(--color-bg)',
        }}
      >
        {isLoading ? (
          <p style={{ padding: '16px 0', color: 'var(--color-text-secondary)' }}>加载中…</p>
        ) : (
          <>
            {/* Root-level new item input */}
            {addingRoot && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface-secondary)',
                }}
              >
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {addingRoot === 'dir' ? '📁' : '📄'}
                </span>
                <input
                  autoFocus
                  value={rootNewName}
                  onChange={(e) => setRootNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRootAddConfirm()
                    if (e.key === 'Escape') { setAddingRoot(null); setRootNewName('') }
                  }}
                  placeholder={addingRoot === 'dir' ? '文件夹名称' : '文件名称（如 doc.md）'}
                  style={{
                    flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'monospace',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)',
                    padding: '2px 6px', outline: 'none', background: 'var(--color-bg)',
                  }}
                />
                <button
                  onClick={handleRootAddConfirm}
                  style={{ padding: '1px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', background: 'transparent', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  确认
                </button>
                <button
                  onClick={() => { setAddingRoot(null); setRootNewName('') }}
                  style={{ padding: '1px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', background: 'transparent', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  取消
                </button>
              </div>
            )}

            {tree.length === 0 && !addingRoot ? (
              <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-body)' }}>
                暂无文件
              </p>
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
        <FileEditor
          filename={editingFile}
          onClose={() => setEditingFile(null)}
          onToast={onToast}
        />
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
    <div style={{ padding: '32px', maxWidth: 760 }}>
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: '0 0 24px',
        }}
      >
        文档上传
      </h1>

      <UploadPanel onToast={addToast} />
      <FilesList onToast={addToast} />

      {/* Jobs list */}
      <div>
        <h2
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            margin: '0 0 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          上传记录
        </h2>

        {hasActiveJobs && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
            ● 有任务运行中，每 3 秒自动刷新
          </p>
        )}

        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 16px',
            background: 'var(--color-bg)',
          }}
        >
          {jobs.length === 0 ? (
            <p
              style={{
                padding: '24px 0',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-body)',
              }}
            >
              暂无上传记录
            </p>
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
