import type { Page } from '@playwright/test'

export const MOCK_ADMIN_TOKEN = 'mock-admin-token-find-unified'
export const MOCK_DEV_TOKEN = 'mock-dev-token-find-unified'

export async function setAdminToken(page: Page) {
  await page.evaluate((token) => {
    localStorage.setItem('find_unified_token', token)
  }, MOCK_ADMIN_TOKEN)
}

export async function setDevToken(page: Page) {
  await page.evaluate((token) => {
    localStorage.setItem('find_unified_token', token)
  }, MOCK_DEV_TOKEN)
}
