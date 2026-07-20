import { ArrowRight, ChevronRight, LockKeyhole } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { useCurrentProfile, useStudentDashboard, useStudentTeachers } from "./lib/data";
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
const StudentTeachersPage = portalComponent("StudentTeachersPage");
const StudentsPage = portalComponent("StudentsPage");
const TeacherDashboard = portalComponent("TeacherDashboard");
const TestAttempt = portalComponent("TestAttempt");
const AssignmentResultPage = portalComponent("AssignmentResultPage");

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
  const [searchParams] = useSearchParams();
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
            const returnTo = searchParams.get("returnTo");
            navigate(
              returnTo?.startsWith("/invite/") ? returnTo : session.profile.must_change_password
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
        <p>Введите логин или электронную почту и пароль для входа.</p>
        <label>
          Логин или email
          <input
            name="username"
            autoComplete="username"
            required
            placeholder="Введите логин или email"
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

async function invitationHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

type InvitationInfo = { state: "pending" | "accepted" | "expired" | "revoked" | "not_found"; teacherName?: string; organizationName?: string; subject?: string; expiresAt?: string };

function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [mode, setMode] = useState<"choice" | "register">("choice");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase || !token) return setInfo({ state: "not_found" });
      const hash = await invitationHash(token);
      const [{ data, error: loadError }, { data: auth }] = await Promise.all([
        supabase.rpc("inspect_student_invitation", { p_token_hash: hash }),
        supabase.auth.getUser(),
      ]);
      if (active) {
        setInfo(loadError ? { state: "not_found" } : data as InvitationInfo);
        setAuthenticated(Boolean(auth.user));
      }
    })();
    return () => { active = false; };
  }, [token]);
  const accept = async () => {
    if (!supabase) return;
    setBusy(true); setError("");
    const { data, error: acceptError } = await supabase.rpc("accept_student_invitation", { p_token_hash: await invitationHash(token) });
    setBusy(false);
    if (acceptError) {
      const message = acceptError.message;
      setError(message.includes("teacher_cannot_accept") ? "Аккаунт преподавателя нельзя подключить как ученика." : message.includes("already_connected") ? "Вы уже подключены к этому преподавателю." : "Не удалось принять приглашение.");
      return;
    }
    setNotice(`Вы присоединились к преподавателю ${data.teacherName}.`);
    setTimeout(() => navigate("/student", { replace: true }), 700);
  };
  if (!info) return <main className="invite-page"><section className="invite-card">Проверяем приглашение…</section></main>;
  if (info.state !== "pending") {
    const states = { accepted: "Это приглашение уже принято.", expired: "Срок действия приглашения истёк.", revoked: "Приглашение отозвано преподавателем.", not_found: "Приглашение не найдено." };
    return <main className="invite-page"><section className="invite-card"><Link className="logo" to="/">Eclipse<sup>®</sup></Link><h1>Приглашение недоступно</h1><p>{states[info.state]}</p><Link className="button" to="/login">Перейти ко входу</Link></section></main>;
  }
  return <main className="invite-page"><section className="invite-card">
    <Link className="logo" to="/">Eclipse<sup>®</sup></Link>
    <p className="eyebrow">ПЕРСОНАЛЬНОЕ ПРИГЛАШЕНИЕ</p>
    <h1>{info.teacherName} приглашает вас присоединиться</h1>
    <p>к пространству «{info.organizationName}» · {info.subject}.</p>
    {info.expiresAt && <small>Действует до {new Date(info.expiresAt).toLocaleString("ru-RU")}</small>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {authenticated ? <button className="button" disabled={busy} onClick={accept}>{busy ? "Подключаем…" : "Принять приглашение"}</button> : mode === "choice" ? <div className="invite-actions">
      <button className="button" onClick={() => setMode("register")}>Создать аккаунт</button>
      <Link className="button secondary" to={`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Уже есть аккаунт? Войти</Link>
    </div> : <InviteRegistration token={token} teacherName={info.teacherName ?? "преподавателю"} onError={setError} />}
  </section></main>;
}

function InviteRegistration({ token, teacherName, onError }: { token: string; teacherName: string; onError: (value: string) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return <form className="invite-form" onSubmit={async (event) => {
    event.preventDefault(); onError("");
    const form = new FormData(event.currentTarget); const password = String(form.get("password"));
    if (password !== String(form.get("confirmation"))) return onError("Пароли не совпадают.");
    if (password.length < 8) return onError("Пароль должен содержать не менее 8 символов.");
    if (!supabase) return onError("Supabase не настроен.");
    setBusy(true);
    const email = String(form.get("email")).trim().toLocaleLowerCase("ru-RU");
    const username = String(form.get("username")).trim().toLocaleLowerCase("ru-RU");
    const tokenHash = await invitationHash(token);
    const { data: conflict, error: conflictError } = await supabase.rpc("invitation_registration_conflict", { p_token_hash: tokenHash, p_email: email, p_username: username });
    if (conflictError || conflict) {
      setBusy(false);
      onError(conflict === "email_registered" ? "Этот адрес электронной почты уже зарегистрирован. Войдите в существующий аккаунт, чтобы принять приглашение." : conflict === "username_taken" ? "Этот логин уже занят. Выберите другой." : "Приглашение больше недоступно.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/invite/${token}`, data: {
      invitation_token_hash: tokenHash, username, first_name: String(form.get("firstName")).trim(), last_name: String(form.get("lastName")).trim()
    } } });
    setBusy(false);
    if (error) {
      const text = error.message.toLowerCase();
      onError(text.includes("username") || text.includes("duplicate key") ? "Этот логин уже занят. Выберите другой." : text.includes("already") || text.includes("registered") ? "Этот адрес электронной почты уже зарегистрирован. Войдите в существующий аккаунт, чтобы принять приглашение." : "Не удалось создать аккаунт. Проверьте введённые данные.");
      return;
    }
    if (data.session) navigate("/student", { replace: true });
    else onError(`Проверьте почту и подтвердите адрес. После входа приглашение ${teacherName} уже будет принято.`);
  }}>
    <div className="invite-name-row"><label>Имя<input name="firstName" required maxLength={80} /></label><label>Фамилия<input name="lastName" required maxLength={80} /></label></div>
    <label>Электронная почта<input name="email" type="email" autoComplete="email" required /></label>
    <label>Логин<input name="username" autoComplete="username" required minLength={3} maxLength={40} pattern="[A-Za-zА-Яа-яЁё0-9_.-]+" /></label>
    <label>Пароль<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
    <label>Повторите пароль<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} /></label>
    <p className="password-help">Не менее 8 символов. Используйте буквы, цифры и специальный знак.</p>
    <button className="button" disabled={busy}>{busy ? "Создаём аккаунт…" : "Создать аккаунт"}</button>
  </form>;
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
    const protectRestoredPage = () => {
      if (sessionStorage.getItem("eclipse:signed-out")) setAllowed(false);
    };
    window.addEventListener("pageshow", protectRestoredPage);
    return () => window.removeEventListener("pageshow", protectRestoredPage);
  }, []);
  useEffect(() => {
    let active = true;
    const demo = getDemoRole();
    if (demo) {
      setAllowed(demo === role);
      return;
    }
    currentRole()
      .catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return currentRole();
      })
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
  const [teacherFilter, setTeacherFilter] = useState("all");
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useCurrentProfile();
  const { data: teachers = [] } = useStudentTeachers();
  const { data, isLoading, error } = useStudentDashboard(teacherFilter === "all" ? undefined : teacherFilter);
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
      {teachers.length > 1 && <div className="student-filters dashboard-filter"><label>Преподаватель<select aria-label="Фильтр кабинета по преподавателю" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="all">Все преподаватели</option>{teachers.map((teacher) => <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.teacherName}</option>)}</select></label></div>}
      <section className="dashboard-grid">
        <article className="next-lesson">
          <p className="eyebrow">БЛИЖАЙШЕЕ ЗАНЯТИЕ</p>
          {lesson && lessonStart ? (
            <>
              <h2>
                {lesson.status === "moved"
                  ? "Занятие перенесено"
                  : lesson.subject || "Занятие"}
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
              <p>{lesson.teacherName} · {lesson.organizationName}</p>
              {lesson.zoomUrl && /^https:\/\//i.test(lesson.zoomUrl) && (
                <a
                  className="cta"
                  href={lesson.zoomUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Подключиться к видеоуроку <ArrowRight size={18} />
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
              <p>{assignment.teacherName} · {assignment.subject} · {assignment.organizationName}</p>
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
        <Route path="/invite/:token" element={<InvitePage />} />
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
          <Route path="homework/:assignmentId/result" element={<AssignmentResultPage />} />
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
          <Route path="homework/:assignmentId/result" element={<AssignmentResultPage />} />
          <Route
            path="homework/:assignmentId/photos"
            element={<PhotoSubmission />}
          />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="teachers" element={<StudentTeachersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<SimplePage title="Ваш профиль" />} />
        </Route>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
