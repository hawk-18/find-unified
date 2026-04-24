import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface SourceConfigRaw {
  id: string
  sourceType: string
  enabled: boolean
  updatedAt: string
  config: Record<string, unknown>
}

export function useMcpConfig() {
  return useQuery<SourceConfigRaw>({
    queryKey: ['admin', 'sources', 'mcp'],
    queryFn: () => apiFetch('/api/admin/sources/mcp') as Promise<SourceConfigRaw>,
  })
}

export function useSqliteConfig() {
  return useQuery<SourceConfigRaw>({
    queryKey: ['admin', 'sources', 'sqlite'],
    queryFn: () => apiFetch('/api/admin/sources/sqlite') as Promise<SourceConfigRaw>,
  })
}

export interface McpUpdateBody {
  endpoint: string
  timeout_ms: number
  enabled: boolean
}

export interface McpEntry {
  name: string
  endpoint: string
  timeout_ms: number
  enabled: boolean
}

export function useUpdateMcp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: McpUpdateBody) =>
      apiFetch('/api/admin/sources/mcp', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sources', 'mcp'] }),
  })
}

export function useMcpList() {
  return useQuery<{ list: McpEntry[] }>({
    queryKey: ['admin', 'sources', 'mcp', 'list'],
    queryFn: () => apiFetch('/api/admin/sources/mcp/list') as Promise<{ list: McpEntry[] }>,
  })
}

export function useUpdateMcpList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (list: McpEntry[]) =>
      apiFetch('/api/admin/sources/mcp/list', {
        method: 'PUT',
        body: JSON.stringify({ list }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sources', 'mcp', 'list'] }),
  })
}

export interface SqliteUpdateBody {
  url: string
  enabled: boolean
}

export interface SqliteEntry {
  name: string
  url: string
  enabled: boolean
}

export function useUpdateSqlite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SqliteUpdateBody) =>
      apiFetch('/api/admin/sources/sqlite', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sources', 'sqlite'] }),
  })
}

export function useSqliteList() {
  return useQuery<{ list: SqliteEntry[] }>({
    queryKey: ['admin', 'sources', 'sqlite', 'list'],
    queryFn: () => apiFetch('/api/admin/sources/sqlite/list') as Promise<{ list: SqliteEntry[] }>,
  })
}

export function useUpdateSqliteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (list: SqliteEntry[]) =>
      apiFetch('/api/admin/sources/sqlite/list', {
        method: 'PUT',
        body: JSON.stringify({ list }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sources', 'sqlite', 'list'] }),
  })
}

// ── Local roots ───────────────────────────────────────────────────────────────

export interface LocalConfig {
  roots: string[]
}

export function useLocalConfig() {
  return useQuery<LocalConfig>({
    queryKey: ['admin', 'sync', 'local-config'],
    queryFn: () => apiFetch('/api/admin/sync/local/config') as Promise<LocalConfig>,
  })
}

export function useUpdateLocalConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LocalConfig) =>
      apiFetch('/api/admin/sync/local/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sync', 'local-config'] }),
  })
}
