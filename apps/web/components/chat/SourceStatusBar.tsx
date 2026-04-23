'use client'

import { useChatStore } from '@/lib/store/chat'

const statusLabel: Record<string, string> = {
  ok: '正常',
  degraded: '降级',
  unavailable: '不可用',
}

const statusColor: Record<string, string> = {
  ok: 'var(--color-status-ok)',
  degraded: 'var(--color-status-degraded)',
  unavailable: 'var(--color-status-unavailable)',
}

export function SourceStatusBar() {
  const sourceStatus = useChatStore((s) => s.sourceStatus)

  if (sourceStatus.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {sourceStatus.map((s) => (
        <span
          key={s.source}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: statusColor[s.status] ?? '#666',
            background: '#f9f9f9',
            border: `1px solid ${statusColor[s.status] ?? '#ccc'}`,
            borderRadius: 'var(--radius-md)',
            padding: '2px 8px',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor[s.status] ?? '#999',
              flexShrink: 0,
            }}
          />
          {s.source} · {statusLabel[s.status] ?? s.status}
        </span>
      ))}
    </div>
  )
}
