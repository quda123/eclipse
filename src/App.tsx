import { ArrowRight, ChevronRight, LockKeyhole } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { gsap } from "gsap";
import { currentRole, signInWithUsername } from "./lib/auth";
import { getDemoRole, setDemoRole } from "./lib/demo";
import { supabase } from "./lib/supabase";
import { SeamlessBackgroundVideo } from "./SeamlessBackgroundVideo";
import { ProductShowcases } from "./ProductShowcases";
import { useCurrentProfile, useStudentDashboard } from "./lib/data";
import "./App.css";
const portalComponent = <K extends keyof typeof import("./Portal")>(name: K) =>
  lazy(() => import("./Portal").then((module) => ({ default: module[name] })));
const CalendarPage = portalComponent("CalendarPage");
const HomeworkBuilder = portalComponent("HomeworkBuilder");
const HomeworkList = portalComponent("HomeworkList");
const NotificationsPage = portalComponent("NotificationsPage");
const PhotoSubmission = portalComponent("PhotoSubmission");
const PortalLayout = portalComponent("PortalLayout");
const ReviewPage = portalComponent("ReviewPage");
const SimplePage = portalComponent("SimplePage");
const StudentDetail = portalComponent("StudentDetail");
const StudentsPage = portalComponent("StudentsPage");
const TeacherDashboard = portalComponent("TeacherDashboard");
const TestAttempt = portalComponent("TestAttempt");

const video =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";

function Landing() {
  const root = useRef<HTMLElement>(null);
  const scrollToSection = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.querySelector(event.currentTarget.hash);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    history.replaceState(null, "", event.currentTarget.hash);
  };
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !root.current)
      return;
    const context = gsap.context(() => {
      gsap.from(".nav", {
        opacity: 0,
        y: -12,
        duration: 0.65,
        ease: "power2.out",
      });
      gsap.from(".hero-content > *", {
        opacity: 0,
        y: 24,
        duration: 0.8,
        stagger: 0.11,
        ease: "power3.out",
        delay: 0.12,
      });
    }, root);
    return () => context.revert();
  }, []);
  return (
    <main className="landing" id="top" ref={root}>
      <SeamlessBackgroundVideo
        src={video}
        crossfadeDuration={1.2}
        className="hero-video"
      />
      <nav className="nav">
        <Link className="logo" to="/">
          Eclipse<sup>®</sup>
        </Link>
        <div className="nav-links">
          <a href="#top" onClick={scrollToSection}>
            Главная
          </a>
          <a href="#features" onClick={scrollToSection}>
            Возможности
          </a>
          <a href="#about" onClick={scrollToSection}>
            О платформе
          </a>
          <Link className="login-link" to="/login">
            Войти <ArrowRight size={15} />
          </Link>
        </div>
      </nav>
      <section className="hero-content" aria-labelledby="hero-title">
        <p className="eyebrow">ПРОСТРАНСТВО ДЛЯ МАТЕМАТИКИ</p>
        <h1 id="hero-title">
          Учись глубже.
          <br />
          <em>Видь прогресс</em> яснее.
        </h1>
        <p className="hero-copy">
          Eclipse объединяет домашние задания, занятия, результаты и личный
          прогресс в одном спокойном учебном пространстве.
        </p>
        <Link className="cta liquid-glass" to="/login">
          Войти в Eclipse <ArrowRight size={18} />
        </Link>
      </section>
      <div className="hero-footer">
        <span>Платформа для внимательного обучения</span>
        <span className="scroll">
          Листайте вниз <ChevronRight size={15} />
        </span>
      </div>
      <ProductShowcases />
      <footer id="about">
        <span className="logo">
          Eclipse<sup>®</sup>
        </span>
        <span>Спокойно учиться. Уверенно двигаться дальше.</span>
      </footer>
    </main>
  );
}

