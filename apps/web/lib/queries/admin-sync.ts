import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface SyncJob {
  id: string
  jobType: string
  status: string
  payloadJson: string
  resultJson: string | null
  createdAt: string
  finishedAt: string | null
}

export interface SyncJobsResponse {
  data: SyncJob[]
  total: number
  page: number
  size: number
}

export interface UploadedFilesResponse {
  files: string[]
}

export function useSyncJobs(polling: boolean) {
  return useQuery<SyncJobsResponse>({
    queryKey: ['admin', 'sync', 'jobs'],
    queryFn: () => apiFetch('/api/admin/sync/jobs') as Promise<SyncJobsResponse>,
    refetchInterval: polling ? 3000 : false,
  })
}

export function useUploadedFiles() {
  return useQuery<UploadedFilesResponse>({
    queryKey: ['admin', 'ingest', 'files'],
    queryFn: () => apiFetch('/api/ingest/http/files') as Promise<UploadedFilesResponse>,
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filename: string) =>
      apiFetch(`/api/ingest/http/files/${filename}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })
}

export function useCreateDir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dirname: string) =>
      apiFetch('/api/ingest/http/dirs', { method: 'POST', body: JSON.stringify({ dirname }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })
}

export function useDeleteDir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dirname: string) =>
      apiFetch(`/api/ingest/http/dirs/${dirname}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })
}

export function useMoveFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      apiFetch('/api/ingest/http/move', {
        method: 'PUT',
        body: JSON.stringify({ from, to }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] }),
  })
}

export function useFileContent(filename: string | null) {
  return useQuery<{ content: string }>({
    queryKey: ['admin', 'ingest', 'content', filename],
    queryFn: () => apiFetch(`/api/ingest/http/content/${filename}`) as Promise<{ content: string }>,
    enabled: !!filename,
  })
}

export function useUpdateFileContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ filename, content, newFilename }: { filename: string; content: string; newFilename?: string }) =>
      apiFetch(`/api/ingest/http/content/${filename}`, {
        method: 'PUT',
        body: JSON.stringify({ content, ...(newFilename ? { newFilename } : {}) }),
      }) as Promise<{ ok: boolean; filename?: string }>,
    onSuccess: (_data, { filename }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'files'] })
      qc.invalidateQueries({ queryKey: ['admin', 'ingest', 'content', filename] })
    },
  })
}
