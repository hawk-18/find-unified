export const MOCK_ADMIN_TOKEN = 'mock-admin-token-find-unified'
export const MOCK_DEV_TOKEN = 'mock-dev-token-find-unified'

export function getToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('find_unified_token') ?? MOCK_ADMIN_TOKEN
  }
  return MOCK_ADMIN_TOKEN
}

const BASE_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3001'

export async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  const hasBody = options?.body != null
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${getToken()}`,
      ...(options?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      message = body.error ?? body.message ?? message
    } catch {
      // ignore parse error
    }
    throw { status: res.status, message }
  }

  if (res.status === 204) return null
  return res.json()
}
