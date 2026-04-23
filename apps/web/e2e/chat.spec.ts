import { test, expect } from '@playwright/test'
import { setAdminToken } from './fixtures'

// ── helpers ────────────────────────────────────────────────────

async function goHomeWithToken(page: import('@playwright/test').Page) {
  await page.goto('/')
  await setAdminToken(page)
  await page.reload()
  await expect(page.getByText('Find Unified')).toBeVisible()
}

async function sendAndWaitForReply(page: import('@playwright/test').Page, query: string) {
  const textarea = page.locator('textarea')
  await textarea.fill(query)
  await page.getByRole('button', { name: '发送' }).click()

  // user message appears immediately (optimistic)
  await expect(page.getByText(query).first()).toBeVisible()

  // wait for loading spinner to disappear (search completed)
  await expect(page.getByText('检索中')).not.toBeVisible({ timeout: 20000 })
}

// ── tests ──────────────────────────────────────────────────────

test.describe('问答主流程', () => {
  test('发起问答 — user 消息与 assistant 消息均出现', async ({ page }) => {
    await goHomeWithToken(page)

    await page.locator('textarea').fill('什么是知识检索')
    await page.getByRole('button', { name: '发送' }).click()

    // user message appears immediately
    await expect(page.getByText('什么是知识检索').first()).toBeVisible()

    // wait for the "检索中" spinner to disappear (loading ended)
    await expect(page.getByText('检索中')).not.toBeVisible({ timeout: 20000 })

    // at least one assistant bubble should exist
    const assistantBubbles = page.locator('[style*="surface-secondary"]')
    await expect(assistantBubbles.first()).toBeVisible({ timeout: 5000 })
  })

  test('历史检索 — 搜索框输入关键词后 Sidebar 中出现对应会话', async ({ page }) => {
    // Use a unique title so we can reliably find it
    const uniqueTitle = `历史检索测试-${Date.now()}`
    await goHomeWithToken(page)

    await sendAndWaitForReply(page, uniqueTitle)

    // Wait a moment for invalidateQueries + refetch to settle
    await page.waitForTimeout(1000)

    // Type first 6 chars in search box to trigger filtered query
    const searchInput = page.locator('input[placeholder="搜索历史"]')
    await searchInput.fill(uniqueTitle.slice(0, 6))

    // Wait for debounce (300ms) + API round-trip
    await page.waitForTimeout(800)

    // The conversation should appear in the sidebar
    await expect(
      page.locator('.conv-item').filter({ hasText: uniqueTitle.slice(0, 6) }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('软删除 — 确认删除后会话从 Sidebar 消失', async ({ page }) => {
    const uniqueTitle = `软删除测试-${Date.now()}`
    await goHomeWithToken(page)

    await sendAndWaitForReply(page, uniqueTitle)

    // Wait for sidebar to refresh with the new conversation
    await page.waitForTimeout(1000)

    // Find the specific conv-item by its full unique title
    const convItem = page.locator('.conv-item').filter({ hasText: uniqueTitle })
    await expect(convItem).toBeVisible({ timeout: 8000 })

    // hover to reveal delete button
    await convItem.hover()
    await convItem.locator('.delete-btn').click()

    // AlertDialog appears
    await expect(page.getByRole('heading', { name: '确认删除' })).toBeVisible()

    // Confirm delete
    await page.getByRole('button', { name: '确认删除' }).click()

    // The item should disappear: wait up to 8s for optimistic update + refetch
    await expect(convItem).not.toBeVisible({ timeout: 8000 })
  })
})
