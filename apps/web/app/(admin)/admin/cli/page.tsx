'use client'

import { useEffect, useState } from 'react'
import { useSystemDefaultCli, useUpdateSystemDefaultCli, type CliValue } from '@/lib/queries/cli'
import { CliSelector } from '@/components/CliSelector'
import { Toast, type ToastItem } from '@/components/Toast'

export default function CliPage() {
  const { data, isLoading } = useSystemDefaultCli()
  const updateDefault = useUpdateSystemDefaultCli()
  const [selected, setSelected] = useState<CliValue>('claude_code')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    if (data?.defaultCli) setSelected(data.defaultCli)
  }, [data])

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...item, id }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const handleChange = async (cli: CliValue) => {
    setSelected(cli)
    try {
      await updateDefault.mutateAsync(cli)
      addToast({ message: '已更新', type: 'success' })
    } catch {
      addToast({ message: '更新失败', type: 'error' })
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: 560 }}>
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: '0 0 28px',
        }}
      >
        CLI 策略
      </h1>

      {/* System default */}
      <section
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '20px 24px',
          marginBottom: 24,
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
          系统默认 CLI
        </h2>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            margin: '0 0 16px',
          }}
        >
          未设置个人偏好的用户将使用此默认值。
        </p>
        {isLoading ? (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>
            加载中…
          </span>
        ) : (
          <CliSelector
            value={selected}
            onChange={handleChange}
            disabled={updateDefault.isPending}
          />
        )}
      </section>

      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
