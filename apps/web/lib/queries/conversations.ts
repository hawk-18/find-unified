import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface Conversation {
  id: string
  title: string
  ownerUserId: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConversationsResponse {
  data: Conversation[]
  total: number
  page: number
  size: number
}

export interface ConversationsParams {
  keyword?: string
  page?: number
  size?: number
}

export function useConversations(params?: ConversationsParams) {
  const qs = new URLSearchParams()
  if (params?.keyword) qs.set('keyword', params.keyword)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.size) qs.set('size', String(params.size))
  const query = qs.toString()

  return useQuery<ConversationsResponse>({
    queryKey: ['conversations', params],
    queryFn: () => apiFetch(`/api/conversations${query ? `?${query}` : ''}`) as Promise<ConversationsResponse>,
  })
}

export function useConversation(id: string) {
  return useQuery<Conversation>({
    queryKey: ['conversation', id],
    queryFn: () => apiFetch(`/api/conversations/${id}`) as Promise<Conversation>,
    enabled: Boolean(id),
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title?: string) =>
      apiFetch('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }) as Promise<Conversation>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
