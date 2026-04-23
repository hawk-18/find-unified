import Link from 'next/link'
import { Sidebar } from '@/components/chat/Sidebar'
import { MessageList } from '@/components/chat/MessageList'
import { InputBar } from '@/components/chat/InputBar'
import { SourceStatusBar } from '@/components/chat/SourceStatusBar'

export default function ChatPage() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />

      {/* main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* top bar */}
        <div
          style={{
            height: 52,
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            flexShrink: 0,
          }}
        >
          <SourceStatusBar />
          <Link
            href="/admin/sync"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-secondary)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            </svg>
            文档管理
          </Link>
        </div>

        <MessageList />
        <InputBar />
      </div>
    </div>
  )
}
