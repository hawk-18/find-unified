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
          borderRadius: '18px 18px 4px 18px',
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
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 20, gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--color-brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 4,
        }}
      >
        F
      </div>
      <div
        style={{
          maxWidth: '80%',
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '4px 18px 18px 18px',
          padding: '12px 16px',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-primary)',
          lineHeight: 1.7,
          wordBreak: 'break-word',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
          gap: 28,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--color-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
              margin: '0 auto 16px',
            }}
          >
            F
          </div>
          <h2
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: '0 0 8px',
            }}
          >
            有什么我能帮你的吗？
          </h2>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', margin: 0 }}>
            试试下面的问题，或直接输入你的问题
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 480 }}>
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => setPendingQuery(q)}
              style={{
                padding: '12px 18px',
                background: '#fff',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                fontSize: 'var(--text-body)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-brand)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(255,56,92,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <span style={{ color: 'var(--color-brand)', flexShrink: 0, fontSize: 16 }}>→</span>
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
