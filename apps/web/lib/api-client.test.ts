import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import React from 'react'
import { useConversations } from './queries/conversations'

const mockData = { data: [], total: 0, page: 1, size: 20 }

const server = setupServer(
  http.get('http://localhost:3001/api/conversations', () => {
    return HttpResponse.json(mockData)
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useConversations', () => {
  it('returns mock data from GET /api/conversations', async () => {
    const { result } = renderHook(() => useConversations(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockData)
    expect(result.current.data?.data).toEqual([])
    expect(result.current.data?.total).toBe(0)
  })
})
