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
