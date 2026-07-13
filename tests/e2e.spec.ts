import { expect, test } from '@playwright/test'

test('landing, login and guarded teacher dashboard work', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Учись глубже/ })).toBeVisible()
  await page.getByRole('link', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'С возвращением.' })).toBeVisible()
  await page.getByRole('button', { name: 'Демо преподавателя' }).click()
  await expect(page.getByRole('heading', { name: 'Добрый день, Мария.' })).toBeVisible()
  await page.screenshot({ path: `output/playwright/teacher-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
})

test('student answers survive reload and result is calculated', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eclipse-demo-role', 'student'))
  await page.goto('/student/homework/functions')
  const answers = page.getByLabel('Ваш ответ')
  await answers.nth(0).fill('7')
  await answers.nth(1).fill('парабола')
  await page.reload()
  await expect(answers.nth(0)).toHaveValue('7')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Завершить попытку' }).click()
  await expect(page.getByRole('heading', { name: /100%/ })).toBeVisible()
})

test('wrong role is redirected and mobile layout does not overflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eclipse-demo-role', 'student'))
  await page.goto('/teacher')
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/student')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})

test('teacher can choose assignment modes and preview without submitting', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eclipse-demo-role', 'teacher'))
  await page.goto('/teacher/homework/new')
  await page.getByLabel('Фото-решение').check()
  await expect(page.getByRole('heading', { name: 'Фото-решение' })).toBeVisible()
  await page.getByRole('link', { name: 'Предпросмотр' }).click()
  await expect(page.getByText('Режим преподавателя: ответы и отправка отключены.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Завершить попытку' })).toHaveCount(0)
})
