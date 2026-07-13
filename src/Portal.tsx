import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  ClipboardCheck,
  Crop,
  Home,
  ImagePlus,
  LogOut,
  Plus,
  RotateCw,
  Save,
  Settings,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  assignmentStatus,
  isAcceptedAnswer,
  scoreAttempt,
} from "./lib/homework";
import { supabase } from "./lib/supabase";
import { usernameSchema } from "./lib/schemas";
import { demoStudents, saveTeacherNote, useStudents } from "./lib/data";

const AnalyticsChart = lazy(() => import("./AnalyticsChart"));
const CalendarBoard = lazy(() => import("./CalendarBoard"));
const ImageEditor = lazy(() => import("./ImageEditor"));

async function previewUrl(file: File) {
  if (!/\.(heic|heif)$/i.test(file.name) && !/heic|heif/i.test(file.type))
    return URL.createObjectURL(file);
  const { default: convert } = await import("heic2any");
  const converted = await convert({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return URL.createObjectURL(
    Array.isArray(converted) ? converted[0] : converted,
  );
}
async function imageInfo(file: File) {
  const url = await previewUrl(file);
  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = reject;
      image.src = url;
    },
  );
  return { file, url, rotation: 0, ...dimensions };
}

export type Role = "teacher" | "student";

const teacherNav = [
  [Home, "Обзор", "/teacher"],
  [UsersRound, "Ученики", "/teacher/students"],
  [BookOpenCheck, "Задания", "/teacher/homework"],
  [ClipboardCheck, "Проверка", "/teacher/review"],
  [CalendarDays, "Календарь", "/teacher/calendar"],
  [Bell, "Уведомления", "/teacher/notifications"],
] as const;
const studentNav = [
  [Home, "Главная", "/student"],
  [BookOpenCheck, "Задания", "/student/homework"],
  [CalendarDays, "Календарь", "/student/calendar"],
  [Bell, "Уведомления", "/student/notifications"],
  [CircleUserRound, "Профиль", "/student/profile"],
] as const;

