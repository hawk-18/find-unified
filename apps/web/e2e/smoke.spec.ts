import { test, expect } from '@playwright/test'
import { setAdminToken } from './fixtures'

test('homepage loads', async ({ page }) => {
  // Navigate first to set localStorage, then reload
  await page.goto('/')
  await setAdminToken(page)
  await page.reload()

  // The Sidebar renders "Find Unified" as the app title
  await expect(page.getByText('Find Unified')).toBeVisible()
})
