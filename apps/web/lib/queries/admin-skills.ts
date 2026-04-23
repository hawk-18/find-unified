import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface Skill {
  filename: string
  name: string
  description: string
  stage: string
  enabled: boolean
  content: string
  body: string
}

export interface CreateSkillBody {
  name: string
  description?: string
  stage: 'pre_search' | 'post_search' | 'post_answer'
  enabled?: boolean
  body?: string
}

export interface UpdateSkillBody {
  description?: string
  stage?: 'pre_search' | 'post_search' | 'post_answer'
  enabled?: boolean
  body?: string
}

export function useSkills() {
  return useQuery<Skill[]>({
    queryKey: ['admin', 'skills'],
    queryFn: () => apiFetch('/api/admin/skills') as Promise<Skill[]>,
  })
}

export function useCreateSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSkillBody) =>
      apiFetch('/api/admin/skills', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'skills'] }),
  })
}

export function useUpdateSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ filename, body }: { filename: string; body: UpdateSkillBody }) =>
      apiFetch(`/api/admin/skills/${filename}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'skills'] }),
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filename: string) =>
      apiFetch(`/api/admin/skills/${filename}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'skills'] }),
  })
}
