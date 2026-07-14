import { expect, test } from "@playwright/test";

test.skip(
  !process.env.ECLIPSE_BACKEND_E2E,
  "Requires a seeded local Supabase instance",
);

async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill("Eclipse-demo-2026");
  await page.getByRole("button", { name: "Продолжить" }).click();
}

test("real teacher session is invalidated on logout and cannot read another tenant student", async ({
  page,
}) => {
  await login(page, "teacher");
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(
    page.getByRole("heading", { name: /Добрый день, Мария/ }),
  ).toBeVisible();

  await page.goto("/teacher/students/20000000-0000-0000-0000-000000000003");
  await expect(page.getByText("Ученик не найден.")).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
});

test("student A cannot open student B assignment URL", async ({ page }) => {
  await login(page, "anna");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/student/homework/53000000-0000-0000-0000-000000000003");
  await expect(page.getByText("Не удалось открыть задание.")).toBeVisible();
});
