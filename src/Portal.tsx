import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
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
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { isAcceptedAnswer, validateHomework, validateImage } from "./lib/homework";
import { supabase } from "./lib/supabase";
import { usernameSchema } from "./lib/schemas";
import {
  archiveHomework,
  createHomework,
  createLesson,
  deleteHomeworkDraft,
  extendDeadline,
  gradeSubmission,
  manageStudent,
  markAllNotificationsRead,
  markNotificationRead,
  returnSubmission,
  saveAttemptDraft,
  saveHomeworkDraft,
  saveHomeworkTemplate,
  saveSubmissionReview,
  saveTeacherNote,
  submitAttempt,
  uploadManualSubmission,
  useAssignment,
  useAssignmentResult,
  useAssignments,
  useAttemptResult,
  useCurrentProfile,
  useCatalog,
  useHomeworkEditor,
  useHomeworkDrafts,
  useHomeworkTemplates,
  useLessons,
  useNotifications,
  useReviewQueue,
  useStudentAnalytics,
  useStudents,
  useSubmissionDetail,
  useTeacherNote,
  useTeacherDashboard,
  type StudentCard,
} from "./lib/data";
import { useQueryClient } from "@tanstack/react-query";
import { clearDemoRole, getDemoRole } from "./lib/demo";

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
  return {
    file,
    url,
    processedBlob: null as Blob | null,
    cropMetadata: {} as Record<string, number>,
    rotation: 0,
    ...dimensions,
  };
}

async function renderImage(src: string, rotation: number, maxSide: number) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image();
    value.onload = () => resolve(value);
    value.onerror = reject;
    value.src = src;
  });
  const swapped = Math.abs(rotation / 90) % 2 === 1;
  const sourceWidth = swapped ? image.naturalHeight : image.naturalWidth;
  const sourceHeight = swapped ? image.naturalWidth : image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Изображение не поддерживается");
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    image,
    (-image.naturalWidth * scale) / 2,
    (-image.naturalHeight * scale) / 2,
    image.naturalWidth * scale,
    image.naturalHeight * scale,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Не удалось обработать изображение")),
      "image/jpeg",
      0.9,
    ),
  );
  return { blob, width, height };
}
function useAccessibleDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0],
          last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  return ref;
}

