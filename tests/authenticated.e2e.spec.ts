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
  await page.waitForTimeout(500);
  if (new URL(page.url()).pathname === "/login") {
    const message = await page
      .getByRole("alert")
      .textContent()
      .catch(() => "форма не показала ошибку");
    throw new Error(`Вход ${username} не выполнен: ${message}`);
  }
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

test("student sees the durable combined result", async ({ page }) => {
  await login(page, "anna");
  await page.goto(
    "/student/homework/53000000-0000-0000-0000-000000000004/result",
  );
  await expect(page.getByText("Автоматическая часть:")).toContainText("1 из 1");
  await expect(page.getByText("Письменная часть:")).toContainText("2 из 4");
  await expect(page.getByText(/Итог: 3 из 5/)).toBeVisible();
});

test("calendar loads lessons beyond fourteen days", async ({ page }) => {
  await login(page, "anna");
  await page.goto("/student/calendar");
  const next = page.getByRole("button", { name: "next" });
  await next.click();
  await next.click();
  await next.click();
  await expect(page.getByText("Анна Волкова")).toBeVisible();
});
