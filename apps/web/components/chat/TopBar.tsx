'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/lib/store/chat'
import { CLI_OPTIONS, useSystemDefaultCli } from '@/lib/queries/cli'

export function TopBar() {
  const cli = useChatStore((s) => s.cli)
  const setCli = useChatStore((s) => s.setCli)
  const { data } = useSystemDefaultCli()

  useEffect(() => {
    if (data?.defaultCli) setCli(data.defaultCli)
  }, [data, setCli])

  const label = CLI_OPTIONS.find((o) => o.value === cli)?.label ?? cli

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: '#16a34a',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 'var(--radius-md)',
          padding: '2px 10px',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#16a34a',
            flexShrink: 0,
            animation: 'pulse-dot 1.6s ease-in-out infinite',
          }}
        />
        {label}
      </span>
    </>
  )
}