function FullscreenImageDialog({
  src,
  alt,
  transform,
  onClose,
}: {
  src: string;
  alt: string;
  transform?: string;
  onClose: () => void;
}) {
  const ref = useAccessibleDialog(true, onClose);
  return (
    <div
      ref={ref}
      className="editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-preview-title"
      aria-describedby="image-preview-description"
      onClick={onClose}
    >
      <h2 id="image-preview-title" className="sr-only">Просмотр изображения</h2>
      <p id="image-preview-description" className="sr-only">{alt}</p>
      <button className="editor-close" aria-label="Закрыть просмотр" onClick={onClose}><X /></button>
      <img
        className="fullscreen-image"
        src={src}
        alt={alt}
        style={{ transform }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useNotifications();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const nav = role === "teacher" ? teacherNav : studentNav;
  useEffect(() => {
    document.getElementById("main")?.focus();
  }, [location.pathname]);
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
          disabled={loggingOut}
          onClick={async () => {
            setLogoutError("");
            setLoggingOut(true);
            try {
              if (supabase && !getDemoRole()) {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
              }
              clearDemoRole();
              sessionStorage.setItem("eclipse:signed-out", "1");
              queryClient.clear();
              Object.keys(localStorage)
                .filter((key) => key.startsWith("eclipse-attempt:"))
                .forEach((key) => localStorage.removeItem(key));
              navigate("/login", { replace: true });
            } catch {
              setLogoutError("Не удалось выйти. Попробуйте ещё раз.");
            } finally {
              setLoggingOut(false);
            }
          }}
        >
          <LogOut size={18} /> {loggingOut ? "Выходим…" : "Выйти"}
        </button>
        {logoutError && (
          <p className="form-error" role="alert">
            {logoutError}
          </p>
        )}
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
            {notifications.some((item) => !item.readAt) && (
              <i>{notifications.filter((item) => !item.readAt).length}</i>
            )}
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="portal-content">
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
  const { data: dashboard } = useTeacherDashboard();
  const { data: profile } = useCurrentProfile();
  const { data: students = [] } = useStudents();
  const { data: lessons = [] } = useLessons();
  const { data: notifications = [] } = useNotifications();
  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date())
    .toLocaleUpperCase("ru-RU");
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isDay = (value: string, day: Date) =>
    new Date(value).toDateString() === day.toDateString();
  const unreadResults = notifications.filter(
    (item) => !item.readAt && item.kind === "result",
  ).length;
  return (
    <>
      <PageTitle
        eyebrow={today}
        title={`Добрый день${profile?.firstName ? `, ${profile.firstName}` : ""}.`}
        action={
          <Link className="button" to="/teacher/homework/new">
            <Plus size={17} /> Новое задание
          </Link>
        }
      />
      <section className="metrics">
        <Metric
          value={
            dashboard?.awaitingReviewCount ?? 0
          }
          label="Ожидают проверки"
          tone="warm"
        />
        <Metric
          value={dashboard?.overdueCount ?? 0}
          label="Не сдали в срок"
          tone="danger"
        />
        <Metric
          value={dashboard?.deadlineTodayCount ?? 0}
          label="Дедлайн сегодня"
          tone="warm"
        />
        <Metric
          value={
            dashboard?.deadlineTomorrowCount ?? 0
          }
          label="Дедлайн завтра"
        />
        <Metric
          value={dashboard?.lessonsTodayCount ?? 0}
          label="Занятия сегодня"
        />
        <Metric value={dashboard?.newAutomaticResultsCount ?? unreadResults} label="Новых результатов тестов" />
        <Metric
          value={
            dashboard?.newPhotoSubmissionsCount ?? 0
          }
          label="Недавно загруженные фотографии"
        />
        <Metric
          value={Math.max(
            0,
            dashboard?.studentsWithoutFutureLessonCount ?? students.length,
          )}
          label="Без ближайшего занятия"
          tone="danger"
        />
      </section>
      <section className="content-grid">
        <article className="panel attention">
          <PanelHead title="Требует внимания" link="/teacher/review" />
          {notifications
            .filter((item) => !item.readAt)
            .slice(0, 3)
            .map((item) => (
              <Link key={item.id} to={item.href}>
                <Task
                  title={item.title}
                  meta={new Date(item.createdAt).toLocaleString("ru-RU")}
                />
              </Link>
            ))}
          {!notifications.some((item) => !item.readAt) && (
            <p className="empty-inline">Всё спокойно — новых событий нет.</p>
          )}
        </article>
        <article className="panel">
          <PanelHead title="Сегодня" link="/teacher/calendar" />
          {lessons
            .filter((lesson) => isDay(lesson.startsAt, now))
            .map((lesson) => (
              <Lesson
                key={lesson.id}
                time={new Date(lesson.startsAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                name={lesson.studentName}
                topic={lesson.status === "moved" ? "Перенесено" : "Математика"}
              />
            ))}
          {!lessons.some((lesson) => isDay(lesson.startsAt, now)) && (
            <p className="empty-inline">На сегодня занятий нет.</p>
          )}
        </article>
      </section>
      <StudentsTable />
    </>
  );
}

function StudentsTable() {
  const { data: students = [] } = useStudents();
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
  const { data = [], isLoading, error } = useStudents();
  const [created, setCreated] = useState<StudentCard[]>([]);
  const students = [...data, ...created];
  const [creating, setCreating] = useState(false);
  const classes = ["Все классы", ...new Set(students.map((s) => s.className))];
  const shown = students.filter(
    (s) =>
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
        <select
          aria-label="Фильтр по классу"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          {classes.map((className) => (
            <option key={className}>{className}</option>
          ))}
        </select>
      </div>
      {isLoading && <p role="status">Загрузка учеников…</p>}
      {error && (
        <p className="form-error" role="alert">
          Не удалось загрузить учеников
        </p>
      )}
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
      {!isLoading && shown.length === 0 && (
        <section className="panel empty">
          Ученики не найдены. Измените поиск или фильтр.
        </section>
      )}
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
  onCreated: (student: StudentCard) => void;
}) {
  const dialogRef = useAccessibleDialog(true, onClose);
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
      ref={dialogRef}
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
              autoFocus
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
  const {
    data = [],
    isLoading: studentsLoading,
    error: studentsError,
    refetch: refetchStudents,
  } = useStudents();
  const [days, setDays] = useState<number | null>(30);
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useStudentAnalytics(studentId, days);
  const [extensionAssignment, setExtensionAssignment] = useState(""),
    [extensionUntil, setExtensionUntil] = useState(""),
    [extensionReason, setExtensionReason] = useState("");
  const s = data.find((student) => student.id === studentId);
  const queryClient = useQueryClient();
  const [className, setClassName] = useState("");
  const [zoomUrl, setZoomUrl] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  useEffect(() => {
    if (s) {
      setClassName(s.className === "—" ? "" : s.className);
      setZoomUrl(s.zoomUrl ?? "");
    }
  }, [s]);
  if (studentsLoading)
    return (
      <section className="panel empty" role="status">
        Загрузка ученика…
      </section>
    );
  if (studentsError)
    return (
      <section className="panel empty" role="alert">
        Не удалось загрузить ученика.{" "}
        <button
          className="button secondary"
          onClick={() => void refetchStudents()}
        >
          Повторить
        </button>
      </section>
    );
  if (!s) return <section className="panel empty">Ученик не найден.</section>;
  return (
    <>
      <PageTitle eyebrow="КАРТОЧКА УЧЕНИКА" title={s.name} />
      <div className="student-filters">
        <label>
          Период{" "}
          <select
            value={days ?? "all"}
            onChange={(e) =>
              setDays(e.target.value === "all" ? null : Number(e.target.value))
            }
          >
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="all">Всё время</option>
          </select>
        </label>
      </div>
      {analyticsLoading && <p role="status">Загрузка аналитики…</p>}
      {analyticsError && (
        <div className="form-error" role="alert">
          Не удалось загрузить аналитику.{" "}
          <button
            className="button secondary"
            onClick={() => void refetchAnalytics()}
          >
            Повторить
          </button>
        </div>
      )}
      <section className="metrics">
        <Metric value={`${s.result}%`} label="Средний результат" />
        <Metric value={analytics?.summary.completed ?? 0} label="Выполнено" />
        <Metric
          value={analytics?.summary.awaiting_review ?? 0}
          label="Ожидает проверки"
        />
        <Metric
          value={analytics?.summary.overdue ?? s.overdue}
          label="Просрочено"
        />
      </section>
      <section className="content-grid">
        <article className="panel">
          <h2>Профиль</h2>
          <p>
            Логин: <b>{s.username ?? "—"}</b>
          </p>
          <p>Предмет: {s.topic}</p>
          <label>
            Класс
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </label>
          <label>
            Ссылка Zoom
            <input
              type="url"
              value={zoomUrl}
              onChange={(e) => setZoomUrl(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={accountBusy}
            onClick={async () => {
              setAccountBusy(true);
              setAccountMessage("");
              try {
                const result = await manageStudent({
                  studentId: s.id,
                  action: "update-profile",
                  className,
                  zoomUrl,
                });
                await queryClient.invalidateQueries({ queryKey: ["students"] });
                setAccountMessage(result.warning ?? "Профиль обновлён.");
              } catch {
                setAccountMessage("Не удалось обновить профиль.");
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            Сохранить профиль
          </button>
        </article>
        <TeacherNotes studentId={s.id} />
      </section>
      <section className="panel form-panel">
        <h2>Управление аккаунтом</h2>
        <div className="sticky-actions">
          <button
            className="button secondary"
            disabled={accountBusy}
            onClick={async () => {
              const password = `Ecl-${crypto.randomUUID().slice(0, 8)}`;
              setAccountBusy(true);
              try {
                const result = await manageStudent({
                  studentId: s.id,
                  action: "reset-password",
                  password,
                });
                setTemporaryPassword(password);
                setAccountMessage(
                  result.warning ??
                    "Временный пароль создан. Скопируйте его сейчас — повторно он не показывается.",
                );
              } catch {
                setAccountMessage("Не удалось сбросить пароль.");
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            Сбросить пароль
          </button>
          <button
            className="button secondary"
            disabled={accountBusy}
            onClick={async () => {
              setAccountBusy(true);
              try {
                const result = await manageStudent({
                  studentId: s.id,
                  action: s.status === "archived" ? "restore" : "archive",
                });
                await queryClient.invalidateQueries({ queryKey: ["students"] });
                setAccountMessage(
                  result.warning ??
                    (s.status === "archived"
                      ? "Аккаунт восстановлен."
                      : "Аккаунт архивирован."),
                );
              } catch {
                setAccountMessage("Не удалось изменить статус.");
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            {s.status === "archived" ? "Восстановить" : "Архивировать"}
          </button>
          {s.username && (
            <button
              className="button secondary"
              onClick={() => navigator.clipboard.writeText(s.username!)}
            >
              Копировать логин
            </button>
          )}
        </div>
        {temporaryPassword && (
          <div className="password-row">
            <input readOnly value={temporaryPassword} />
            <button
              onClick={() => navigator.clipboard.writeText(temporaryPassword)}
            >
              Копировать пароль
            </button>
          </div>
        )}
        {accountMessage && <p role="status">{accountMessage}</p>}
      </section>
      <section className="panel table-panel">
        <h2>Прогресс по темам</h2>
        {analytics?.topics.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Тема</th>
                  <th>Заданий</th>
                  <th>Попыток</th>
                  <th>Средний</th>
                  <th>Лучший</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topics.map((topic) => (
                  <tr key={topic.topic}>
                    <td>{topic.topic}</td>
                    <td>{topic.completed}</td>
                    <td>{topic.attempts}</td>
                    <td>{topic.average}%</td>
                    <td>{topic.best}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Результатов по темам пока нет.</p>
        )}
      </section>
      <section className="panel table-panel">
        <h2>История заданий</h2>
        {analytics?.history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Задание</th>
                  <th>Тема</th>
                  <th>Тип</th>
                  <th>Эффективный срок</th>
                  <th>Статус</th>
                  <th>Попыток</th>
                  <th>Лучший</th>
                </tr>
              </thead>
              <tbody>
                {analytics.history.map((item) => (
                  <tr key={item.assignment_id}>
                    <td>{item.title}</td>
                    <td>{item.topic}</td>
                    <td>{item.mode}</td>
                    <td>
                      {new Date(item.effective_deadline).toLocaleString(
                        "ru-RU",
                      )}
                    </td>
                    <td>{item.status}</td>
                    <td>{item.attempts_used}</td>
                    <td>
                      {item.best_score ?? "—"} / {item.automatic_maximum ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">История пока пуста.</p>
        )}
      </section>
      <form
        className="panel form-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setAccountMessage("");
          setAccountBusy(true);
          try {
            await extendDeadline(
              extensionAssignment,
              extensionUntil,
              extensionReason,
            );
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["student-analytics", studentId],
              }),
              queryClient.invalidateQueries({ queryKey: ["assignments"] }),
              queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }),
              queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] }),
            ]);
            setAccountMessage("Индивидуальный срок продлён.");
          } catch {
            setAccountMessage("Новый срок должен быть позже текущего.");
          } finally {
            setAccountBusy(false);
          }
        }}
      >
        <h2>Продлить срок</h2>
        <div className="form-row">
          <label>
            Задание
            <select
              required
              value={extensionAssignment}
              onChange={(e) => setExtensionAssignment(e.target.value)}
            >
              <option value="">Выберите</option>
              {analytics?.history.map((item) => (
                <option key={item.assignment_id} value={item.assignment_id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Новый срок
            <input
              type="datetime-local"
              required
              value={extensionUntil}
              onChange={(e) => setExtensionUntil(e.target.value)}
            />
          </label>
          <label>
            Причина
            <input
              value={extensionReason}
              maxLength={500}
              onChange={(e) => setExtensionReason(e.target.value)}
            />
          </label>
        </div>
        <button className="button" disabled={accountBusy}>
          Продлить
        </button>
      </form>
      <section className="panel notifications">
        <h2>История попыток</h2>
        {analytics?.attempts.map((attempt) => (
          <Link
            className="task"
            to={`/teacher/results/${attempt.id}`}
            key={attempt.id}
          >
            <div>
              <b>
                {attempt.title} · попытка {attempt.attempt_number}
              </b>
              <p>
                {attempt.score} из {attempt.maximum} ·{" "}
                {new Date(attempt.submitted_at).toLocaleString("ru-RU")}
              </p>
            </div>
            <ChevronRight />
          </Link>
        ))}
        {!analytics?.attempts.length && (
          <p className="empty-inline">Попыток пока нет.</p>
        )}
      </section>
      <StudentsTable />
    </>
  );
}
function TeacherNotes({ studentId }: { studentId: string }) {
  const { data = "", isLoading } = useTeacherNote(studentId);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(true);
  useEffect(() => setValue(data), [data]);
  useEffect(() => {
    if (isLoading || value === data) return;
    setSaved(false);
    const id = setTimeout(() => {
      saveTeacherNote(studentId, value)
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 500);
    return () => clearTimeout(id);
  }, [studentId, value, data, isLoading]);
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
  const {
    data: assignments = [],
    isLoading,
    error,
    refetch,
  } = useAssignments();
  const visible = student
    ? assignments
    : [...new Map(assignments.map((item) => [item.homeworkId, item])).values()];
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
        {isLoading && <p role="status">Загрузка заданий…</p>}
        {error && (
          <div className="form-error" role="alert">
            Не удалось загрузить задания.{" "}
            <button className="button secondary" onClick={() => void refetch()}>
              Повторить
            </button>
          </div>
        )}
        {visible.map((item) => (
          <HomeworkRow
            key={item.id}
            title={item.title}
            topic={item.topic}
            due={item.deadline}
            status={item.status}
            href={
              student
                ? item.mode === "manual"
                  ? `/student/homework/${item.id}/photos`
                  : `/student/homework/${item.id}`
                : `/teacher/homework/${item.homeworkId}/edit`
            }
          />
        ))}
        {!isLoading && !error && assignments.length === 0 && (
          <section className="panel empty">Заданий пока нет.</section>
        )}
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
  const navigate = useNavigate();
  const { id: homeworkId = "" } = useParams();
  const queryClient = useQueryClient();
  const { data: students = [] } = useStudents();
  const { data: catalog = [] } = useCatalog();
  const { data: templates = [] } = useHomeworkTemplates();
  const { data: drafts = [] } = useHomeworkDrafts();
  const {
    data: editor,
    isLoading: editorLoading,
    error: editorError,
  } = useHomeworkEditor(homeworkId);
  const [mode, setMode] = useState<"automatic" | "manual" | "combined">(
    "automatic",
  );
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState([
    { id: crypto.randomUUID(), prompt: "", answers: [""] },
  ]);
  const [manualTasks, setManualTasks] = useState([
    { id: crypto.randomUUID(), prompt: "", maxPoints: 2 },
  ]);
  const [deadline, setDeadline] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [draftId, setDraftId] = useState<string>();
  const [attempts, setAttempts] = useState(2);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [individualDeadlines, setIndividualDeadlines] = useState<
    Record<string, string>
  >({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadedEditor = useRef(false);
  useEffect(() => {
    if (!editor || loadedEditor.current) return;
    loadedEditor.current = true;
    setTitle(editor.title);
    setInstructions(editor.instructions);
    setMode(editor.mode);
    setAttempts(editor.attempts);
    setSubjectId(editor.subjectId);
    setTopicId(editor.topicId);
    setQuestions(
      editor.questions.length
        ? editor.questions.map((q) => ({ id: crypto.randomUUID(), ...q }))
        : [{ id: crypto.randomUUID(), prompt: "", answers: [""] }],
    );
    setManualTasks(
      editor.manualTasks.length
        ? editor.manualTasks.map((task) => ({
            id: crypto.randomUUID(),
            ...task,
          }))
        : [{ id: crypto.randomUUID(), prompt: "", maxPoints: 2 }],
    );
  }, [editor]);
  const valid = Boolean(
    deadline &&
    validateHomework({
      title,
      mode,
      attempts,
      studentIds,
      questions,
      manualTasks,
    }).length === 0,
  );
  const move = <T,>(items: T[], from: number, to: number) => {
    if (to < 0 || to >= items.length) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };
  const payload = () => ({
    mode,
    instructions,
    deadline,
    attempts,
    studentIds,
    individualDeadlines,
    subjectId,
    topicId,
    questions: questions.map(({ prompt, answers }) => ({ prompt, answers })),
    manualTasks: manualTasks.map(({ prompt, maxPoints }) => ({ prompt, maxPoints })),
  });
  return (
    <>
      <PageTitle
        eyebrow={homeworkId ? "НОВАЯ ВЕРСИЯ" : "НОВОЕ ЗАДАНИЕ"}
        title="Соберите ясный маршрут."
      />
      {editorLoading && <p role="status">Загрузка задания…</p>}
      {editorError && (
        <p className="form-error" role="alert">
          Не удалось загрузить исходную версию.
        </p>
      )}
      <form
        className="builder"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await createHomework({
              homeworkId: homeworkId || undefined,
              subjectId: subjectId || undefined,
              topicId: topicId || undefined,
              title,
              mode,
              questions: questions.map(({ prompt, answers }) => ({
                prompt,
                answers: answers.filter((value) => value.trim()),
              })),
              manualTasks: manualTasks.map(({ prompt, maxPoints }) => ({ prompt, maxPoints })),
              instructions,
              deadline,
              attempts,
              studentIds,
              individualDeadlines,
            });
            if (draftId) await deleteHomeworkDraft(draftId);
            setSaved(true);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["assignments"] }),
              queryClient.invalidateQueries({
                queryKey: ["homework-editor", homeworkId],
              }),
            ]);
            navigate("/teacher/homework");
          } catch (value) {
            setError(
              value instanceof Error
                ? value.message
                : "Не удалось сохранить задание",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="panel form-panel">
          {!homeworkId && drafts.length > 0 && (
            <label>
              Продолжить черновик
              <select
                defaultValue=""
                onChange={(event) => {
                  const draft = drafts.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!draft) return;
                  setDraftId(draft.id);
                  const value = draft.payload;
                  setTitle(draft.title);
                  setMode(value.mode);
                  setInstructions(value.instructions);
                  setDeadline(value.deadline);
                  setAttempts(value.attempts);
                  setStudentIds(value.studentIds);
                  setIndividualDeadlines(value.individualDeadlines ?? {});
                  setSubjectId(value.subjectId);
                  setTopicId(value.topicId);
                  setQuestions(
                    value.questions.map((question) => ({
                      id: crypto.randomUUID(),
                      ...question,
                    })),
                  );
                  setManualTasks(
                    value.manualTasks.map((task) => ({
                      id: crypto.randomUUID(),
                      ...(typeof task === "string" ? { prompt: task, maxPoints: 2 } : task),
                    })),
                  );
                }}
              >
                <option value="">Выберите черновик</option>
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.title || "Без названия"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!homeworkId && templates.length > 0 && (
            <label>
              Создать из шаблона
              <select
                defaultValue=""
                onChange={(event) => {
                  const template = templates.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!template) return;
                  const value = template.payload;
                  setTitle(template.title);
                  setMode(value.mode);
                  setInstructions(value.instructions);
                  setDeadline(value.deadline);
                  setAttempts(value.attempts);
                  setStudentIds(value.studentIds);
                  setIndividualDeadlines(value.individualDeadlines ?? {});
                  setSubjectId(value.subjectId);
                  setTopicId(value.topicId);
                  setQuestions(
                    value.questions.map((question) => ({
                      id: crypto.randomUUID(),
                      ...question,
                    })),
                  );
                  setManualTasks(
                    value.manualTasks.map((task) => ({
                      id: crypto.randomUUID(),
                      ...(typeof task === "string" ? { prompt: task, maxPoints: 2 } : task),
                    })),
                  );
                }}
              >
                <option value="">Выберите шаблон</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="assignment-modes">
            <legend>Формат задания</legend>
            {(
              [
                ["automatic", "Автопроверка"],
                ["manual", "Фото-решение"],
                ["combined", "Комбинированное"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Название
            <input
              value={title}
              maxLength={160}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Инструкции
            <textarea
              value={instructions}
              maxLength={10000}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Предмет
              <select
                value={subjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setTopicId("");
                }}
              >
                <option value="">Без предмета</option>
                {catalog.map((subject) => (
                  <option value={subject.id} key={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тема
              <select
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
              >
                <option value="">Без темы</option>
                {catalog
                  .find((subject) => subject.id === subjectId)
                  ?.topics.map((topic) => (
                    <option value={topic.id} key={topic.id}>
                      {topic.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Срок
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </label>
            <label>
              Попыток
              <input
                type="number"
                min="1"
                max="20"
                value={attempts}
                onChange={(e) => setAttempts(Number(e.target.value))}
              />
            </label>
          </div>
          {studentIds.length > 0 && (
            <fieldset className="assignment-modes">
              <legend>Индивидуальные сроки (необязательно)</legend>
              {students
                .filter((student) => studentIds.includes(student.id))
                .map((student) => (
                  <label key={student.id}>
                    {student.name}
                    <input
                      type="datetime-local"
                      min={deadline || undefined}
                      value={individualDeadlines[student.id] ?? ""}
                      onChange={(event) =>
                        setIndividualDeadlines((current) => {
                          const next = { ...current };
                          if (event.target.value)
                            next[student.id] = event.target.value;
                          else delete next[student.id];
                          return next;
                        })
                      }
                    />
                  </label>
                ))}
              <small>
                Если поле пустое, действует общий срок. Часовой пояс:{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}.
              </small>
            </fieldset>
          )}
        </section>
        {mode !== "manual" && (
          <section className="panel form-panel">
            <div className="panel-head">
              <h2>Вопросы с автопроверкой</h2>
              <span>{questions.length} балл(а)</span>
            </div>
            {questions.map((question, index) => (
              <article className="builder-item" key={question.id}>
                <div className="panel-head">
                  <h3>Вопрос {index + 1}</h3>
                  <div className="image-actions">
                    <button
                      type="button"
                      aria-label="Поднять вопрос"
                      onClick={() =>
                        setQuestions(move(questions, index, index - 1))
                      }
                    >
                      <ChevronUp />
                    </button>
                    <button
                      type="button"
                      aria-label="Опустить вопрос"
                      onClick={() =>
                        setQuestions(move(questions, index, index + 1))
                      }
                    >
                      <ChevronDown />
                    </button>
                    <button
                      type="button"
                      aria-label="Дублировать вопрос"
                      onClick={() =>
                        setQuestions([
                          ...questions.slice(0, index + 1),
                          {
                            ...question,
                            id: crypto.randomUUID(),
                            answers: [...question.answers],
                          },
                          ...questions.slice(index + 1),
                        ])
                      }
                    >
                      Копия
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить вопрос"
                      disabled={questions.length === 1}
                      onClick={() =>
                        setQuestions(
                          questions.filter((item) => item.id !== question.id),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                <label>
                  Условие
                  <textarea
                    required
                    value={question.prompt}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((item) =>
                          item.id === question.id
                            ? { ...item, prompt: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <fieldset>
                  <legend>Принимаемые ответы</legend>
                  {question.answers.map((answer, answerIndex) => (
                    <div className="answer-input" key={answerIndex}>
                      <input
                        inputMode="decimal"
                        required={answerIndex === 0}
                        value={answer}
                        onChange={(e) =>
                          setQuestions(
                            questions.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    answers: item.answers.map((value, i) =>
                                      i === answerIndex
                                        ? e.target.value
                                        : value,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label="Удалить вариант ответа"
                        disabled={question.answers.length === 1}
                        onClick={() =>
                          setQuestions(
                            questions.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    answers: item.answers.filter(
                                      (_, i) => i !== answerIndex,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <X />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setQuestions(
                        questions.map((item) =>
                          item.id === question.id
                            ? { ...item, answers: [...item.answers, ""] }
                            : item,
                        ),
                      )
                    }
                  >
                    <Plus size={16} /> Добавить вариант
                  </button>
                </fieldset>
              </article>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setQuestions([
                  ...questions,
                  { id: crypto.randomUUID(), prompt: "", answers: [""] },
                ])
              }
            >
              <Plus size={16} /> Добавить вопрос
            </button>
          </section>
        )}
        {mode !== "automatic" && (
          <section className="panel form-panel">
            <div className="panel-head">
              <h2>Фото-решение</h2>
              <span>
                Максимум: {manualTasks.reduce((sum, task) => sum + task.maxPoints, 0)}
              </span>
            </div>
            <p>Для каждой задачи задайте максимум от 1 до 20 баллов.</p>
            {manualTasks.map((task, index) => (
              <article className="builder-item" key={task.id}>
                <div className="panel-head">
                  <h3>Задача {index + 1} · максимум {task.maxPoints}</h3>
                  <div className="image-actions">
                    <button
                      type="button"
                      aria-label="Поднять задачу"
                      onClick={() =>
                        setManualTasks(move(manualTasks, index, index - 1))
                      }
                    >
                      <ChevronUp />
                    </button>
                    <button
                      type="button"
                      aria-label="Опустить задачу"
                      onClick={() =>
                        setManualTasks(move(manualTasks, index, index + 1))
                      }
                    >
                      <ChevronDown />
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить задачу"
                      disabled={manualTasks.length === 1}
                      onClick={() =>
                        setManualTasks(
                          manualTasks.filter((item) => item.id !== task.id),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                <label>
                  Условие
                  <textarea
                    required
                    value={task.prompt}
                    onChange={(e) =>
                      setManualTasks(
                        manualTasks.map((item) =>
                          item.id === task.id
                            ? { ...item, prompt: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Максимальный балл
                  <input
                    type="number"
                    min="1"
                    max="20"
                    required
                    value={task.maxPoints}
                    onChange={(event) =>
                      setManualTasks(
                        manualTasks.map((item) =>
                          item.id === task.id
                            ? { ...item, maxPoints: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </article>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setManualTasks([
                  ...manualTasks,
                  { id: crypto.randomUUID(), prompt: "", maxPoints: 2 },
                ])
              }
            >
              <Plus size={16} /> Добавить задачу
            </button>
          </section>
        )}
        <section className="panel form-panel">
          <h2>Назначить ученикам</h2>
          <div className="student-checkboxes">
            {students.map((student) => (
              <label key={student.id}>
                <input
                  type="checkbox"
                  checked={studentIds.includes(student.id)}
                  onChange={(e) =>
                    setStudentIds(
                      e.target.checked
                        ? [...studentIds, student.id]
                        : studentIds.filter((id) => id !== student.id),
                    )
                  }
                />
                {student.name}
              </label>
            ))}
          </div>
          {!students.length && (
            <p>Сначала добавьте ученика в разделе «Ученики».</p>
          )}
        </section>
        {saved && (
          <p className="save-confirmation" role="status">
            Черновик сохранён. Его можно открыть в предпросмотре.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="sticky-actions">
          <Link className="button secondary" to="/teacher/homework">
            Отмена
          </Link>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const id = await saveHomeworkDraft(
                  draftId,
                  homeworkId || undefined,
                  title,
                  payload(),
                );
                setDraftId(id);
                setSaved(true);
                await queryClient.invalidateQueries({
                  queryKey: ["homework-drafts"],
                });
              } catch {
                setError("Не удалось сохранить черновик.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить черновик
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await saveHomeworkTemplate(title, payload());
                setSaved(true);
                await queryClient.invalidateQueries({
                  queryKey: ["homework-templates"],
                });
              } catch {
                setError("Не удалось сохранить шаблон.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить как шаблон
          </button>
          <button className="button" disabled={!valid || busy}>
            <Save size={17} /> {busy ? "Сохранение…" : "Опубликовать"}
          </button>
          <Link
            className="button secondary"
            to="/teacher/homework/functions/preview"
            state={{
              title,
              mode,
              questions: questions.map(({ prompt }) => ({ prompt })),
              manualTasks: manualTasks.map(({ prompt, maxPoints }) => ({
                prompt,
                maxPoints,
              })),
            }}
          >
            Предпросмотр
          </Link>
          {homeworkId && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await saveHomeworkDraft(
                    undefined,
                    undefined,
                    `${title} — копия`,
                    payload(),
                  );
                  await queryClient.invalidateQueries({
                    queryKey: ["homework-drafts"],
                  });
                  navigate("/teacher/homework/new");
                } catch {
                  setError("Не удалось создать копию.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Дублировать в черновик
            </button>
          )}
          {homeworkId && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await archiveHomework(homeworkId);
                  await queryClient.invalidateQueries({
                    queryKey: ["assignments"],
                  });
                  navigate("/teacher/homework");
                } catch {
                  setError("Не удалось архивировать задание.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Архивировать
            </button>
          )}
        </div>
      </form>
    </>
  );
}

export function TestAttempt() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { assignmentId = "", id = "", attemptId = "" } = useParams();
  const assignmentKey = assignmentId || id || "functions";
  const preview = location.pathname.includes("/teacher/");
  const resultView = location.pathname.includes("/results/");
  const previewState = location.state as {
    title?: string;
    mode?: string;
    questions?: { prompt: string }[];
    manualTasks?: { prompt: string; maxPoints: number }[];
  } | null;
  const { data, isLoading, error } = useAssignment(
    assignmentKey,
    !preview && !resultView,
  );
  const {
    data: resultData,
    isLoading: resultLoading,
    error: resultError,
  } = useAttemptResult(attemptId, resultView);
  const previewQuestions = (previewState?.questions ?? []).map(
    (question, index) => ({
      id: `preview-${index}`,
      prompt: question.prompt,
      position: index + 1,
    }),
  );
  const questions = preview ? previewQuestions : (data?.questions ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(resultView);
  const [submittedScore, setSubmittedScore] = useState<{
    score: number;
    maximum: number;
  } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "offline">(
    "idle",
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (data?.draft) setAnswers(data.draft);
  }, [data]);
  useEffect(() => {
    if (preview || resultView || !data || !Object.keys(answers).length) return;
    setSaving("saving");
    const timer = setTimeout(
      () =>
        saveAttemptDraft(assignmentKey, answers)
          .then(() => setSaving("saved"))
          .catch(() => setSaving("offline")),
      600,
    );
    return () => clearTimeout(timer);
  }, [answers, assignmentKey, data, preview, resultView]);
  useEffect(() => {
    if (preview || resultView) return;
    const sync = () => {
      if (Object.keys(answers).length)
        saveAttemptDraft(assignmentKey, answers)
          .then(() => setSaving("saved"))
          .catch(() => setSaving("offline"));
    };
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [answers, assignmentKey, preview, resultView]);
  const demoResult =
    (isAcceptedAnswer(answers.q1 ?? "", ["7"]) ? 1 : 0) +
    (isAcceptedAnswer(answers.q2 ?? "", ["парабола"]) ? 1 : 0);
  const score = submittedScore ?? {
    score: demoResult,
    maximum: questions.length,
  };
  if (resultView) {
    if (resultLoading)
      return (
        <section className="panel empty" role="status">
          Загрузка результата…
        </section>
      );
    if (resultError || !resultData)
      return (
        <section className="panel empty form-error" role="alert">
          Результат не найден или у вас нет доступа.
        </section>
      );
    const percentage = resultData.maximum_score
      ? Math.round((resultData.score / resultData.maximum_score) * 100)
      : 0;
    const unanswered = resultData.questions.filter(
      (q) => !q.answer.trim(),
    ).length;
    const incorrect =
      resultData.questions.length - resultData.score - unanswered;
    return (
      <>
        <PageTitle
          eyebrow="РЕЗУЛЬТАТ"
          title={`${percentage}% — попытка ${resultData.attempt_number}.`}
        />
        <section className="panel result">
          <strong>
            {resultData.score} из {resultData.maximum_score}
          </strong>
          <p>
            Верно: {resultData.score} · Ошибок: {incorrect} · Без ответа:{" "}
            {unanswered}
          </p>
          <p>
            Лучший результат: {resultData.best_score} · Осталось попыток:{" "}
            {Math.max(
              0,
              resultData.attempts_allowed - resultData.attempts_used,
            )}{" "}
            · Отправлено{" "}
            {new Date(resultData.submitted_at).toLocaleString("ru-RU")} ·{" "}
            {Math.ceil((resultData.duration_seconds || 0) / 60)} мин.
          </p>
          {resultData.questions.map((q) => (
            <article
              className={`answer-review ${q.is_correct ? "correct" : "incorrect"}`}
              key={q.id}
            >
              <b>
                {q.position}. {q.prompt}
              </b>
              <span>
                {q.is_correct ? "Верно" : "Ошибка"}. Ваш ответ:{" "}
                {q.answer || "Нет ответа"}
              </span>
              {!q.is_correct && (
                <span>Принимаемый ответ: {q.accepted_answers.join("; ")}</span>
              )}
            </article>
          ))}
        </section>
      </>
    );
  }
  if (isLoading)
    return (
      <section className="panel empty" role="status">
        Загрузка задания…
      </section>
    );
  if (error)
    return (
      <section className="panel empty form-error" role="alert">
        Не удалось открыть задание.
      </section>
    );
  if (done) {
    const percentage = score.maximum
      ? Math.round((score.score / score.maximum) * 100)
      : 0;
    return (
      <>
        <PageTitle
          eyebrow={preview ? "ПРЕДПРОСМОТР" : "РЕЗУЛЬТАТ"}
          title={`${percentage}% — попытка завершена.`}
        />
        <section className="panel result">
          <strong>
            {score.score} из {score.maximum}
          </strong>
          <p>
            Верных ответов: {score.score}.{" "}
            {preview
              ? "Так ученик увидит итоговый разбор."
              : "Результат сохранён в вашем профиле."}
          </p>
          {questions.map((q) => (
            <div className="answer-review" key={q.id}>
              <b>{q.prompt}</b>
              <span>Ваш ответ: {answers[q.id] || "Нет ответа"}</span>
            </div>
          ))}
        </section>
      </>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow={(
          previewState?.title ??
          data?.title ??
          "ЗАДАНИЕ"
        ).toLocaleUpperCase("ru-RU")}
        title="Решайте внимательно."
      />
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
              <h2>{q.prompt}</h2>
              <label>
                Ваш ответ
                <input
                  disabled={preview}
                  inputMode="decimal"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => {
                    const next = { ...answers, [q.id]: e.target.value };
                    setAnswers(next);
                  }}
                />
              </label>
              <small role="status">
                {saving === "saving"
                  ? "Сохранение…"
                  : saving === "saved"
                    ? "Сохранено"
                    : saving === "offline"
                      ? "Нет соединения — изменения будут отправлены после восстановления"
                      : ""}
              </small>
            </article>
          ))}
          {preview &&
            previewState?.manualTasks?.map((task, index) => (
              <article className="panel question" key={index}>
                <span>
                  Письменная задача {index + 1} · максимум {task.maxPoints}
                </span>
                <h2>{task.prompt}</h2>
                <p>Ученик приложит фотографии решения.</p>
              </article>
            ))}
          {!preview && (
            <button
              className="button finish"
              disabled={submitting}
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setSubmitError("");
                setSubmitting(true);
                try {
                  const userId = data?.studentId ?? "demo";
                  const keyName = `eclipse-submit:v1:${userId}:${assignmentKey}`;
                  const idempotencyKey =
                    localStorage.getItem(keyName) ?? crypto.randomUUID();
                  localStorage.setItem(keyName, idempotencyKey);
                  const result = await submitAttempt(
                    assignmentKey,
                    answers,
                    idempotencyKey,
                  );
                  if (result) {
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["assignments"] }),
                      queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }),
                      queryClient.invalidateQueries({ queryKey: ["assignment-result", assignmentKey] }),
                    ]);
                    setSubmittedScore({
                      score: result.score,
                      maximum: result.maximum_score,
                    });
                    navigate(`/student/homework/${assignmentKey}/result`);
                  } else setDone(true);
                } catch {
                  setSubmitError(
                    "Не удалось отправить попытку. Проверьте срок, число попыток и соединение.",
                  );
                } finally {
                  setSubmitting(false);
                  setConfirming(false);
                }
              }}
            >
              {submitting
                ? "Отправка…"
                : confirming
                  ? `Подтвердить отправку (${Object.values(answers).filter(Boolean).length} из ${questions.length})`
                  : "Завершить попытку"}
            </button>
          )}
          {confirming && !submitting && (
            <button
              className="button secondary"
              onClick={() => setConfirming(false)}
            >
              Продолжить решение
            </button>
          )}
          {submitError && (
            <p className="form-error" role="alert">
              {submitError}
            </p>
          )}
          {preview && (
            <p className="preview-note" role="note">
              Режим преподавателя: ответы и отправка отключены.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

export function AssignmentResultPage() {
  const { assignmentId = "" } = useParams();
  const teacher = useLocation().pathname.startsWith("/teacher");
  const { data, isLoading, error } = useAssignmentResult(assignmentId);
  if (isLoading)
    return <section className="panel empty" role="status">Загрузка результата…</section>;
  if (error || !data)
    return <section className="panel empty form-error" role="alert">Результат не найден или у вас нет доступа.</section>;
  const manualAction = data.status === "returned" ? "Отправить новую версию" : "Загрузить письменное решение";
  return (
    <>
      <PageTitle eyebrow="ИТОГ ЗАДАНИЯ" title={data.title} />
      <section className="panel result">
        {data.automatic_maximum > 0 && (
          <p>Автоматическая часть: <strong>{data.automatic_score} из {data.automatic_maximum}</strong></p>
        )}
        {data.status === "manual_pending" && (
          <p>Письменная часть ещё не отправлена</p>
        )}
        {data.status === "awaiting_review" && (
          <>
            <p>Письменная часть ожидает проверки преподавателем</p>
            <p>Итоговый результат появится после проверки.</p>
          </>
        )}
        {data.status === "returned" && (
          <p>Преподаватель вернул решение на повторную сдачу</p>
        )}
        {data.status === "reviewed" && (
          <>
            <p>Письменная часть: <strong>{data.manual_score} из {data.manual_maximum}</strong></p>
            <strong>Итог: {data.total_score} из {data.total_maximum} · {data.percentage}%</strong>
          </>
        )}
        <p>Использовано попыток: {data.attempts_used} из {data.attempts_allowed}</p>
        {!teacher && ["manual_pending", "returned"].includes(data.status) && (
          <Link className="button" to={`/student/homework/${assignmentId}/photos`}>{manualAction}</Link>
        )}
        {data.best_attempt_id && (
          <Link className="button secondary" to={`/${teacher ? "teacher" : "student"}/results/${data.best_attempt_id}`}>
            Подробный разбор лучшей попытки
          </Link>
        )}
      </section>
    </>
  );
}

export function CalendarPage() {
  const teacher = useLocation().pathname.startsWith("/teacher");
  const queryClient = useQueryClient();
  const { data: students = [] } = useStudents();
  const [creating, setCreating] = useState(false),
    [studentId, setStudentId] = useState(""),
    [startsAt, setStartsAt] = useState(""),
    [endsAt, setEndsAt] = useState(""),
    [zoomUrl, setZoomUrl] = useState(""),
    [weekly, setWeekly] = useState(false),
    [calendarError, setCalendarError] = useState(""),
    [busy, setBusy] = useState(false);
  const lessonDialogRef = useAccessibleDialog(creating, () => setCreating(false));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setCalendarError("");
    try {
      await createLesson({ studentId, startsAt, endsAt, zoomUrl, weekly });
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      setCreating(false);
    } catch {
      setCalendarError(
        "Не удалось создать занятие. Проверьте время, ученика и ссылку.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="РАСПИСАНИЕ"
        title="Неделя в равновесии."
        action={
          teacher ? (
            <button className="button" onClick={() => setCreating(true)}>
              <Plus size={17} /> Добавить занятие
            </button>
          ) : undefined
        }
      />
      <Suspense
        fallback={
          <section className="panel empty">Загрузка календаря…</section>
        }
      >
        <CalendarBoard />
      </Suspense>
      {creating && (
        <div
          ref={lessonDialogRef}
          className="editor-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-title"
          aria-describedby="lesson-description"
        >
          <form className="create-student" onSubmit={submit}>
            <header>
              <h2 id="lesson-title">Новое занятие</h2>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setCreating(false)}
              >
                <X />
              </button>
            </header>
            <p id="lesson-description">
              Выберите ученика, время занятия и параметры повторения.
            </p>
            <div className="create-fields">
              <label className="full">
                Ученик
                <select
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">Выберите ученика</option>
                  {students.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Начало
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
              <label>
                Окончание
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
              <label className="full">
                Ссылка Zoom
                <input
                  type="url"
                  placeholder="Оставьте пустой для ссылки ученика"
                  value={zoomUrl}
                  onChange={(e) => setZoomUrl(e.target.value)}
                />
              </label>
              <label className="full">
                <input
                  type="checkbox"
                  checked={weekly}
                  onChange={(e) => setWeekly(e.target.checked)}
                />{" "}
                Повторять каждую неделю
              </label>
              {calendarError && (
                <p className="form-error full" role="alert">
                  {calendarError}
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
              >
                Отмена
              </button>
              <button className="button" disabled={busy}>
                {busy ? "Сохранение…" : "Создать"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
export function NotificationsPage() {
  const { data = [], isLoading, error, refetch } = useNotifications();
  const queryClient = useQueryClient();
  return (
    <>
      <PageTitle eyebrow="УВЕДОМЛЕНИЯ" title="Ничего важного не потеряется." />
      <section className="panel notifications">
        <button
          className="button secondary mark-read"
          onClick={async () => {
            await markAllNotificationsRead();
            await queryClient.invalidateQueries({
              queryKey: ["notifications"],
            });
          }}
        >
          Отметить всё прочитанным
        </button>
        {isLoading && <p role="status">Загрузка уведомлений…</p>}
        {error && (
          <div className="form-error" role="alert">
            Не удалось загрузить уведомления.{" "}
            <button className="button secondary" onClick={() => void refetch()}>
              Повторить
            </button>
          </div>
        )}
        {data.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            onClick={async () => {
              if (!item.readAt) {
                await markNotificationRead(item.id);
                await queryClient.invalidateQueries({
                  queryKey: ["notifications"],
                });
              }
            }}
            className={
              item.readAt ? "notification-read" : "notification-unread"
            }
          >
            <Task
              title={item.title}
              meta={new Date(item.createdAt).toLocaleString("ru-RU")}
            />
          </Link>
        ))}
        {!isLoading && data.length === 0 && (
          <p className="empty-inline">Уведомлений пока нет.</p>
        )}
      </section>
    </>
  );
}
export function ReviewPage() {
  const { submissionId = "" } = useParams();
  const { data: queue = [], isLoading, error, refetch } = useReviewQueue();
  const [studentFilter, setStudentFilter] = useState("");
  const [homeworkFilter, setHomeworkFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  if (submissionId) return <SubmissionReview submissionId={submissionId} />;
  const filteredQueue = queue.filter(
    (item) =>
      (!studentFilter || item.studentName === studentFilter) &&
      (!homeworkFilter || item.homeworkTitle === homeworkFilter) &&
      (!topicFilter || item.topic === topicFilter) &&
      (!dateFilter || item.submittedAt.slice(0, 10) === dateFilter) &&
      (!overdueOnly || item.overdue) &&
      (!unreviewedOnly || !item.reviewed),
  );
  return (
    <>
      <PageTitle eyebrow="РУЧНАЯ ПРОВЕРКА" title="Внимание к ходу решения." />
      <section className="panel student-filters" aria-label="Фильтры работ">
        <label>
          Ученик
          <select
            value={studentFilter}
            onChange={(event) => setStudentFilter(event.target.value)}
          >
            <option value="">Все ученики</option>
            {[...new Set(queue.map((item) => item.studentName))].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Задание
          <select
            value={homeworkFilter}
            onChange={(event) => setHomeworkFilter(event.target.value)}
          >
            <option value="">Все задания</option>
            {[...new Set(queue.map((item) => item.homeworkTitle))].map(
              (title) => (
                <option key={title}>{title}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Тема
          <select
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
          >
            <option value="">Все темы</option>
            {[...new Set(queue.map((item) => item.topic))].map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <label>
          Дата отправки
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
          />{" "}
          После срока
        </label>
        <label>
          <input
            type="checkbox"
            checked={unreviewedOnly}
            onChange={(event) => setUnreviewedOnly(event.target.checked)}
          />{" "}
          Только непроверенные
        </label>
      </section>
      <section className="panel notifications">
        {isLoading && <p role="status">Загрузка работ…</p>}
        {error && (
          <div className="form-error" role="alert">
            Не удалось загрузить работы.{" "}
            <button className="button secondary" onClick={() => void refetch()}>
              Повторить
            </button>
          </div>
        )}
        {filteredQueue.map((item) => (
          <Link
            key={item.id}
            to={`/teacher/review/${item.id}`}
            className="task"
          >
            <div>
              <b>
                {item.studentName} · {item.homeworkTitle}
              </b>
              <p>
                {item.imageCount} стр. ·{" "}
                {new Date(item.submittedAt).toLocaleString("ru-RU")} ·{" "}
                {new Date(item.submittedAt) <= new Date(item.deadlineAt)
                  ? "в срок"
                  : "после срока"}
              </p>
            </div>
            <span className="status-badge">{item.status}</span>
            <ChevronRight />
          </Link>
        ))}
        {!isLoading && !filteredQueue.length && (
          <p className="empty-inline">Работ по выбранным фильтрам нет.</p>
        )}
      </section>
    </>
  );
}

function SubmissionReview({ submissionId }: { submissionId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useSubmissionDetail(submissionId);
  const [page, setPage] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [returnConfirm, setReturnConfirm] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewRotation, setViewRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (data?.savedScores) setScores(data.savedScores);
  }, [data]);
  if (isLoading)
    return (
      <section className="panel empty" role="status">
        Загрузка решения…
      </section>
    );
  if (error || !data)
    return (
      <section className="panel empty form-error" role="alert">
        Не удалось открыть решение.{" "}
        <button className="button secondary" onClick={() => void refetch()}>
          Повторить
        </button>
      </section>
    );
  const image = data.images[page];
  const downloadZip = async (kind: "original" | "processed") => {
    setBusy(true);
    setMessage("");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await Promise.all(
        data.images.map(async (item, index) => {
          const response = await fetch(
            kind === "original" ? item.originalUrl : item.processedUrl,
          );
          if (!response.ok) throw new Error();
          zip.file(
            kind === "original"
              ? item.originalName
              : `страница-${index + 1}.jpg`,
            await response.blob(),
          );
        }),
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${data.homeworkTitle}-${kind}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Не удалось подготовить архив.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="ПРОВЕРКА"
        title={`${data.studentName} · ${data.homeworkTitle}`}
      />
      {data.previousVersions.length > 0 && (
        <nav
          className="panel student-filters"
          aria-label="Предыдущие версии решения"
        >
          <strong>Предыдущие версии:</strong>
          {data.previousVersions.map((version) => (
            <Link
              className="button secondary"
              key={version.id}
              to={`/teacher/review/${version.id}`}
            >
              Версия {version.version} ·{" "}
              {new Date(version.submittedAt).toLocaleString("ru-RU")}
            </Link>
          ))}
        </nav>
      )}
      <section className="panel review">
        <div className="review-preview">
          {image ? (
            <>
              <img
                src={image.processedUrl}
                alt={`Страница ${page + 1} из ${data.images.length}`}
                style={{
                  transform: `scale(${viewZoom}) rotate(${viewRotation}deg)`,
                }}
              />
              <div className="image-actions">
                <button
                  disabled={page === 0}
                  onClick={() => {
                    setPage(page - 1);
                    setViewZoom(1);
                    setViewRotation(0);
                  }}
                >
                  Назад
                </button>
                <span>
                  {page + 1} / {data.images.length}
                </span>
                <button
                  disabled={page === data.images.length - 1}
                  onClick={() => {
                    setPage(page + 1);
                    setViewZoom(1);
                    setViewRotation(0);
                  }}
                >
                  Далее
                </button>
              </div>
              <div
                className="image-actions"
                aria-label="Управление изображением"
              >
                <button
                  type="button"
                  aria-label="Уменьшить"
                  onClick={() => setViewZoom(Math.max(0.5, viewZoom - 0.25))}
                >
                  −
                </button>
                <span>{Math.round(viewZoom * 100)}%</span>
                <button
                  type="button"
                  aria-label="Увеличить"
                  onClick={() => setViewZoom(Math.min(3, viewZoom + 0.25))}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setViewRotation((viewRotation + 90) % 360)}
                >
                  Повернуть
                </button>
                <button type="button" onClick={() => setFullscreen(true)}>
                  На весь экран
                </button>
              </div>
              <a
                className="button secondary"
                href={image.originalUrl}
                download={image.originalName}
              >
                Скачать оригинал
              </a>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => downloadZip("original")}
              >
                Оригиналы ZIP
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => downloadZip("processed")}
              >
                Обработанные ZIP
              </button>
            </>
          ) : (
            <p>Изображений нет.</p>
          )}
        </div>
        <div>
          <h2>Оценивание</h2>
          {data.tasks.map((task) => (
            <fieldset key={task.id}>
              <legend>
                {task.position}. {task.prompt} · максимум {task.maxPoints} баллов
              </legend>
              <label>
                Баллы
                <input
                  type="number"
                  min="0"
                  max={task.maxPoints}
                  step="1"
                  value={scores[task.id] ?? ""}
                  onChange={(event) =>
                    setScores({
                      ...scores,
                      [task.id]: Number(event.target.value),
                    })
                  }
                />
              </label>
            </fieldset>
          ))}
          <p>
            Письменная часть:{" "}
            {Object.values(scores).reduce((sum, value) => sum + value, 0)} из{" "}
            {data.tasks.reduce((sum, task) => sum + task.maxPoints, 0)}
          </p>
          <button
            className="button"
            disabled={
              busy ||
              data.tasks.some(
                (task) =>
                  !Number.isInteger(scores[task.id]) ||
                  scores[task.id] < 0 ||
                  scores[task.id] > task.maxPoints,
              )
            }
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await gradeSubmission(submissionId, scores);
                await queryClient.invalidateQueries({
                  queryKey: ["review-queue"],
                });
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["assignments"] }),
                  queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] }),
                  queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                ]);
                navigate("/teacher/review");
              } catch {
                setMessage("Не удалось сохранить оценку.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Сохранение…" : "Завершить проверку"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              busy ||
              Object.keys(scores).length === 0 ||
              data.tasks.some(
                (task) =>
                  scores[task.id] !== undefined &&
                  (!Number.isInteger(scores[task.id]) ||
                    scores[task.id] < 0 ||
                    scores[task.id] > task.maxPoints),
              )
            }
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await saveSubmissionReview(submissionId, scores);
                setMessage("Черновик оценки сохранён.");
              } catch {
                setMessage("Не удалось сохранить черновик оценки.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить и продолжить позже
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (!returnConfirm) {
                setReturnConfirm(true);
                return;
              }
              setBusy(true);
              setMessage("");
              try {
                await returnSubmission(submissionId);
                await queryClient.invalidateQueries({
                  queryKey: ["review-queue"],
                });
                navigate("/teacher/review");
              } catch {
                setMessage("Не удалось вернуть работу на повторную сдачу.");
              } finally {
                setBusy(false);
                setReturnConfirm(false);
              }
            }}
          >
            {returnConfirm ? "Подтвердить возврат" : "Вернуть на пересдачу"}
          </button>
          {returnConfirm && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setReturnConfirm(false)}
            >
              Отмена
            </button>
          )}
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
        </div>
      </section>
      {fullscreen && image && (
        <FullscreenImageDialog
          src={image.processedUrl}
          alt={`Страница ${page + 1} из ${data.images.length}`}
          transform={`scale(${viewZoom}) rotate(${viewRotation}deg)`}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
export function PhotoSubmission() {
  const { assignmentId = "" } = useParams();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<
    {
      file: File;
      url: string;
      rotation: number;
      width: number;
      height: number;
      processedBlob: Blob | null;
      cropMetadata: Record<string, number>;
    }[]
  >([]);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<number, string>>({});
  const [preparedFiles, setPreparedFiles] = useState<
    {
      original: File;
      processed: Blob;
      thumbnail: Blob;
      width: number;
      height: number;
      rotation: number;
      crop: Record<string, number>;
    }[] | null
  >(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => setPreparedFiles(null), [files]);
  useEffect(
    () => () =>
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );
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
              const valid = selected.filter(validateImage);
              if (valid.length !== selected.length)
                setUploadError(
                  "Некоторые файлы пропущены: разрешены изображения до 20 МБ.",
                );
              setProcessing(true);
              try {
                setFiles([
                  ...files,
                  ...(await Promise.all(valid.map(imageInfo))),
                ]);
              } catch {
                setUploadError(
                  "Не удалось подготовить HEIC. Попробуйте JPG или PNG.",
                );
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
                  <button
                    type="button"
                    aria-label={`Открыть страницу ${i + 1} на весь экран`}
                    onClick={() => setPreviewing(i)}
                  >
                    <img
                      src={item.url}
                      alt={`Страница ${i + 1}`}
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  </button>
                </div>
                <b>Страница {i + 1}</b>
                <small>{(item.file.size / 1024 / 1024).toFixed(1)} МБ</small>
                {progress[i] && <small role="status">{progress[i]}</small>}
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
                  <label className="icon-file" aria-label="Заменить страницу">
                    <ImagePlus />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={async (e) => {
                        const replacement = e.target.files?.[0];
                        e.target.value = "";
                        if (!replacement || !validateImage(replacement)) {
                          setUploadError("Файл не поддерживается или превышает 20 МБ.");
                          return;
                        }
                        try {
                          const next = await imageInfo(replacement);
                          URL.revokeObjectURL(item.url);
                          setFiles(
                            files.map((value, index) =>
                              index === i ? next : value,
                            ),
                          );
                        } catch {
                          setUploadError("Не удалось заменить изображение.");
                        }
                      }}
                    />
                  </label>
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
          disabled={!files.length || uploading || !assignmentId}
          onClick={async () => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            setUploading(true);
            setUploadError("");
            try {
              const prepared =
                preparedFiles ??
                (await Promise.all(files.map(async (item) => {
                  const [processed, thumbnail] = await Promise.all([
                    renderImage(item.url, item.rotation, 2200),
                    renderImage(item.url, item.rotation, 480),
                  ]);
                  return {
                    original: item.file,
                    processed: processed.blob,
                    thumbnail: thumbnail.blob,
                    width: processed.width,
                    height: processed.height,
                    rotation: item.rotation,
                    crop: item.cropMetadata,
                  };
                })));
              if (!preparedFiles) setPreparedFiles(prepared);
              await uploadManualSubmission(
                assignmentId,
                prepared,
                (index, state) =>
                  setProgress((value) => ({
                    ...value,
                    [index]:
                      state === "uploading"
                        ? "Загрузка…"
                        : state === "done"
                          ? "Загружено"
                          : "Ошибка",
                  })),
              );
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["assignments"] }),
                queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }),
                queryClient.invalidateQueries({ queryKey: ["assignment-result", assignmentId] }),
              ]);
              setSent(true);
            } catch {
              setUploadError(
                "Не удалось отправить все страницы. Загруженные части очищены — можно повторить.",
              );
              setProgress({});
            } finally {
              setUploading(false);
              setConfirming(false);
            }
          }}
        >
          {uploading
            ? "Отправка…"
            : confirming
              ? `Подтвердить отправку ${files.length} стр.`
              : "Отправить решение"}
        </button>
        {confirming && !uploading && (
          <button
            className="button secondary"
            onClick={() => setConfirming(false)}
          >
            Отмена
          </button>
        )}
        {uploadError && (
          <p className="form-error" role="alert">
            {uploadError}
          </p>
        )}
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
                  index === editing
                    ? {
                        ...item,
                        url,
                        processedBlob: blob,
                        cropMetadata: { edited: 1 },
                        rotation: 0,
                      }
                    : item,
                ),
              );
              URL.revokeObjectURL(old);
              setEditing(null);
            }}
          />
        </Suspense>
      )}
      {previewing !== null && files[previewing] && (
        <FullscreenImageDialog
          src={files[previewing].url}
          alt={`Страница ${previewing + 1}`}
          transform={`rotate(${files[previewing].rotation}deg)`}
          onClose={() => setPreviewing(null)}
        />
      )}
    </>
  );
}
export function SimplePage({ title }: { title: string }) {
  const { data, isLoading, error } = useCurrentProfile();
  return (
    <>
      <PageTitle eyebrow="ECLIPSE" title={title} />
      <section className="panel form-panel">
        {isLoading && <p role="status">Загрузка профиля…</p>}
        {error && (
          <p className="form-error" role="alert">
            Не удалось загрузить профиль.
          </p>
        )}
        {data && (
          <>
            <CircleUserRound size={36} />
            <h2>
              {data.firstName} {data.lastName}
            </h2>
            <p>
              Логин: <b>{data.username}</b>
            </p>
            <p>Класс: {data.className}</p>
            <p>
              Статус: {data.status === "active" ? "Активен" : "Архивирован"}
            </p>
          </>
        )}
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
