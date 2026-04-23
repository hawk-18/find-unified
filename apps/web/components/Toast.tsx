'use client'

import { useEffect, useState } from 'react'

export interface ToastItem {
  id: string
  message: string
  type?: 'error' | 'success'
}

export function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  const bg = item.type === 'error' ? 'var(--color-error)' : 'var(--color-status-ok)'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 24,
        background: bg,
        color: '#fff',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 18px',
        fontSize: 'var(--text-body)',
        fontWeight: 500,
        boxShadow: 'var(--shadow-hover)',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
      }}
    >
      {item.message}
    </div>
  )
}
