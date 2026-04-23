'use client'

import ReactMarkdown from 'react-markdown'
import { useChatStore, type ChatMessage } from '@/lib/store/chat'

const SUGGESTIONS = [
  'CVTE 成立多少年了？',
  '希沃交互智能平板有哪些核心功能？',
  '如何接入 MCP 数据源？',
]

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
      <div
        style={{
          background: 'var(--color-brand)',
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          maxWidth: '70%',
          fontSize: 'var(--text-body)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}

function MetaFooter({ msg }: { msg: ChatMessage }) {
  const uniqueEvidence = msg.evidence
    ? msg.evidence.filter((e, i, arr) => arr.findIndex((x) => x.source_ref === e.source_ref) === i)
    : []
  const hasEvidence = uniqueEvidence.length > 0
  const hasSkills = msg.skillNames && msg.skillNames.length > 0
  if (!hasEvidence && !hasSkills) return null

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--color-border)',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
        lineHeight: 1.6,
      }}
    >
      {hasEvidence && (
        <div style={{ marginBottom: hasSkills ? 4 : 0 }}>
          <span style={{ fontWeight: 600 }}>参考文档：</span>
          <ul style={{ margin: '2px 0 0 0', paddingLeft: 16 }}>
            {uniqueEvidence.map((e, i) => (
              <li key={i}>
                <code style={{ fontSize: 11, background: 'var(--color-surface-secondary)', padding: '1px 4px', borderRadius: 3 }}>
                  {e.source_ref}
                </code>
                {e.title && e.title !== e.source_ref && (
                  <span style={{ marginLeft: 4 }}>{e.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasSkills && (
        <div>
          <span style={{ fontWeight: 600 }}>执行的 Skill：</span>
          {msg.skillNames!.join('、')}
        </div>
      )}
    </div>
  )
}

function AssistantBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 20 }}>
      <div
        style={{
          maxWidth: '85%',
          background: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-primary)',
          lineHeight: 1.7,
          wordBreak: 'break-word',
        }}
      >
        {msg.content
          ? <ReactMarkdown>{msg.content}</ReactMarkdown>
          : <span style={{ color: 'var(--color-text-secondary)' }}>▍</span>
        }
        <MetaFooter msg={msg} />
      </div>
    </div>
  )
}

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const setPendingQuery = useChatStore((s) => s.setPendingQuery)

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          有什么我能帮你的吗？
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 480 }}>
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => setPendingQuery(q)}
              style={{
                padding: '12px 18px',
                background: 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-body)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-border)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface-secondary)')}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 8px' }}>
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <UserBubble key={msg.id} msg={msg} />
        ) : (
          <AssistantBubble key={msg.id} msg={msg} />
        )
      )}
    </div>
  )
}
