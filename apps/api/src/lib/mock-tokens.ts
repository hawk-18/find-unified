export const MOCK_ADMIN_TOKEN = 'mock-admin-token-find-unified'
export const MOCK_DEV_TOKEN = 'mock-dev-token-find-unified'

export interface MockUser {
  userId: string
  role: 'admin' | 'dev'
  name: string
}

export const MOCK_USERS: Map<string, MockUser> = new Map([
  [
    MOCK_ADMIN_TOKEN,
    { userId: 'user-admin-001', role: 'admin', name: 'Admin User' },
  ],
  [
    MOCK_DEV_TOKEN,
    { userId: 'user-dev-001', role: 'dev', name: 'Dev User' },
  ],
])
