'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useChatStore } from '@/lib/store/chat'
import { useCreateConversation } from '@/lib/queries/conversations'
import { getToken } from '@/lib/api-client'

const BASE_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3001'

// 打字机速度：每个字符间隔 ms
const TYPEWRITER_INTERVAL = 18

export function InputBar() {
  const [text, setText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const createConversation = useCreateConversation()
  const { conversationId, setConversationId, addMessage, appendToMessage, updateMessageMeta, setSourceStatus, cli, pendingQuery, setPendingQuery } = useChatStore()

  // 消费 pendingQuery（来自建议问题点击）
  useEffect(() => {
    if (pendingQuery) {
      setText(pendingQuery)
      setPendingQuery('')
      textareaRef.current?.focus()
    }
  }, [pendingQuery, setPendingQuery])

  // 打字机队列：把待渲染字符缓冲，逐个定时写入
  const typeQueueRef = useRef<string>('')
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushTypeQueue = useCallback((msgId: string) => {
    if (typeTimerRef.current) return // 已在运行
    const tick = () => {
      if (typeQueueRef.current.length === 0) {
        typeTimerRef.current = null
        return
      }
      // 每帧取一个字符（中文/emoji 算一个）
      const char = typeQueueRef.current.slice(0, 1)
      typeQueueRef.current = typeQueueRef.current.slice(1)
      appendToMessage(msgId, char)
      typeTimerRef.current = setTimeout(tick, TYPEWRITER_INTERVAL)
    }
    typeTimerRef.current = setTimeout(tick, TYPEWRITER_INTERVAL)
  }, [appendToMessage])

  const enqueueText = useCallback((msgId: string, chunk: string) => {
    typeQueueRef.current += chunk
    flushTypeQueue(msgId)
  }, [flushTypeQueue])

  // 等待打字机队列清空后再执行 callback
  const waitTypewriterDone = useCallback((cb: () => void) => {
    const check = () => {
      if (typeQueueRef.current.length === 0 && !typeTimerRef.current) {
        cb()
      } else {
        setTimeout(check, 30)
      }
    }
    check()
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  const handleSubmit = useCallback(async () => {
    const q = text.trim()
    if (!q || isStreaming) return

    // 重置打字机状态
    typeQueueRef.current = ''
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current)
      typeTimerRef.current = null
    }

    let convId = conversationId
    if (!convId) {
      const conv = await createConversation.mutateAsync(q.slice(0, 60))
      convId = conv.id
      setConversationId(convId)
    }

    addMessage({ id: `u-${Date.now()}`, role: 'user', content: q })
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const msgId = `a-${Date.now()}`
    addMessage({ id: msgId, role: 'assistant', content: '' })
    setIsStreaming(true)

    try {
      const token = getToken()
      const res = await fetch(`${BASE_URL}/find/search/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: q,
          sources: ['local', 'mcp', 'db'],
          user_context: { conversation_id: convId, platform: cli },
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let event = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (event === 'chunk') {
              enqueueText(msgId, data.text)
            } else if (event === 'done') {
              // 等打字机输完再写 meta，避免闪烁
              waitTypewriterDone(() => {
                if (data.source_status) setSourceStatus(data.source_status)
                updateMessageMeta(msgId, {
                  evidence: data.evidence ?? [],
                  skillNames: data.skill_names ?? [],
                })
              })
            } else if (event === 'error') {
              enqueueText(msgId, '\n请求失败，请稍后重试。')
            }
            event = ''
          }
        }
      }
    } catch {
      appendToMessage(msgId, '请求失败，请稍后重试。')
    } finally {
      setIsStreaming(false)
    }
  }, [text, isStreaming, conversationId, createConversation, setConversationId, addMessage, appendToMessage, enqueueText, waitTypewriterDone, updateMessageMeta, setSourceStatus, cli])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isLoading = isStreaming || createConversation.isPending

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        padding: '12px 16px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => { setText(e.target.value); autoResize() }}
        onKeyDown={handleKeyDown}
        placeholder="输入问题，Enter 发送，Shift+Enter 换行"
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 12px',
          fontSize: 'var(--text-body)',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          lineHeight: 1.5,
          overflowY: 'auto',
          maxHeight: 200,
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading || !text.trim()}
        style={{
          background: isLoading || !text.trim() ? '#f2a0b0' : 'var(--color-brand)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 20px',
          fontSize: 'var(--text-body)',
          fontWeight: 500,
          cursor: isLoading || !text.trim() ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
        }}
      >
        {isLoading ? (
          <>
            <Spinner />
            检索中
          </>
        ) : (
          '发送'
        )}
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  )
}
