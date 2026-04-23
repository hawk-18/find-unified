'use client'

import { create } from 'zustand'
import type { Evidence, SourceStatus } from '@/lib/queries/find'
import type { CliValue } from '@/lib/queries/cli'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  query?: string
  highlights?: string[]
  traceId?: string
  evidence?: Evidence[]
  skillNames?: string[]
}

interface ChatStore {
  // active conversation
  conversationId: string | null
  messages: ChatMessage[]
  sourceStatus: SourceStatus[]
  // user cli preference
  cli: CliValue
  // pending query from suggestion click
  pendingQuery: string

  setConversationId: (id: string | null) => void
  addMessage: (msg: ChatMessage) => void
  appendToMessage: (id: string, text: string) => void
  updateMessageMeta: (id: string, meta: Partial<Pick<ChatMessage, 'evidence' | 'skillNames'>>) => void
  setSourceStatus: (status: SourceStatus[]) => void
  clearMessages: () => void
  setCli: (cli: CliValue) => void
  setPendingQuery: (q: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversationId: null,
  messages: [],
  sourceStatus: [],
  cli: 'claude_code',
  pendingQuery: '',

  setConversationId: (id) => set({ conversationId: id, messages: [] }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m
      ),
    })),
  updateMessageMeta: (id, meta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...meta } : m
      ),
    })),
  setSourceStatus: (status) => set({ sourceStatus: status }),
  clearMessages: () => set({ messages: [] }),
  setCli: (cli) => set({ cli }),
  setPendingQuery: (q) => set({ pendingQuery: q }),
}))
