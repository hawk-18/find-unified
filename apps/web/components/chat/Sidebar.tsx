'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Root as AlertDialogRoot,
  Trigger as AlertDialogTrigger,
  Portal as AlertDialogPortal,
  Overlay as AlertDialogOverlay,
  Content as AlertDialogContent,
  Title as AlertDialogTitle,
  Description as AlertDialogDescription,
  Action as AlertDialogAction,
  Cancel as AlertDialogCancel,
} from '@radix-ui/react-alert-dialog'
import { isToday, isThisWeek } from 'date-fns'
import { useConversations, useDeleteConversation, type Conversation } from '@/lib/queries/conversations'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore, type ChatMessage } from '@/lib/store/chat'
import { apiFetch } from '@/lib/api-client'
import { Toast, type ToastItem } from '@/components/Toast'

// ── debounce hook ──────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── time group ─────────────────────────────────────────────────
function getGroup(dateStr: string): '今天' | '本周' | '更早' {
  const d = new Date(dateStr)
  if (isToday(d)) return '今天'
  if (isThisWeek(d, { weekStartsOn: 1 })) return '本周'
  return '更早'
}

function groupConversations(conversations: Conversation[]) {
  const groups: Record<string, Conversation[]> = { 今天: [], 本周: [], 更早: [] }
  for (const c of conversations) {
    groups[getGroup(c.updatedAt)].push(c)
  }
  return groups
}

// ── delete dialog ──────────────────────────────────────────────
function DeleteDialog({
  conv,
  onConfirm,
}: {
  conv: Conversation
  onConfirm: () => void
}) {
  return (
    <AlertDialogRoot>
      <AlertDialogTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            color: 'var(--color-brand)',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 13,
            borderRadius: 'var(--radius-xs)',
            opacity: 0,
          }}
          className="delete-btn"
          title="删除"
        >
          ✕
        </button>
      </AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
          }}
        />
        <AlertDialogContent
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            padding: '28px 32px',
            width: 360,
            zIndex: 1001,
          }}
        >
          <AlertDialogTitle
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 8,
            }}
          >
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{
              fontSize: 'var(--text-body)',
              color: 'var(--color-text-secondary)',
              marginBottom: 24,
            }}
          >
            删除「{conv.title || '无标题会话'}」后无法恢复，确认删除？
          </AlertDialogDescription>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <AlertDialogCancel asChild>
              <button
                style={{
                  background: 'var(--color-surface-secondary)',
                  color: 'var(--color-text-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 18px',
                  fontSize: 'var(--text-body)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                取消
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={onConfirm}
                style={{
                  background: 'var(--color-brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 18px',
                  fontSize: 'var(--text-body)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                确认删除
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  )
}

// ── main Sidebar ───────────────────────────────────────────────
export function Sidebar() {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 300)
  const [toast, setToast] = useState<ToastItem | null>(null)
  const toastIdRef = useRef(0)

  const { data } = useConversations(debouncedKeyword ? { keyword: debouncedKeyword } : undefined)
  const deleteConv = useDeleteConversation()
  const queryClient = useQueryClient()
  const { conversationId, setConversationId, addMessage } = useChatStore()

  const conversations = data?.data ?? []
  const groups = groupConversations(conversations)

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'error') => {
    setToast({ id: String(++toastIdRef.current), message, type })
  }, [])

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setConversationId(conv.id)
    try {
      const detail = await apiFetch(`/api/conversations/${conv.id}`) as {
        messages: Array<{
          id: string
          role: 'user' | 'assistant'
          content: string
          traceId: string | null
          evidence: Array<{ sourceType: string; title: string; snippet: string; score: number; sourceRef: string }>
        }>
      }
      for (const msg of detail.messages) {
        addMessage({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          traceId: msg.traceId ?? undefined,
          evidence: msg.evidence?.map((e) => ({
            source_type: e.sourceType,
            title: e.title,
            snippet: e.snippet,
            score: e.score,
            source_ref: e.sourceRef,
          })),
        } satisfies ChatMessage)
      }
    } catch {
      showToast('加载会话历史失败')
    }
  }, [setConversationId, addMessage, showToast])

  const handleDelete = useCallback(
    (conv: Conversation) => {
      // optimistic: remove from cache immediately
      queryClient.setQueryData<typeof data>(
        ['conversations', debouncedKeyword ? { keyword: debouncedKeyword } : undefined],
        (old) => {
          if (!old) return old
          return { ...old, data: old.data.filter((c) => c.id !== conv.id), total: old.total - 1 }
        }
      )
      if (conv.id === conversationId) setConversationId(null)

      deleteConv.mutate(conv.id, {
        onError: () => {
          // revert
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
          showToast('删除失败，请重试')
        },
      })
    },
    [deleteConv, queryClient, debouncedKeyword, conversationId, setConversationId, showToast]
  )

  const groupOrder = ['今天', '本周', '更早'] as const

  return (
    <>
      <style>{`
        .conv-item:hover .delete-btn { opacity: 1 !important; }
      `}</style>

      <div
        style={{
          width: 260,
          flexShrink: 0,
          background: '#fafafa',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {/* header */}
        <div style={{ padding: '16px 12px 10px', borderBottom: '1px solid var(--color-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--color-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              F
            </span>
            <span
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              Find Unified
            </span>
          </div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索历史"
            style={{
              width: '100%',
              height: 34,
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '0 10px',
              fontSize: 'var(--text-body)',
              color: 'var(--color-text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#fff',
            }}
          />
        </div>

        {/* new conversation button */}
        <div style={{ padding: '8px 12px' }}>
          <button
            onClick={() => setConversationId(null)}
            style={{
              width: '100%',
              background: 'var(--color-brand)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 0',
              fontSize: 'var(--text-body)',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建会话
          </button>
        </div>

        {/* conversation list grouped */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 16px' }}>
          {conversations.length === 0 && (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                marginTop: 24,
              }}
            >
              {debouncedKeyword ? '无匹配会话' : '暂无会话'}
            </p>
          )}

          {groupOrder.map((groupName) => {
            const items = groups[groupName]
            if (items.length === 0) return null
            return (
              <div key={groupName}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    padding: '10px 16px 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {groupName}
                </div>
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    className="conv-item"
                    onClick={() => handleSelectConversation(conv)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '7px 10px',
                      cursor: 'pointer',
                      borderRadius: 8,
                      margin: '0 6px',
                      background:
                        conv.id === conversationId ? '#fff' : 'transparent',
                      boxShadow:
                        conv.id === conversationId ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: conv.id === conversationId ? 600 : 400,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conv.title || '无标题会话'}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-text-secondary)',
                          marginTop: 1,
                        }}
                      >
                        {new Date(conv.updatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <DeleteDialog conv={conv} onConfirm={() => handleDelete(conv)} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {toast && (
        <Toast key={toast.id} item={toast} onDone={() => setToast(null)} />
      )}
    </>
  )
}
