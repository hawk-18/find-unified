import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export type CliValue = 'claude_code' | 'opencode' | 'cursor'

export const CLI_OPTIONS: { value: CliValue; label: string }[] = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'cursor', label: 'Cursor' },
]

// ── System default CLI (admin only) ──────────────────────────────────────────
export function useSystemDefaultCli() {
  return useQuery<{ defaultCli: CliValue }>({
    queryKey: ['admin', 'system', 'default-cli'],
    queryFn: () => apiFetch('/api/admin/system/default-cli') as Promise<{ defaultCli: CliValue }>,
  })
}

export function useUpdateSystemDefaultCli() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cli: CliValue) =>
      apiFetch('/api/admin/system/default-cli', { method: 'PUT', body: JSON.stringify({ cli }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'system', 'default-cli'] }),
  })
}

// ── Personal CLI preference (all roles) ──────────────────────────────────────
export function useMyCliPreference() {
  return useQuery<{ cli: CliValue }>({
    queryKey: ['me', 'preferences', 'cli'],
    queryFn: () => apiFetch('/api/me/preferences/cli') as Promise<{ cli: CliValue }>,
  })
}

export function useUpdateMyCliPreference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cli: CliValue) =>
      apiFetch('/api/me/preferences/cli', { method: 'PUT', body: JSON.stringify({ cli }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'preferences', 'cli'] }),
  })
}
