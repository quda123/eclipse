import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LockKeyhole,
} from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { currentRole, signInWithUsername } from "./lib/auth";
import { supabase } from "./lib/supabase";
import "./App.css";
import {
  CalendarPage,
  HomeworkBuilder,
  HomeworkList,
  NotificationsPage,
  PhotoSubmission,
  PortalLayout,
  ReviewPage,
  SimplePage,
  StudentDetail,
  StudentsPage,
  TeacherDashboard,
  TestAttempt,
} from "./Portal";

const video =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";

function Landing() {
  const root = useRef<HTMLElement>(null);
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
    <main className="landing" ref={root}>
      <video
        className="hero-video"
        autoPlay
        loop
        muted
        playsInline
        poster="/eclipse-poster.jpg"
      >
        <source src={video} type="video/mp4" />
      </video>
      <div className="hero-shade" />
      <nav className="nav">
        <Link className="logo" to="/">
          Eclipse<sup>®</sup>
        </Link>
        <div className="nav-links">
          <a href="#features">Возможности</a>
          <a href="#about">О платформе</a>
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
      <section id="features" className="features">
        <p className="eyebrow">Всё важное - на своём месте</p>
        <div className="feature-grid">
          <article>
            <CalendarDays />
            <h2>Ритм занятий</h2>
            <p>Расписание, ссылки на уроки и напоминания без лишних чатов.</p>
          </article>
          <article>
            <CheckCircle2 />
            <h2>Ясные задания</h2>
            <p>
              Тесты проверяются сразу, а рукописные решения легко отправить с
              телефона.
            </p>
          </article>
          <article>
            <Clock3 />
            <h2>Заметный прогресс</h2>
            <p>Результаты и темы складываются в понятную картину роста.</p>
          </article>
        </div>
      </section>
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
        <div className="demo-logins">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("eclipse-demo-role", "teacher");
              navigate("/teacher");
            }}
          >
            Демо преподавателя
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("eclipse-demo-role", "student");
              navigate("/student");
            }}
          >
            Демо ученика
          </button>
        </div>
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
  useEffect(() => {
    const demo = localStorage.getItem("eclipse-demo-role");
    if (demo) {
      setAllowed(demo === role);
      return;
    }
    currentRole().then((value) =>
      setAllowed(
        role === "teacher"
          ? value === "teacher" || value === "owner"
          : value === "student",
      ),
    );
  }, [role]);
  if (allowed === null)
    return (
      <main className="login-page">
        <span>Загрузка…</span>
      </main>
    );
  return allowed ? children : <Navigate to="/login" replace />;
}

function ChangePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <form
        className="login-card liquid-glass"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password.length < 8) {
            setError("Минимум 8 символов");
            return;
          }
          if (supabase) {
            const { error: authError } = await supabase.auth.updateUser({
              password,
            });
            if (authError) {
              setError("Не удалось изменить пароль");
              return;
            }
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user)
              await supabase
                .from("profiles")
                .update({ must_change_password: false })
                .eq("id", user.id);
          }
          navigate("/student");
        }}
      >
        <LockKeyhole />
        <p className="eyebrow">БЕЗОПАСНОСТЬ</p>
        <h1>Новый пароль.</h1>
        <p>Временный пароль больше использоваться не будет.</p>
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
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="cta">Сохранить пароль</button>
      </form>
    </main>
  );
}

function StudentDashboard() {
  return (
    <>
      <header className="student-welcome">
        <p className="eyebrow">ДОБРЫЙ ДЕНЬ, ИВАН</p>
        <h1>
          Сегодня можно
          <br />
          <em>сделать важное.</em>
        </h1>
      </header>
      <section className="dashboard-grid">
        <article className="next-lesson">
          <p className="eyebrow">БЛИЖАЙШЕЕ ЗАНЯТИЕ</p>
          <h2>Линейные уравнения</h2>
          <p>Сегодня, 18:00 · 50 минут</p>
          <a
            className="cta"
            href="https://zoom.us"
            target="_blank"
            rel="noreferrer"
          >
            Подключиться к Zoom <ArrowRight size={18} />
          </a>
        </article>
        <article>
          <p className="eyebrow">ДОМАШНЕЕ ЗАДАНИЕ</p>
          <h2>Функции и графики</h2>
          <p>Сдать до 15 июля, 23:59</p>
          <Link to="/student/homework/functions" className="text-link">
            Открыть задание <ArrowRight size={16} />
          </Link>
        </article>
        <article>
          <p className="eyebrow">ВАШ ПРОГРЕСС</p>
          <strong>
            84<small>%</small>
          </strong>
          <p>Средний результат за месяц</p>
        </article>
      </section>
    </>
  );
}

export default function App() {
  return (
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
        <Route path="review" element={<ReviewPage />} />
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
  );
}
