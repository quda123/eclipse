# Eclipse

Русскоязычная платформа индивидуального преподавателя математики: задания, автоматические попытки, фото-решения, расписание, внутренние уведомления и аналитика учеников.

## Стек

React 19, Vite, TypeScript strict, Supabase Auth/PostgreSQL/Storage/Edge Functions, React Router, Zod, FullCalendar, Recharts, GSAP, react-easy-crop, HEIC conversion, Vitest и Playwright.

## Быстрый запуск интерфейса

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

В development доступны кнопки «Демо преподавателя» и «Демо ученика». Они удаляются из production-сборки; production-аутентификация использует только Supabase.

## Локальный Supabase

Нужен запущенный Docker Desktop. Supabase CLI уже включён в devDependencies.

```powershell
pnpm supabase:start
pnpm supabase:reset
pnpm exec supabase test db
```

Скопируйте URL и anon key из вывода `supabase status` в `.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=...
```

Локальные учётные записи из `supabase/seed.sql`:

- преподаватель: `teacher`;
- ученики: `anna`, `maxim`;
- пароль только для локальной разработки: `Eclipse-demo-2026`.

Скрытый email формируется как `<логин>@users.eclipse.local` и никогда не показывается пользователю. Не используйте локальный пароль в production.

## Структура Supabase

Миграции находятся в `supabase/migrations` и создают:

- организации, роли, профили и связи преподаватель-ученик;
- версии заданий, вопросы, принимаемые ответы, назначения, расширения дедлайна;
- черновики с автосохранением, атомарные идемпотентные попытки и результаты;
- занятия и серии, приватные заметки, фото-решения и ручные баллы;
- уведомления с dedupe key и аудит критичных действий;
- приватные buckets `homework-originals`, `homework-processed`, `homework-thumbnails`;
- RLS для учеников, связанных преподавателей и владельцев организации.

Edge Functions:

- `create-student` — создание Auth-пользователя с временным паролем;
- `manage-student` — сброс пароля, архивирование, восстановление и обновление профиля ученика.

Service-role key используется только внутри Edge Functions и не входит в клиентский bundle.

## Проверки

```powershell
pnpm lint
pnpm test
pnpm build
pnpm dev
pnpm test:e2e
```

Playwright проверяет desktop и mobile: лендинг → вход → кабинет, role guard, восстановление ответов после reload, завершение теста и отсутствие горизонтального переполнения. В CI после запуска локального Supabase дополнительно выполняется `authenticated.e2e.spec.ts`: настоящий вход преподавателя и ученика, завершение сессии и запрет доступа к данным другого tenant/ученика.

SQL-набор `supabase/tests/rls.sql` запускается на локальном Supabase и проверяет межпользовательскую, межтенантную и Storage-изоляцию. Тот же набор запускается отдельной CI-задачей после применения всех миграций и seed.

## Развёртывание

1. Создайте Supabase-проект в аккаунте владельца.
2. Выполните `supabase login`, затем `supabase link --project-ref <ref>`.
3. Примените схему: `supabase db push`.
4. Разверните функции:

```powershell
supabase functions deploy create-student
supabase functions deploy manage-student
```

Задайте секрет разрешённого origin для обеих функций:

```powershell
supabase secrets set ALLOWED_ORIGIN=https://eclipse-math.netlify.app
```

5. В настройках Supabase Auth отключите public signup и задайте Site URL production-домена.
6. Добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` в Netlify. Build command: `pnpm build`, publish directory: `dist`. SPA-маршруты настроены в `netlify.toml`.
7. Создайте первого owner/teacher через защищённую административную процедуру или одноразовый SQL в Dashboard; production seed не запускайте.

## Scheduled jobs

Создайте Supabase Cron jobs для:

- дедлайнов «сегодня/завтра» и начала уроков;
- очистки незавершённых draft uploads старше 7 дней;
- дедуплицированных уведомлений по ключу `(user_id, dedupe_key)`.

Jobs должны вызывать SQL-функции или Edge Function с серверным секретом, а не создаваться при открытии страницы.

## Безопасность и резервные копии

- Проверяйте RLS через двух учеников и второго преподавателя до production-релиза.
- В Supabase включите ежедневные backups; для production-плана — Point-in-Time Recovery.
- Храните миграции в Git и регулярно проверяйте восстановление базы в отдельном проекте.
- Для Storage используйте только private buckets и короткоживущие signed URLs.
- Не логируйте пароли, JWT, service-role key и содержимое личных заметок.
- Архивируйте образовательные записи; hard delete разрешайте только owner с явным подтверждением.

## Ограничения MVP

- Нет платежей, публичной регистрации, сообщений, AI/OCR, email/SMS/push и встроенных видеозвонков — это намеренно исключено планом.
- HEIC конвертируется в браузере для просмотра, оригинал предназначен для отдельного приватного upload.
- Для запуска полной backend-интеграции нужен Supabase-проект или Docker Desktop.
- Напоминания по дедлайнам и урокам требуют отдельно включённых Supabase Cron jobs; SQL-расписание зависит от выбранного production-плана.
- Перед production-релизом необходимо выполнить локальные multi-user RLS/Storage integration tests на Docker Supabase и smoke-проверку Edge Functions с production origin.
