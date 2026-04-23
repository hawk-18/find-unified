'use client'

import { useEffect, useState } from 'react'
import { useMyCliPreference, useUpdateMyCliPreference, type CliValue } from '@/lib/queries/cli'
import { useChatStore } from '@/lib/store/chat'
import { CliSelector } from '@/components/CliSelector'
import { Toast, type ToastItem } from '@/components/Toast'

export default function SettingsPage() {
  const { data, isLoading } = useMyCliPreference()
  const updateMyCli = useUpdateMyCliPreference()
  const setCli = useChatStore((s) => s.setCli)
  const [selected, setSelected] = useState<CliValue>('claude_code')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    if (data?.cli) {
      setSelected(data.cli)
      setCli(data.cli)
    }
  }, [data, setCli])

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...item, id }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const handleChange = async (cli: CliValue) => {
    setSelected(cli)
    setCli(cli) // update store immediately
    try {
      await updateMyCli.mutateAsync(cli)
      addToast({ message: '已保存', type: 'success' })
    } catch {
      addToast({ message: '保存失败', type: 'error' })
    }
  }

  return (
    <div
      style={{
        flex: 1,
        padding: '32px 24px',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: '0 0 28px',
        }}
      >
        个人设置
      </h1>

      <section
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '20px 24px',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: '0 0 6px',
          }}
        >
          我的默认 CLI
        </h2>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            margin: '0 0 16px',
          }}
        >
          发起检索时将自动附加此 CLI 作为 <code>user_context.platform</code>。
        </p>
        {isLoading ? (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>
            加载中…
          </span>
        ) : (
          <CliSelector
            value={selected}
            onChange={handleChange}
            disabled={updateMyCli.isPending}
          />
        )}
      </section>

      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
