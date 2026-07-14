import { expect, test } from "@playwright/test";

test.skip(
  !process.env.ECLIPSE_BACKEND_E2E,
  "Requires a seeded local Supabase instance",
);

async function login(page: import("@playwright/test").Page, username: string) {
  return loginWithPassword(page, username, "Eclipse-demo-2026");
}

async function loginWithPassword(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
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

test("teacher creates a student who changes the temporary password", async ({
  page,
}) => {
  await login(page, "teacher");
  await page.goto("/teacher/students");
  await page.getByRole("button", { name: "Добавить ученика" }).click();
  await page.getByLabel("Имя").fill("Елена");
  await page.getByLabel("Фамилия").fill("Тестова");
  await page.getByLabel("Логин").fill("e2e.student");
  const temporaryPassword = await page.getByLabel("Временный пароль").inputValue();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Елена Тестова")).toBeVisible();

  await loginWithPassword(page, "e2e.student", temporaryPassword);
  await expect(page).toHaveURL(/\/change-password$/);
  const nextPassword = "New-Eclipse-2026!";
  await page.getByLabel("Новый пароль").fill(nextPassword);
  await page.getByLabel("Повторите пароль").fill(nextPassword);
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole("button", { name: "Выйти" }).click();

  await page.goto("/login");
  await page.getByLabel("Логин").fill("e2e.student");
  await page.getByLabel("Пароль").fill(temporaryPassword);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("alert")).toContainText("Неверный логин или пароль");
  await loginWithPassword(page, "e2e.student", nextPassword);
  await expect(page).toHaveURL(/\/student$/);
});

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

test("teacher publishes combined homework and student reaches the written part", async ({
  page,
}) => {
  await login(page, "teacher");
  await page.goto("/teacher/homework/new");
  await page.getByLabel("Комбинированное").check();
  await page.getByLabel("Название").fill("E2E комбинированная работа");
  const deadline = new Date(Date.now() + 2 * 86400000);
  deadline.setMinutes(deadline.getMinutes() - deadline.getTimezoneOffset());
  await page.getByLabel("Срок").fill(deadline.toISOString().slice(0, 16));
  await page.getByLabel("Условие").nth(0).fill("Сколько будет 1 + 1?");
  await page.getByRole("group", { name: "Принимаемые ответы" }).getByRole("textbox").fill("2");
  await page.getByLabel("Условие").nth(1).fill("Покажите решение первой задачи");
  await page.getByLabel("Максимальный балл").nth(0).fill("2");
  await page.getByRole("button", { name: "Добавить задачу" }).click();
  await page.getByLabel("Условие").nth(2).fill("Покажите решение второй задачи");
  await page.getByLabel("Максимальный балл").nth(1).fill("3");
  await page.getByRole("button", { name: "Добавить задачу" }).click();
  await page.getByLabel("Условие").nth(3).fill("Покажите решение третьей задачи");
  await page.getByLabel("Максимальный балл").nth(2).fill("4");
  await page.getByLabel("Анна Волкова").check();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page).toHaveURL(/\/teacher\/homework$/);

  await login(page, "anna");
  await page.goto("/student/homework");
  await page.getByRole("link", { name: /E2E комбинированная работа/ }).click();
  await page.getByLabel("Ваш ответ").fill("2");
  await page.getByRole("button", { name: "Завершить попытку" }).click();
  await page.getByRole("button", { name: /Подтвердить отправку/ }).click();
  await expect(page.getByText("Письменная часть ещё не отправлена")).toBeVisible();
  const resultUrl = page.url();
  await page.getByRole("link", { name: "Загрузить письменное решение" }).click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8AARAwMjIwgAQAQAAH/iZk2AAAAAElFTkSuQmCC",
    "base64",
  );
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "page-1.png", mimeType: "image/png", buffer: png },
    { name: "page-2.png", mimeType: "image/png", buffer: png },
    { name: "page-3.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.getByText("Страница 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Повернуть страницу" }).nth(1).click();
  await page.getByRole("button", { name: "Поднять страницу" }).nth(2).click();
  await page.getByRole("button", { name: "Обрезать страницу" }).first().click();
  await page.getByRole("button", { name: "Сохранить страницу" }).click();
  await page.getByRole("button", { name: "Отправить решение" }).click();
  await page.getByRole("button", { name: /Подтвердить отправку 3 стр/ }).click();
  await expect(page.getByRole("heading", { name: "Решение отправлено." })).toBeVisible();

  await login(page, "teacher");
  await page.goto("/teacher/review");
  await page.getByRole("link", { name: /E2E комбинированная работа/ }).click();
  await page.getByLabel("Баллы").nth(0).fill("2");
  await page.getByLabel("Баллы").nth(1).fill("1");
  await page.getByLabel("Баллы").nth(2).fill("3");
  await page.getByRole("button", { name: "Завершить проверку" }).click();
  await expect(page).toHaveURL(/\/teacher\/review$/);

  await login(page, "anna");
  await page.goto(resultUrl);
  await expect(page.getByText("Письменная часть:")).toContainText("6 из 9");
  await expect(page.getByText(/Итог: 7 из 10/)).toBeVisible();
});

test("calendar loads lessons beyond fourteen days", async ({ page }) => {
  await login(page, "anna");
  await page.goto("/student/calendar");
  const next = page.getByRole("button", { name: "next" });
  await next.click();
  await next.click();
  await next.click();
  await expect(page.getByText("Анна Волкова", { exact: true })).toBeVisible();
});