function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <Link className="logo login-logo" to="/">
        Eclipse<sup>®</sup>
      </Link>
      <form
        className="login-card liquid-glass"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const form = new FormData(e.currentTarget);
          try {
            const session = await signInWithUsername(
              String(form.get("username")),
              String(form.get("password")),
            );
            navigate(
              session.profile.must_change_password
                ? "/change-password"
                : session.role === "student"
                  ? "/student"
                  : "/teacher",
            );
          } catch (value) {
            setError(
              value instanceof Error ? value.message : "Не удалось войти",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <LockKeyhole size={20} />
        <p className="eyebrow">ВХОД В ПРОСТРАНСТВО</p>
        <h1>С возвращением.</h1>
        <p>Введите логин и пароль, которые дал преподаватель.</p>
        <label>
          Логин
          <input
            name="username"
            autoComplete="username"
            required
            placeholder="например, ivan.petrov"
          />
        </label>
        <label>
          Пароль
          <input
            name="password"
            autoComplete="current-password"
            required
            type="password"
            placeholder="••••••••"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="cta" type="submit" disabled={busy}>
          {busy ? "Входим…" : "Продолжить"} <ArrowRight size={18} />
        </button>
        {import.meta.env.DEV && (
          <div className="demo-logins">
            <button
              type="button"
              onClick={() => {
                setDemoRole("teacher");
                navigate("/teacher");
              }}
            >
              Демо преподавателя
            </button>
            <button
              type="button"
              onClick={() => {
                setDemoRole("student");
                navigate("/student");
              }}
            >
              Демо ученика
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

function RoleGuard({
  role,
  children,
}: {
  role: "teacher" | "student";
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setMessage("");
        setAllowed(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    const demo = getDemoRole();
    if (demo) {
      setAllowed(demo === role);
      return;
    }
    currentRole()
      .then((value) => {
        if (!active) return;
        if (value === "archived") setMessage("Аккаунт архивирован");
        if (value === "password_change") setMessage("password_change");
        setAllowed(
          role === "teacher"
            ? value === "teacher" || value === "owner"
            : value === "student",
        );
      })
      .catch(() => {
        if (active) {
          setMessage("Не удалось проверить доступ. Проверьте соединение.");
          setAllowed(false);
        }
      });
    return () => {
      active = false;
    };
  }, [role]);
  if (allowed === null)
    return (
      <main className="login-page">
        <span>Загрузка…</span>
      </main>
    );
  if (!allowed && message === "password_change")
    return <Navigate to="/change-password" replace />;
  if (!allowed && message)
    return (
      <main className="login-page">
        <p className="form-error" role="alert">
          {message}
        </p>
        <Link className="cta" to="/login">
          Вернуться ко входу
        </Link>
      </main>
    );
  return allowed ? children : <Navigate to="/login" replace />;
}

function ChangePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  return (
    <main className="login-page">
      <form
        className="login-card liquid-glass"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (password.length < 8) {
            setError("Минимум 8 символов");
            return;
          }
          if (password !== confirmation) {
            setError("Пароли не совпадают");
            return;
          }
          if (!supabase) {
            setError("Supabase не настроен");
            return;
          }
          setBusy(true);
          try {
            const { error: authError } = await supabase.auth.updateUser({
              password,
            });
            if (authError) {
              setError("Не удалось изменить пароль");
              throw new Error("Не удалось изменить пароль");
            }
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Сессия завершена. Войдите снова.");
            const { error: profileError } = await supabase
              .from("profiles")
              .update({ must_change_password: false })
              .eq("id", user.id);
            if (profileError)
              throw new Error(
                "Пароль изменён, но профиль не обновлён. Обратитесь к преподавателю.",
              );
            const role = await currentRole();
            setSuccess(true);
            setTimeout(
              () =>
                navigate(role === "student" ? "/student" : "/teacher", {
                  replace: true,
                }),
              500,
            );
          } catch (value) {
            setError(
              value instanceof Error
                ? value.message
                : "Не удалось изменить пароль",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <LockKeyhole />
        <p className="eyebrow">БЕЗОПАСНОСТЬ</p>
        <h1>Новый пароль.</h1>
        <p>Временный пароль больше использоваться не будет.</p>
        <p className="password-help">
          Не менее 8 символов. Используйте буквы, цифры и специальный знак.
        </p>
        <label>
          Новый пароль
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Повторите пароль
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && <p role="status">Пароль сохранён. Перенаправляем…</p>}
        <button className="cta" disabled={busy || success}>
          {busy ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </main>
  );
}

function StudentDashboard() {
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useCurrentProfile();
  const { data, isLoading, error } = useStudentDashboard();
  if (profileLoading || isLoading)
    return (
      <section className="panel empty" role="status">
        Загрузка кабинета…
      </section>
    );
  if (profileError || error || !profile || !data)
    return (
      <section className="panel empty form-error" role="alert">
        Не удалось загрузить кабинет. Проверьте соединение и повторите попытку.
      </section>
    );
  const lesson = data.nextLesson;
  const assignment = data.nextAssignment;
  const lessonStart = lesson ? new Date(lesson.startsAt) : null;
  const duration = lesson
    ? Math.round(
        (new Date(lesson.endsAt).getTime() -
          new Date(lesson.startsAt).getTime()) /
          60000,
      )
    : 0;
  return (
    <>
      <header className="student-welcome">
        <p className="eyebrow">
          ДОБРЫЙ ДЕНЬ, {profile.firstName.toLocaleUpperCase("ru-RU")}
        </p>
        <h1>
          Сегодня можно
          <br />
          <em>сделать важное.</em>
        </h1>
      </header>
      <section className="dashboard-grid">
        <article className="next-lesson">
          <p className="eyebrow">БЛИЖАЙШЕЕ ЗАНЯТИЕ</p>
          {lesson && lessonStart ? (
            <>
              <h2>
                {lesson.status === "moved"
                  ? "Занятие перенесено"
                  : "Математика"}
              </h2>
              <p>
                {lessonStart.toLocaleString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {duration} минут
              </p>
              {lesson.zoomUrl && /^https:\/\//i.test(lesson.zoomUrl) && (
                <a
                  className="cta"
                  href={lesson.zoomUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Подключиться к Zoom <ArrowRight size={18} />
                </a>
              )}
            </>
          ) : (
            <>
              <h2>Ближайших занятий нет</h2>
              <p>
                Новое занятие появится здесь после назначения преподавателем.
              </p>
            </>
          )}
        </article>
        <article>
          <p className="eyebrow">ДОМАШНЕЕ ЗАДАНИЕ</p>
          {assignment ? (
            <>
              <h2>{assignment.title}</h2>
              <p>Сдать до {assignment.deadline}</p>
              <Link
                to={
                  assignment.mode === "manual"
                    ? `/student/homework/${assignment.id}/photos`
                    : `/student/homework/${assignment.id}`
                }
                className="text-link"
              >
                Открыть задание <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <h2>Активных заданий нет</h2>
              <p>Можно спокойно повторить пройденный материал.</p>
            </>
          )}
        </article>
        <article>
          <p className="eyebrow">ВАШ ПРОГРЕСС</p>
          <strong>
            {data.average}
            <small>%</small>
          </strong>
          <p>
            Средний результат · выполнено {data.completionRate}% · просрочено{" "}
            {data.overdueCount}
          </p>
        </article>
      </section>
    </>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <main className="route-state" role="status">
          Загрузка…
        </main>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/teacher"
          element={
            <RoleGuard role="teacher">
              <PortalLayout role="teacher" />
            </RoleGuard>
          }
        >
          <Route index element={<TeacherDashboard />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:studentId" element={<StudentDetail />} />
          <Route path="homework" element={<HomeworkList />} />
          <Route path="homework/new" element={<HomeworkBuilder />} />
          <Route path="homework/:id/edit" element={<HomeworkBuilder />} />
          <Route path="homework/:id/preview" element={<TestAttempt />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="review/:submissionId" element={<ReviewPage />} />
          <Route path="results/:attemptId" element={<TestAttempt />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SimplePage title="Настройки" />} />
        </Route>
        <Route
          path="/student"
          element={
            <RoleGuard role="student">
              <PortalLayout role="student" />
            </RoleGuard>
          }
        >
          <Route index element={<StudentDashboard />} />
          <Route path="homework" element={<HomeworkList student />} />
          <Route path="homework/:assignmentId" element={<TestAttempt />} />
          <Route path="results/:attemptId" element={<TestAttempt />} />
          <Route
            path="homework/:assignmentId/photos"
            element={<PhotoSubmission />}
          />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<SimplePage title="Ваш профиль" />} />
        </Route>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
