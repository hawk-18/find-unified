import { test, expect } from '@playwright/test'
import { setAdminToken, setDevToken } from './fixtures'

// ── helpers ────────────────────────────────────────────────────

async function goAdminWithToken(page: import('@playwright/test').Page, path = '/admin') {
  await page.goto(path)
  await setAdminToken(page)
  await page.reload()
  // Wait for AdminNav to render
  await expect(page.getByText('Admin User')).toBeVisible({ timeout: 8000 })
}

// ── tests ──────────────────────────────────────────────────────

test.describe('后台配置', () => {
  test('git 配置保存 — 填写 repo 后保存，刷新后字段值保留', async ({ page }) => {
    await goAdminWithToken(page, '/admin/sync')

    // Expand the Git config panel
    await page.getByText('Git 仓库配置').click()
    await expect(page.locator('input[placeholder*="github.com"]')).toBeVisible()

    // Fill repo field with a unique value
    const repoUrl = `https://github.com/e2e-test/repo-${Date.now()}.git`
    const repoInput = page.locator('input[placeholder*="github.com"]')
    await repoInput.fill(repoUrl)

    // Submit the form
    await page.getByRole('button', { name: '保存配置' }).click()

    // Toast "配置已保存" appears
    await expect(page.getByText('配置已保存')).toBeVisible({ timeout: 8000 })

    // Reload and verify the value persists
    await page.reload()
    await setAdminToken(page)
    await page.reload()
    await expect(page.getByText('Admin User')).toBeVisible()

    // Expand again and check repo value
    await page.getByText('Git 仓库配置').click()
    await expect(page.locator('input[placeholder*="github.com"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="github.com"]')).toHaveValue(repoUrl)
  })

  test('触发同步 — 立即同步按钮提交后任务列表出现等待中条目', async ({ page }) => {
    await goAdminWithToken(page, '/admin/sync')

    // Ensure repo is configured (reuse from previous test or configure here)
    const { data: cfg } = await page.evaluate(async () => {
      const r = await fetch('http://localhost:3001/api/admin/sync/git/config', {
        headers: { Authorization: 'Bearer mock-admin-token-find-unified' },
      })
      return r.json()
    })

    if (!cfg?.repo) {
      // Configure repo first
      await page.getByText('Git 仓库配置').click()
      await page.locator('input[placeholder*="github.com"]').fill('https://github.com/e2e/repo.git')
      await page.getByRole('button', { name: '保存配置' }).click()
      await expect(page.getByText('配置已保存')).toBeVisible({ timeout: 8000 })
    }

    // Reload to ensure "立即同步" is enabled
    await page.reload()
    await setAdminToken(page)
    await page.reload()
    await expect(page.getByText('Admin User')).toBeVisible()

    // Click "立即同步"
    const syncBtn = page.getByRole('button', { name: '立即同步' })
    await expect(syncBtn).toBeEnabled({ timeout: 5000 })
    await syncBtn.click()

    // Toast appears
    await expect(page.getByText('同步任务已提交')).toBeVisible({ timeout: 8000 })

    // A job row with "等待中" or "运行中" appears in the list
    await expect(
      page.getByText('等待中').or(page.getByText('运行中')).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('dev 越权 — dev token 访问 /admin/sources 重定向并显示无权限', async ({ page }) => {
    // Set dev token first, then navigate
    await page.goto('/admin')
    await setDevToken(page)
    await page.reload()

    // Try to navigate to an admin-only path
    await page.goto('/admin/sources')

    // Should be redirected to /admin?error=forbidden
    await expect(page).toHaveURL(/error=forbidden/, { timeout: 8000 })
    await expect(page.getByText('无权限访问该页面')).toBeVisible({ timeout: 5000 })
  })
})