export function PortalLayout({ role }: { role: Role }) {
  const navigate = useNavigate();
  const nav = role === "teacher" ? teacherNav : studentNav;
  return (
    <div className="portal">
      <a className="skip-link" href="#main">
        К содержанию
      </a>
      <aside className="sidebar">
        <Link className="logo" to="/">
          Eclipse<sup>®</sup>
        </Link>
        <nav aria-label="Основная навигация">
          {nav.map(([Icon, label, to]) => (
            <NavLink key={to} end={to === `/${role}`} to={to}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-logout"
          onClick={() => {
            localStorage.removeItem("eclipse-demo-role");
            navigate("/login");
          }}
        >
          <LogOut size={18} /> Выйти
        </button>
      </aside>
      <div className="portal-body">
        <header className="topbar">
          <span>
            {role === "teacher"
              ? "Кабинет преподавателя"
              : "Пространство ученика"}
          </span>
          <Link to={`/${role}/notifications`} aria-label="Уведомления">
            <Bell size={19} />
            <i>3</i>
          </Link>
        </header>
        <main id="main" className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const Metric = ({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: string;
}) => (
  <article className={`metric ${tone ?? ""}`}>
    <strong>{value}</strong>
    <span>{label}</span>
  </article>
);
export function TeacherDashboard() {
  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date()).toLocaleUpperCase("ru-RU");
  return (
    <>
      <PageTitle
        eyebrow={today}
        title="Добрый день, Мария."
        action={
          <Link className="button" to="/teacher/homework/new">
            <Plus size={17} /> Новое задание
          </Link>
        }
      />
      <section className="metrics">
        <Metric value="4" label="Ожидают проверки" tone="warm" />
        <Metric value="3" label="Не сдали в срок" tone="danger" />
        <Metric value="2" label="Дедлайн сегодня" tone="warm" />
        <Metric value="5" label="Дедлайн завтра" />
        <Metric value="2" label="Занятия сегодня" />
        <Metric value="6" label="Новых результатов тестов" />
        <Metric value="5" label="Недавно загруженные фотографии" />
        <Metric value="1" label="Без ближайшего занятия" tone="danger" />
      </section>
      <section className="content-grid">
        <article className="panel attention">
          <PanelHead title="Требует внимания" link="/teacher/review" />
          <Task
            title="Максим Орлов не сдал «Обыкновенные дроби»"
            meta="Дедлайн истёк вчера в 23:59"
          />
          <Task
            title="Анна Волкова загрузила 5 фотографий"
            meta="Ожидает ручной проверки · 12 минут назад"
          />
          <Task
            title="У Софии нет ближайшего занятия"
            meta="Расписание не заполнено"
          />
        </article>
        <article className="panel">
          <PanelHead title="Сегодня" link="/teacher/calendar" />
          <Lesson time="16:00" name="Анна Волкова" topic="Линейные уравнения" />
          <Lesson time="18:00" name="Максим Орлов" topic="Дроби" />
        </article>
      </section>
      <StudentsTable />
    </>
  );
}

function StudentsTable() {
  const { data: students = demoStudents } = useStudents();
  return (
    <section className="panel table-panel">
      <PanelHead title="Ученики" link="/teacher/students" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Класс</th>
              <th>Текущая тема</th>
              <th>Средний результат</th>
              <th>Просрочено</th>
              <th>Активность</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/teacher/students/${s.id}`}>
                    <b>{s.name}</b>
                  </Link>
                </td>
                <td>{s.className}</td>
                <td>{s.topic}</td>
                <td>
                  <span className="score">{s.result}%</span>
                </td>
                <td>{s.overdue || "—"}</td>
                <td>{s.activity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function StudentsPage() {
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("Все классы");
  const { data = demoStudents, isLoading, error } = useStudents();
  const [created, setCreated] = useState<typeof demoStudents>([]);
  const students = [...data, ...created];
  const [creating, setCreating] = useState(false);
  const classes = ["Все классы", ...new Set(students.map((s) => s.className))];
  const shown = students.filter((s) =>
    s.name.toLowerCase().includes(q.toLowerCase()) &&
    (classFilter === "Все классы" || s.className === classFilter),
  );
  return (
    <>
      <PageTitle
        eyebrow="УЧЕНИКИ"
        title="Каждый прогресс — личный."
        action={
          <button className="button" onClick={() => setCreating(true)}>
            <Plus size={17} /> Добавить ученика
          </button>
        }
      />
      <div className="student-filters">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти ученика"
          aria-label="Найти ученика"
        />
        <select aria-label="Фильтр по классу" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          {classes.map((className) => <option key={className}>{className}</option>)}
        </select>
      </div>
      {isLoading && <p role="status">Загрузка учеников…</p>}
      {error && <p className="form-error" role="alert">Не удалось загрузить учеников</p>}
      <section className="student-cards">
        {shown.map((s) => (
          <Link
            className="student-card"
            to={`/teacher/students/${s.id}`}
            key={s.id}
          >
            <span className="avatar">
              {s.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <div>
              <h2>{s.name}</h2>
              <p>{s.className} · Математика</p>
            </div>
            <strong>{s.result}%</strong>
            <ChevronRight />
          </Link>
        ))}
      </section>
      {!isLoading && shown.length === 0 && <section className="panel empty">Ученики не найдены. Измените поиск или фильтр.</section>}
      {creating && (
        <CreateStudent
          onClose={() => setCreating(false)}
          onCreated={(student) => {
          setCreated([...created, student]);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function CreateStudent({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (student: (typeof demoStudents)[number]) => void;
}) {
  const [firstName, setFirstName] = useState(""),
    [lastName, setLastName] = useState(""),
    [className, setClassName] = useState("8 класс"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(
      "Ecl-" + crypto.randomUUID().slice(0, 8),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div
      className="editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-title"
    >
      <form
        className="create-student"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          let login: string;
          try {
            login = usernameSchema.parse(username);
          } catch {
            setError("Проверьте логин");
            return;
          }
          setBusy(true);
          try {
            let id = login;
            if (supabase) {
              const { data, error: invokeError } =
                await supabase.functions.invoke("create-student", {
                  body: {
                    firstName,
                    lastName,
                    className,
                    username: login,
                    password,
                    subject: "Математика",
                  },
                });
              if (invokeError) throw invokeError;
              id = data.id;
            }
            onCreated({
              id,
              name: `${firstName} ${lastName}`,
              className,
              topic: "Новый ученик",
              result: 0,
              overdue: 0,
              activity: "только что",
            });
          } catch {
            setError(
              "Не удалось создать ученика. Проверьте уникальность логина.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <h2 id="create-title">Новый ученик</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="create-fields">
          <label>
            Имя
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label>
            Фамилия
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
          <label>
            Класс
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              required
            />
          </label>
          <label>
            Логин
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="full">
            Временный пароль
            <div className="password-row">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() =>
                  setPassword("Ecl-" + crypto.randomUUID().slice(0, 8))
                }
              >
                Сгенерировать
              </button>
            </div>
          </label>
          {error && (
            <p className="form-error full" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Создание…" : "Создать аккаунт"}
          </button>
        </footer>
      </form>
    </div>
  );
}
export function StudentDetail() {
  const { studentId = "" } = useParams();
  const { data = demoStudents } = useStudents();
  const s = data.find((student) => student.id === studentId) ?? data[0] ?? demoStudents[0];
  return (
    <>
      <PageTitle eyebrow="КАРТОЧКА УЧЕНИКА" title={s.name} />
      <section className="metrics">
        <Metric value="92%" label="Средний результат" />
        <Metric value="14" label="Выполнено" />
        <Metric value="1" label="Ожидает проверки" />
        <Metric value="0" label="Просрочено" />
      </section>
      <section className="content-grid">
        <article className="panel">
          <h2>Прогресс по темам</h2>
          <Progress label="Линейные уравнения" value={92} />
          <Progress label="Функции" value={84} />
          <Progress label="Геометрия" value={76} />
          <Suspense fallback={<p>Загрузка графика…</p>}>
            <AnalyticsChart />
          </Suspense>
        </article>
        <TeacherNotes studentId={s.id} />
      </section>
      <StudentsTable />
    </>
  );
}
function TeacherNotes({ studentId }: { studentId: string }) {
  const [value, setValue] = useStored(
    `teacher-note:${studentId}`,
    "Сильная база. В задачах на движение просить проговаривать модель вслух.",
  );
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setSaved(false);
    const id = setTimeout(() => {
      saveTeacherNote(studentId, value).then(() => setSaved(true)).catch(() => setSaved(false));
    }, 500);
    return () => clearTimeout(id);
  }, [studentId, value]);
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Личные заметки</h2>
        <span>{saved ? "Сохранено" : "Сохранение…"}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Личные заметки преподавателя"
      />
    </article>
  );
}

export function HomeworkList({ student = false }: { student?: boolean }) {
  return (
    <>
      <PageTitle
        eyebrow="ДОМАШНИЕ ЗАДАНИЯ"
        title={student ? "В своём темпе. К сроку." : "Задания без рутины."}
        action={
          !student ? (
            <Link className="button" to="/teacher/homework/new">
              <Plus size={17} /> Создать
            </Link>
          ) : undefined
        }
      />
      <section className="homework-list">
        <HomeworkRow
          title="Функции и их графики"
          topic="Функции"
          due="15 июля, 23:59"
          status={assignmentStatus({
            started: true,
            deadline: "2026-07-15",
            now: "2026-07-13",
          })}
          href={
            student
              ? "/student/homework/functions"
              : "/teacher/homework/functions/edit"
          }
        />
        <HomeworkRow
          title="Теорема Пифагора · фото-решение"
          topic="Геометрия"
          due="18 июля, 20:00"
          status="Не начато"
          href={student ? "/student/homework/geometry/photos" : "#"}
        />
        <HomeworkRow
          title="Обыкновенные дроби"
          topic="Дроби"
          due="12 июля, 23:59"
          status="Просрочено"
          href="#"
        />
      </section>
    </>
  );
}
function HomeworkRow({
  title,
  topic,
  due,
  status,
  href,
}: {
  title: string;
  topic: string;
  due: string;
  status: string;
  href: string;
}) {
  return (
    <Link className="homework-row" to={href}>
      <div>
        <span className="badge">{topic}</span>
        <h2>{title}</h2>
        <p>Сдать до {due}</p>
      </div>
      <span className={`status-badge ${status === "Просрочено" ? "bad" : ""}`}>
        {status}
      </span>
      <ChevronRight />
    </Link>
  );
}

export function HomeworkBuilder() {
  const [mode, setMode] = useState("automatic");
  const [title, setTitle] = useState("Функции и их графики");
  const [question, setQuestion] = useState(
    "Найдите значение функции y = 2x + 1 при x = 3",
  );
  const [answer, setAnswer] = useState("7");
  const [saved, setSaved] = useState(false);
  const valid = title.trim() && question.trim() && answer.trim();
  return (
    <>
      <PageTitle eyebrow="НОВОЕ ЗАДАНИЕ" title="Соберите ясный маршрут." />
      <form
        className="builder"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <section className="panel form-panel">
          <fieldset className="assignment-modes">
            <legend>Формат задания</legend>
            {[["automatic", "Автопроверка"], ["manual", "Фото-решение"], ["combined", "Комбинированное"]].map(([value, label]) => (
              <label key={value}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} /> {label}</label>
            ))}
          </fieldset>
          <label>
            Название
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="form-row">
            <label>
              Тема
              <select>
                <option>Функции</option>
                <option>Уравнения</option>
                <option>Геометрия</option>
              </select>
            </label>
            <label>
              Срок
              <input type="datetime-local" defaultValue="2026-07-15T23:59" />
            </label>
            <label>
              Попыток
              <input type="number" min="1" defaultValue="2" />
            </label>
          </div>
        </section>
        {mode !== "manual" && <section className="panel form-panel">
          <div className="panel-head">
            <h2>Вопрос 1</h2>
            <span>1 балл</span>
          </div>
          <label>
            Условие
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <label>
            Принимаемый ответ
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
        </section>}
        {mode !== "automatic" && <section className="panel form-panel">
          <h2>Фото-решение</h2>
          <p>Ученик сможет загрузить, повернуть, обрезать и упорядочить страницы решения.</p>
          <label>Максимум баллов<input type="number" min="1" defaultValue="5" /></label>
        </section>}
        {saved && <p className="save-confirmation" role="status">Черновик сохранён. Его можно открыть в предпросмотре.</p>}
        <div className="sticky-actions">
          <Link className="button secondary" to="/teacher/homework">
            Отмена
          </Link>
          <button className="button" disabled={!valid}>
            <Save size={17} /> Сохранить черновик
          </button>
          <Link className="button secondary" to="/teacher/homework/functions/preview">Предпросмотр</Link>
        </div>
      </form>
    </>
  );
}

export function TestAttempt() {
  const location = useLocation();
  const preview = location.pathname.includes("/teacher/");
  const resultView = location.pathname.includes("/results/");
  const questions = [
    {
      id: "q1",
      text: "Найдите значение y = 2x + 1 при x = 3",
      accepted: ["7"],
    },
    {
      id: "q2",
      text: "Как называется график функции y = x²?",
      accepted: ["парабола"],
    },
  ];
  const [answers, setAnswers] = useStored<Record<string, string>>(
    "eclipse-attempt",
    {},
  );
  const [done, setDone] = useState(resultView);
  const result = questions.filter((q) =>
    isAcceptedAnswer(answers[q.id] ?? "", q.accepted),
  ).length;
  if (done) {
    const score = scoreAttempt({
      automaticCorrect: result,
      automaticTotal: questions.length,
      manualPoints: 0,
      manualMaximum: 0,
    });
    return (
      <>
        <PageTitle
          eyebrow={preview ? "ПРЕДПРОСМОТР" : "РЕЗУЛЬТАТ"}
          title={`${score.percentage}% — попытка завершена.`}
        />
        <section className="panel result">
          <strong>
            {score.score} из {score.maximum}
          </strong>
          <p>
            Верных ответов: {result}. {preview ? "Так ученик увидит итоговый разбор." : "Можно использовать оставшуюся попытку."}
          </p>
          {questions.map((q) => (
            <div className="answer-review" key={q.id}>
              <b>{q.text}</b>
              <span>Ваш ответ: {answers[q.id] || "Нет ответа"}</span>
              {!isAcceptedAnswer(answers[q.id] ?? "", q.accepted) && (
                <span className="wrong">
                  Верный ответ: {q.accepted.join(", ")}
                </span>
              )}
            </div>
          ))}
        </section>
      </>
    );
  }
  return (
    <>
      <PageTitle eyebrow="ФУНКЦИИ И ГРАФИКИ" title="Решайте внимательно." />
      <section className="attempt-layout">
        <nav className="question-nav" aria-label="Навигация по вопросам">
          {questions.map((q, i) => (
            <a
              href={`#${q.id}`}
              className={answers[q.id] ? "answered" : ""}
              key={q.id}
            >
              {i + 1}
            </a>
          ))}
        </nav>
        <div>
          {questions.map((q, i) => (
            <article className="panel question" id={q.id} key={q.id}>
              <span>
                Вопрос {i + 1} из {questions.length}
              </span>
              <h2>{q.text}</h2>
              <label>
                Ваш ответ
                <input
                  disabled={preview}
                  inputMode="decimal"
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.id]: e.target.value })
                  }
                />
              </label>
            </article>
          ))}
          {!preview && <button
            className="button finish"
            onClick={() =>
              confirm(
                `Вы ответили на ${Object.values(answers).filter(Boolean).length} из ${questions.length} вопросов. После отправки изменить ответы будет нельзя.`,
              ) && setDone(true)
            }
          >
            Завершить попытку
          </button>}
          {preview && <p className="preview-note" role="note">Режим преподавателя: ответы и отправка отключены.</p>}
        </div>
      </section>
    </>
  );
}

