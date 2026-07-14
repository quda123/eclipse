import { expect, test } from '@playwright/test'

test('лендинг сохраняет cinematic video и доступную навигацию', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Eclipse/)
  await expect(page.locator('video')).toHaveCount(2)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Войти в Eclipse/i })).toBeVisible()
})

test('development demo student survives reload without exposing teacher UI', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /Демо ученика/i }).click()
  await expect(page).toHaveURL(/\/student$/)
  await expect(page.getByText('Пространство ученика')).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/student$/)
  await page.goto('/teacher')
  await expect(page).toHaveURL(/\/login$/)
})

test('mobile pages do not overflow horizontally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile')
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
