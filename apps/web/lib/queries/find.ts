import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface Evidence {
  source_type: string
  title: string
  snippet: string
  score: number
  source_ref: string
}

export interface SourceStatus {
  source: string
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
}

export interface SearchRequest {
  query: string
  sources?: string[]
  user_context?: {
    conversation_id?: string
    platform?: string
  }
}

export interface SearchResponse {
  answer: string
  highlights?: string[]
  evidence: Evidence[]
  source_status: SourceStatus[]
  trace_id: string
  system_prompt?: string
}

export function useSearch() {
  return useMutation({
    mutationFn: (req: SearchRequest) =>
      apiFetch('/find/search', {
        method: 'POST',
        body: JSON.stringify(req),
      }) as Promise<SearchResponse>,
  })
}