export function CalendarPage() {
  return (
    <>
      <PageTitle eyebrow="РАСПИСАНИЕ" title="Неделя в равновесии." />
      <Suspense
        fallback={
          <section className="panel empty">Загрузка календаря…</section>
        }
      >
        <CalendarBoard />
      </Suspense>
    </>
  );
}
export function NotificationsPage() {
  return (
    <>
      <PageTitle eyebrow="УВЕДОМЛЕНИЯ" title="Ничего важного не потеряется." />
      <section className="panel notifications">
        <Task title="Анна загрузила фотографии решения" meta="12 минут назад" />
        <Task title="Задание «Функции» сдано" meta="Сегодня, 10:42" />
        <Task
          title="Урок с Максимом начинается через час"
          meta="Сегодня, 17:00"
        />
      </section>
    </>
  );
}
export function ReviewPage() {
  return (
    <>
      <PageTitle eyebrow="РУЧНАЯ ПРОВЕРКА" title="Внимание к ходу решения." />
      <section className="panel review">
        <div className="review-preview">
          <ImagePlus size={40} />
          <p>5 страниц решения Анны Волковой</p>
        </div>
        <div>
          <h2>Задача 1</h2>
          <p>Оцените полноту решения</p>
          <div className="score-buttons">
            <button>0</button>
            <button>1</button>
            <button className="selected">2</button>
          </div>
          <button className="button">Завершить проверку</button>
        </div>
      </section>
    </>
  );
}
export function PhotoSubmission() {
  const [files, setFiles] = useState<
    {
      file: File;
      url: string;
      rotation: number;
      width: number;
      height: number;
    }[]
  >([]);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const move = (from: number, to: number) =>
    setFiles((current) => {
      if (to < 0 || to >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  if (sent)
    return (
      <>
        <PageTitle eyebrow="ГОТОВО" title="Решение отправлено." />
        <section className="panel empty">
          <BookOpenCheck />
          <h2>{files.length} страниц сохранено</h2>
          <p>Преподаватель получит внутреннее уведомление.</p>
        </section>
      </>
    );
  return (
    <>
      <PageTitle eyebrow="ФОТО-РЕШЕНИЕ" title="Покажите ход мысли." />
      <section className="panel uploader">
        <label className="upload-drop">
          <ImagePlus />
          <b>Добавить фотографии</b>
          <span>JPG, PNG, WEBP или HEIC · до 15 файлов</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            capture="environment"
            onChange={async (e) => {
              const selected = Array.from(e.target.files ?? []).slice(
                0,
                15 - files.length,
              );
              e.target.value = "";
              const valid = selected.filter(
                (file) =>
                  file.size > 0 &&
                  file.size <= 20 * 1024 * 1024 &&
                  /image\/(jpeg|png|webp|heic|heif)/i.test(
                    file.type || `image/${file.name.split(".").pop()}`,
                  ),
              );
              if (valid.length !== selected.length)
                alert(
                  "Некоторые файлы пропущены: разрешены изображения до 20 МБ.",
                );
              setProcessing(true);
              try {
                setFiles([
                  ...files,
                  ...(await Promise.all(valid.map(imageInfo))),
                ]);
              } catch {
                alert("Не удалось подготовить HEIC. Попробуйте JPG или PNG.");
              } finally {
                setProcessing(false);
              }
            }}
          />
        </label>
        {processing && <p role="status">Подготовка изображений…</p>}
        {files.length > 0 && (
          <div className="upload-grid">
            {files.map((item, i) => (
              <article key={`${item.file.name}-${i}`}>
                <div className="upload-thumb">
                  <img
                    src={item.url}
                    alt={`Страница ${i + 1}`}
                    style={{ transform: `rotate(${item.rotation}deg)` }}
                  />
                </div>
                <b>Страница {i + 1}</b>
                <small>{(item.file.size / 1024 / 1024).toFixed(1)} МБ</small>
                {(item.width < 600 || item.height < 600) && (
                  <small className="image-warning">
                    Низкое разрешение — проверьте читаемость
                  </small>
                )}
                <div className="image-actions">
                  <button
                    aria-label="Поднять страницу"
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronUp />
                  </button>
                  <button
                    aria-label="Опустить страницу"
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronDown />
                  </button>
                  <button
                    aria-label="Обрезать страницу"
                    onClick={() => setEditing(i)}
                  >
                    <Crop />
                  </button>
                  <button
                    aria-label="Повернуть страницу"
                    onClick={() =>
                      setFiles(
                        files.map((x, n) =>
                          n === i ? { ...x, rotation: x.rotation + 90 } : x,
                        ),
                      )
                    }
                  >
                    <RotateCw />
                  </button>
                  <button
                    aria-label="Удалить страницу"
                    onClick={() => {
                      URL.revokeObjectURL(item.url);
                      setFiles(files.filter((_, n) => n !== i));
                    }}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <button
          className="button submit-photos"
          disabled={!files.length}
          onClick={() =>
            confirm(
              `Отправить ${files.length} страниц? После отправки заменить их будет нельзя.`,
            ) && setSent(true)
          }
        >
          Отправить решение
        </button>
      </section>
      {editing !== null && files[editing] && (
        <Suspense fallback={null}>
          <ImageEditor
            src={files[editing].url}
            onClose={() => setEditing(null)}
            onSave={(blob) => {
              const old = files[editing].url;
              const url = URL.createObjectURL(blob);
              setFiles(
                files.map((item, index) =>
                  index === editing ? { ...item, url, rotation: 0 } : item,
                ),
              );
              URL.revokeObjectURL(old);
              setEditing(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
export function SimplePage({ title }: { title: string }) {
  return (
    <>
      <PageTitle eyebrow="ECLIPSE" title={title} />
      <section className="panel empty">
        <Settings />
        <h2>Раздел готов к данным проекта</h2>
        <p>После подключения Supabase здесь появятся ваши реальные данные.</p>
      </section>
    </>
  );
}

function PageTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
function PanelHead({ title, link }: { title: string; link: string }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      <Link to={link}>
        Все <ChevronRight size={15} />
      </Link>
    </div>
  );
}
function Task({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="task">
      <span className="task-dot" />
      <div>
        <b>{title}</b>
        <p>{meta}</p>
      </div>
      <ChevronRight size={17} />
    </div>
  );
}
function Lesson({
  time,
  name,
  topic,
}: {
  time: string;
  name: string;
  topic: string;
}) {
  return (
    <div className="lesson">
      <strong>{time}</strong>
      <div>
        <b>{name}</b>
        <p>{topic}</p>
      </div>
    </div>
  );
}
function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress">
      <span>{label}</span>
      <b>{value}%</b>
      <i>
        <span style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "") as T;
    } catch {
      return initial;
    }
  });
  useEffect(
    () => localStorage.setItem(key, JSON.stringify(value)),
    [key, value],
  );
  return [value, setValue] as const;
}
