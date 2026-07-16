import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getDemoRole } from "./demo";

export type StudentCard = {
  id: string;
  name: string;
  className: string;
  topic: string;
  result: number;
  overdue: number;
  activity: string;
  username?: string;
  status?: string;
  zoomUrl?: string | null;
};
export const demoStudents: StudentCard[] = [
  {
    id: "anna",
    name: "Анна Волкова",
    className: "8 класс",
    topic: "Линейные уравнения",
    result: 92,
    overdue: 0,
    activity: "12 минут назад",
  },
  {
    id: "max",
    name: "Максим Орлов",
    className: "7 класс",
    topic: "Дроби",
    result: 74,
    overdue: 2,
    activity: "вчера",
  },
  {
    id: "sofia",
    name: "София Лебедева",
    className: "9 класс",
    topic: "Функции",
    result: 86,
    overdue: 1,
    activity: "2 часа назад",
  },
];

async function fetchStudents(): Promise<StudentCard[]> {
  if (getDemoRole()) return demoStudents;
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("teacher_student_summary");
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      class_name: string | null;
      subject: string;
      average_result: number;
      overdue_count: number;
      last_activity: string;
      username: string;
      status: string;
      default_zoom_url: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    className: row.class_name ?? "—",
    topic: row.subject,
    result: row.average_result,
    overdue: row.overdue_count,
    activity: new Date(row.last_activity).toLocaleString("ru-RU"),
    username: row.username,
    status: row.status,
    zoomUrl: row.default_zoom_url,
  }));
}
export const useStudents = () =>
  useQuery({ queryKey: ["students"], queryFn: fetchStudents });
export type CatalogSubject = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};
async function fetchCatalog(): Promise<CatalogSubject[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("subjects")
    .select("id,name,topics(id,name)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((subject) => ({
    id: subject.id,
    name: subject.name,
    topics: [...(subject.topics ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    ),
  }));
}
export const useCatalog = () =>
  useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });
export type HomeworkDraftPayload = {
  mode: "automatic" | "manual" | "combined";
  instructions: string;
  deadline: string;
  attempts: number;
  studentIds: string[];
  individualDeadlines?: Record<string, string>;
  subjectId: string;
  topicId: string;
  questions: HomeworkQuestionInput[];
  manualTasks: { prompt: string; maxPoints: number }[];
};
export async function saveHomeworkDraft(
  draftId: string | undefined,
  homeworkId: string | undefined,
  title: string,
  payload: HomeworkDraftPayload,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("save_homework_draft", {
    p_draft: draftId ?? null,
    p_homework: homeworkId ?? null,
    p_title: title,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}
export type HomeworkDraft = {
  id: string;
  title: string;
  payload: HomeworkDraftPayload;
};
async function fetchHomeworkDrafts(): Promise<HomeworkDraft[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("homework_drafts")
    .select("id,title,payload")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HomeworkDraft[];
}
export const useHomeworkDrafts = () =>
  useQuery({ queryKey: ["homework-drafts"], queryFn: fetchHomeworkDrafts });
export async function deleteHomeworkDraft(id: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("homework_drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
export async function saveHomeworkTemplate(
  title: string,
  payload: HomeworkDraftPayload,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("save_homework_template", {
    p_title: title,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
export type HomeworkTemplate = {
  id: string;
  title: string;
  payload: HomeworkDraftPayload;
};
async function fetchHomeworkTemplates(): Promise<HomeworkTemplate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("homework_templates")
    .select("id,title,payload")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HomeworkTemplate[];
}
export const useHomeworkTemplates = () =>
  useQuery({
    queryKey: ["homework-templates"],
    queryFn: fetchHomeworkTemplates,
  });
export async function archiveHomework(homeworkId: string) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error } = await supabase.rpc("archive_homework", {
    p_homework: homeworkId,
  });
  if (error) throw error;
}
export type StudentAnalytics = {
  summary: {
    assigned: number;
    completed: number;
    overdue: number;
    awaiting_review: number;
    reviewed: number;
    completion_rate: number;
  };
  topics: {
    topic: string;
    completed: number;
    attempts: number;
    average: number;
    best: number;
  }[];
  history: {
    assignment_id: string;
    title: string;
    topic: string;
    mode: string;
    deadline: string;
    effective_deadline: string;
    status: string;
    attempts_used: number;
    best_score: number | null;
    automatic_maximum: number | null;
    submitted_at: string | null;
  }[];
  attempts: {
    id: string;
    title: string;
    attempt_number: number;
    score: number;
    maximum: number;
    submitted_at: string;
  }[];
};
async function fetchStudentAnalytics(
  studentId: string,
  days: number | null,
): Promise<StudentAnalytics> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("teacher_student_analytics", {
    p_student: studentId,
    p_days: days,
  });
  if (error) throw error;
  return data as StudentAnalytics;
}
export const useStudentAnalytics = (studentId: string, days: number | null) =>
  useQuery({
    queryKey: ["student-analytics", studentId, days],
    queryFn: () => fetchStudentAnalytics(studentId, days),
    enabled: Boolean(studentId),
  });
export async function extendDeadline(
  assignmentId: string,
  until: string,
  reason: string,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("extend_assignment_deadline", {
    p_assignment: assignmentId,
    p_until: new Date(until).toISOString(),
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export type AssignmentCard = {
  id: string;
  homeworkId: string;
  title: string;
  topic: string;
  deadline: string;
  deadlineAt: string;
  status: string;
  mode: string;
};
const demoAssignments: AssignmentCard[] = [
  {
    id: "functions",
    homeworkId: "functions",
    title: "Функции и их графики",
    topic: "Функции",
    deadline: "15 июля, 23:59",
    deadlineAt: "2026-07-15T23:59:00",
    status: "В процессе",
    mode: "automatic",
  },
  {
    id: "geometry",
    homeworkId: "geometry",
    title: "Теорема Пифагора · фото-решение",
    topic: "Геометрия",
    deadline: "18 июля, 20:00",
    deadlineAt: "2026-07-18T20:00:00",
    status: "Не начато",
    mode: "manual",
  },
  {
    id: "fractions",
    homeworkId: "fractions",
    title: "Обыкновенные дроби",
    topic: "Дроби",
    deadline: "12 июля, 23:59",
    deadlineAt: "2026-07-12T23:59:00",
    status: "Просрочено",
    mode: "automatic",
  },
];
async function fetchAssignments(): Promise<AssignmentCard[]> {
  if (getDemoRole()) return demoAssignments;
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("assignment_cards");
  if (error) throw error;
  const labels: Record<string, string> = {
    not_started: "Не начато",
    in_progress: "В процессе",
    submitted: "Сдано",
    awaiting_review: "Ожидает проверки",
    reviewed: "Проверено",
    overdue: "Просрочено",
    returned: "Возвращено",
  };
  return (data ?? []).map((row: {
    id: string;
    homework_id: string;
    title: string;
    topic: string;
    mode: string;
    status: string;
    effective_deadline: string;
  }) => {
    const deadlineAt = row.effective_deadline;
    const status =
      !["submitted", "reviewed"].includes(row.status) &&
      new Date(deadlineAt) < new Date()
        ? "Просрочено"
        : (labels[row.status] ?? row.status);
    return {
      id: row.id,
      homeworkId: row.homework_id ?? "",
      title: row.title ?? "Задание",
      topic: row.topic ?? "Математика",
      deadline: new Date(deadlineAt).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      deadlineAt,
      status,
      mode: row.mode ?? "automatic",
    };
  });
}
export const useAssignments = () =>
  useQuery({ queryKey: ["assignments"], queryFn: fetchAssignments });

export type LessonCard = {
  id: string;
  seriesId: string | null;
  startsAt: string;
  endsAt: string;
  studentName: string;
  status: string;
  zoomUrl: string | null;
};
async function fetchLessons(fromIso?: string, toIso?: string): Promise<LessonCard[]> {
  if (!supabase) return [];
  const from = fromIso ? new Date(fromIso) : new Date();
  if (!fromIso) from.setHours(0, 0, 0, 0);
  const to = toIso ? new Date(toIso) : new Date(from);
  if (!toIso) to.setDate(to.getDate() + 14);
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id,series_id,starts_at,ends_at,status,zoom_url,profiles!lessons_student_id_fkey(first_name,last_name)",
    )
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    return {
      id: row.id,
      seriesId: row.series_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      studentName: profile
        ? `${profile.first_name} ${profile.last_name}`
        : "Ученик",
      status: row.status,
      zoomUrl: row.zoom_url,
    };
  });
}
export const useLessons = (from?: string, to?: string) =>
  useQuery({
    queryKey: ["lessons", from ?? "default", to ?? "default"],
    queryFn: () => fetchLessons(from, to),
  });
export async function createLesson(input: {
  studentId: string;
  startsAt: string;
  endsAt: string;
  zoomUrl: string;
  weekly: boolean;
}) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("create_lesson", {
    p_student: input.studentId,
    p_starts: new Date(input.startsAt).toISOString(),
    p_ends: new Date(input.endsAt).toISOString(),
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_zoom_url: input.zoomUrl || null,
    p_weekly: input.weekly,
  });
  if (error) throw error;
  return data;
}
export async function updateLesson(
  id: string,
  input: {
    startsAt?: string;
    endsAt?: string;
    status?: "scheduled" | "moved" | "cancelled" | "completed";
    zoomUrl?: string;
  },
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error } = await supabase.rpc("update_lesson_occurrence", {
    p_lesson: id,
    p_starts: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    p_ends: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    p_status: input.status ?? null,
    p_zoom_url: input.zoomUrl || null,
  });
  if (error) throw error;
}
export async function updateLessonSeries(
  id: string,
  scope: "following" | "series",
  startsAt: string,
  endsAt: string,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error } = await supabase.rpc("update_lesson_series", {
    p_lesson: id,
    p_scope: scope,
    p_starts: new Date(startsAt).toISOString(),
    p_ends: new Date(endsAt).toISOString(),
  });
  if (error) throw error;
}

export type NotificationCard = {
  id: string;
  title: string;
  href: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
};
async function fetchNotifications(): Promise<NotificationCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id,title,href,kind,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    href: row.href,
    kind: row.kind,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}
export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
export async function markAllNotificationsRead() {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}
export async function markNotificationRead(id: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type CurrentProfile = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  className: string;
  status: string;
};
async function fetchCurrentProfile(): Promise<CurrentProfile> {
  if (getDemoRole())
    return {
      id: "demo",
      firstName: getDemoRole() === "teacher" ? "Мария" : "Иван",
      lastName: "",
      username: "demo",
      className: "8 класс",
      status: "active",
    };
  if (!supabase) throw new Error("Supabase не настроен");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Не авторизован");
  const { data, error } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,username,class_name,status")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    username: data.username,
    className: data.class_name ?? "—",
    status: data.status,
  };
}
export const useCurrentProfile = () =>
  useQuery({ queryKey: ["current-profile"], queryFn: fetchCurrentProfile });

export type StudentDashboardData = {
  nextLesson: LessonCard | null;
  nextAssignment: AssignmentCard | null;
  activeCount: number;
  overdueCount: number;
  average: number;
  completionRate: number;
  recentResults: {
    id: string;
    score: number;
    maximum: number;
    submittedAt: string;
  }[];
};
async function fetchStudentDashboard(): Promise<StudentDashboardData> {
  if (getDemoRole())
    return {
      nextLesson: null,
      nextAssignment: null,
      activeCount: 0,
      overdueCount: 0,
      average: 0,
      completionRate: 0,
      recentResults: [],
    };
  if (!supabase) throw new Error("Supabase не настроен");
  const { data: dashboard, error: dashboardError } = await supabase.rpc(
    "student_dashboard",
  );
  if (dashboardError) throw dashboardError;
  return dashboard as StudentDashboardData;
}
export const useStudentDashboard = () =>
  useQuery({ queryKey: ["student-dashboard"], queryFn: fetchStudentDashboard });

export type TeacherDashboardData = {
  teacherName: string;
  awaitingReviewCount: number;
  overdueCount: number;
  deadlineTodayCount: number;
  deadlineTomorrowCount: number;
  lessonsTodayCount: number;
  newAutomaticResultsCount: number;
  newPhotoSubmissionsCount: number;
  studentsWithoutFutureLessonCount: number;
  attentionItems: { id: string; title: string; href: string }[];
};
async function fetchTeacherDashboard(): Promise<TeacherDashboardData> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("teacher_dashboard");
  if (error) throw error;
  return data as TeacherDashboardData;
}
export const useTeacherDashboard = () =>
  useQuery({ queryKey: ["teacher-dashboard"], queryFn: fetchTeacherDashboard });

export type HomeworkQuestionInput = { prompt: string; answers: string[] };
export type ManualTaskInput = { prompt: string; maxPoints: number };
export type HomeworkEditorData = {
  id: string;
  subjectId: string;
  topicId: string;
  title: string;
  instructions: string;
  mode: "automatic" | "manual" | "combined";
  attempts: number;
  questions: HomeworkQuestionInput[];
  manualTasks: ManualTaskInput[];
};
async function fetchHomeworkEditor(id: string): Promise<HomeworkEditorData> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase
    .from("homeworks")
    .select(
      "id,title,homework_versions(id,subject_id,topic_id,instructions,mode,attempts_allowed,version,homework_questions(id,position,prompt,question_accepted_answers(value)),manual_tasks(id,position,prompt,max_points))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const versions = [...(data.homework_versions ?? [])].sort(
    (a, b) => b.version - a.version,
  );
  const version = versions[0];
  if (!version) throw new Error("Версия не найдена");
  return {
    id: data.id,
    subjectId: version.subject_id ?? "",
    topicId: version.topic_id ?? "",
    title: data.title,
    instructions: version.instructions ?? "",
    mode: version.mode,
    attempts: version.attempts_allowed,
    questions: [...(version.homework_questions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        prompt: q.prompt,
        answers: (q.question_accepted_answers ?? []).map((a) => a.value),
      })),
    manualTasks: [...(version.manual_tasks ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ prompt: t.prompt, maxPoints: t.max_points })),
  };
}
export const useHomeworkEditor = (id: string) =>
  useQuery({
    queryKey: ["homework-editor", id],
    queryFn: () => fetchHomeworkEditor(id),
    enabled: Boolean(id),
  });
export async function createHomework(input: {
  homeworkId?: string;
  subjectId?: string;
  topicId?: string;
  title: string;
  mode: "automatic" | "manual" | "combined";
  questions: HomeworkQuestionInput[];
  manualTasks: ManualTaskInput[];
  instructions: string;
  deadline: string;
  attempts: number;
  studentIds: string[];
  individualDeadlines?: Record<string, string>;
}) {
  if (!supabase) throw new Error("Supabase не настроен");
  const questions = input.mode === "manual" ? [] : input.questions;
  const manualTasks =
    input.mode === "automatic"
      ? []
      : input.manualTasks.map(({ prompt, maxPoints }) => ({
          prompt,
          max_points: maxPoints,
        }));
  const { data, error } = await supabase.rpc("create_homework_v2", {
    p_title: input.title,
    p_mode: input.mode,
    p_deadline: new Date(input.deadline).toISOString(),
    p_attempts: input.attempts,
    p_student_ids: input.studentIds,
    p_questions: questions,
    p_manual_tasks: manualTasks,
    p_instructions: input.instructions,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_homework: input.homeworkId ?? null,
    p_subject: input.subjectId ?? null,
    p_topic: input.topicId ?? null,
    p_individual_deadlines: Object.fromEntries(
      Object.entries(input.individualDeadlines ?? {}).map(
        ([studentId, value]) => [studentId, new Date(value).toISOString()],
      ),
    ),
  });
  if (error) throw error;
  return data;
}

export type AssignmentDetail = {
  id: string;
  studentId: string;
  title: string;
  deadlineAt: string;
  attemptsAllowed: number;
  questions: { id: string; prompt: string; position: number }[];
  draft: Record<string, string>;
};
const draftKey = (userId: string, assignmentId: string) =>
  `eclipse-attempt:v1:${userId}:${assignmentId}`;
const readLocalDraft = (userId: string, assignmentId: string) => {
  try {
    const value = JSON.parse(
      localStorage.getItem(draftKey(userId, assignmentId)) ?? "null",
    ) as {
      answers: Record<string, string>;
      updatedAt: string;
      expiresAt: string;
    } | null;
    if (!value || new Date(value.expiresAt) <= new Date()) {
      localStorage.removeItem(draftKey(userId, assignmentId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
};
const writeLocalDraft = (
  userId: string,
  assignmentId: string,
  answers: Record<string, string>,
) =>
  localStorage.setItem(
    draftKey(userId, assignmentId),
    JSON.stringify({
      answers,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    }),
  );
async function fetchAssignment(id: string): Promise<AssignmentDetail> {
  if (getDemoRole())
    return {
      id,
      studentId: "demo",
      title: "Функции и их графики",
      deadlineAt: "2026-07-15T23:59:00",
      attemptsAllowed: 2,
      questions: [
        {
          id: "q1",
          prompt: "Найдите значение y = 2x + 1 при x = 3",
          position: 1,
        },
        {
          id: "q2",
          prompt: "Как называется график функции y = x²?",
          position: 2,
        },
      ],
      draft: readLocalDraft("demo", id)?.answers ?? {},
    };
  if (!supabase) throw new Error("Supabase не настроен");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  const { data, error } = await supabase
    .from("homework_assignments")
    .select(
      "id,deadline_at,homework_versions(title,attempts_allowed,homework_questions(id,prompt,position))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const version = Array.isArray(data.homework_versions)
    ? data.homework_versions[0]
    : data.homework_versions;
  const { data: started, error: startError } = await supabase.rpc(
    "start_or_resume_attempt_draft",
    { p_assignment: id },
  );
  if (startError) throw startError;
  const draft = started?.[0];
  const local = readLocalDraft(user.id, id);
  const serverUpdated = draft?.updated_at
    ? new Date(draft.updated_at).getTime()
    : 0;
  const chosen =
    local && new Date(local.updatedAt).getTime() > serverUpdated
      ? local.answers
      : ((draft?.answers as Record<string, string>) ?? {});
  return {
    id: data.id,
    studentId: user.id,
    title: version?.title ?? "Задание",
    deadlineAt: data.deadline_at,
    attemptsAllowed: version?.attempts_allowed ?? 1,
    questions: [...(version?.homework_questions ?? [])].sort(
      (a, b) => a.position - b.position,
    ),
    draft: chosen,
  };
}
export const useAssignment = (id: string, enabled = true) =>
  useQuery({
    queryKey: ["assignment", id],
    queryFn: () => fetchAssignment(id),
    enabled: Boolean(id) && enabled,
  });
export async function saveAttemptDraft(
  assignmentId: string,
  answers: Record<string, string>,
) {
  if (getDemoRole()) {
    writeLocalDraft("demo", assignmentId, answers);
    return;
  }
  if (!supabase) throw new Error("Supabase не настроен");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  const { error } = await supabase
    .from("attempt_drafts")
    .upsert(
      { assignment_id: assignmentId, student_id: user.id, answers },
      { onConflict: "assignment_id,student_id" },
    );
  if (error) {
    writeLocalDraft(user.id, assignmentId, answers);
    throw error;
  }
  localStorage.removeItem(draftKey(user.id, assignmentId));
}
export async function submitAttempt(
  assignmentId: string,
  answers: Record<string, string>,
  idempotencyKey: string,
) {
  if (getDemoRole()) {
    localStorage.removeItem(draftKey("demo", assignmentId));
    return null;
  }
  if (!supabase) throw new Error("Supabase не настроен");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  const { data, error } = await supabase.rpc("submit_attempt", {
    p_assignment: assignmentId,
    p_answers: answers,
    p_idempotency: idempotencyKey,
  });
  if (error) throw error;
  localStorage.removeItem(draftKey(user.id, assignmentId));
  localStorage.removeItem(`eclipse-submit:v1:${user.id}:${assignmentId}`);
  return data?.[0] ?? null;
}

export type AttemptResult = {
  id: string;
  assignment_id: string;
  score: number;
  maximum_score: number;
  attempt_number: number;
  attempts_allowed: number;
  attempts_used: number;
  best_score: number;
  submitted_at: string;
  duration_seconds: number;
  questions: {
    id: string;
    prompt: string;
    position: number;
    answer: string;
    is_correct: boolean;
    accepted_answers: string[];
  }[];
};
async function fetchAttemptResult(id: string): Promise<AttemptResult> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("get_attempt_result", {
    p_attempt: id,
  });
  if (error) throw error;
  return data as AttemptResult;
}
export const useAttemptResult = (id: string, enabled = true) =>
  useQuery({
    queryKey: ["attempt-result", id],
    queryFn: () => fetchAttemptResult(id),
    enabled: Boolean(id) && enabled,
  });

export type AssignmentResult = {
  assignment_id: string;
  title: string;
  mode: "automatic" | "manual" | "combined";
  status:
    | "automatic_pending"
    | "automatic_complete"
    | "manual_pending"
    | "awaiting_review"
    | "reviewed"
    | "returned";
  automatic_score: number;
  automatic_maximum: number;
  manual_score: number;
  manual_maximum: number;
  total_score: number;
  total_maximum: number;
  percentage: number;
  best_attempt_id: string | null;
  attempts_used: number;
  attempts_allowed: number;
  updated_at: string;
};
async function fetchAssignmentResult(id: string): Promise<AssignmentResult> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("get_assignment_result", {
    p_assignment: id,
  });
  if (error || !data) throw error ?? new Error("Результат не найден");
  return data as AssignmentResult;
}
export const useAssignmentResult = (id: string) =>
  useQuery({
    queryKey: ["assignment-result", id],
    queryFn: () => fetchAssignmentResult(id),
    enabled: Boolean(id),
  });

export async function saveTeacherNote(studentId: string, body: string) {
  if (getDemoRole()) {
    localStorage.setItem(`teacher-note:${studentId}`, body);
    return;
  }
  if (!supabase) throw new Error("Supabase не настроен");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  const { error } = await supabase
    .from("teacher_notes")
    .upsert({ student_id: studentId, teacher_id: user.id, body });
  if (error) throw error;
}
async function fetchTeacherNote(studentId: string) {
  if (getDemoRole())
    return localStorage.getItem(`teacher-note:${studentId}`) ?? "";
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase
    .from("teacher_notes")
    .select("body")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data?.body ?? "";
}
export const useTeacherNote = (studentId: string) =>
  useQuery({
    queryKey: ["teacher-note", studentId],
    queryFn: () => fetchTeacherNote(studentId),
    enabled: Boolean(studentId),
  });

export type PreparedSubmissionImage = {
  original: File;
  processed: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  rotation: number;
  crop: Record<string, number>;
};
export async function uploadManualSubmission(
  assignmentId: string,
  images: PreparedSubmissionImage[],
  onProgress?: (index: number, state: "uploading" | "done" | "failed") => void,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const client = supabase;
  const { data: started, error: startError } = await client.rpc(
    "begin_manual_submission",
    { p_assignment: assignmentId },
  );
  if (startError) throw startError;
  const draft = started?.[0];
  if (!draft) throw new Error("Не удалось начать отправку");
  const uploaded: { bucket: string; path: string }[] = [];
  const records = [];
  let activeIndex = -1;
  try {
    for (let index = 0; index < images.length; index++) {
      activeIndex = index;
      onProgress?.(index, "uploading");
      const image = images[index];
      const fileId = crypto.randomUUID();
      const originalExt = (image.original.name.split(".").pop() || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const base = `${draft.path_prefix}/${fileId}`;
      const paths = {
        original: `${base}.${originalExt}`,
        processed: `${base}.jpg`,
        thumbnail: `${base}.jpg`,
      };
      for (const [bucket, path, body, contentType] of [
        [
          "homework-originals",
          paths.original,
          image.original,
          image.original.type || "application/octet-stream",
        ],
        ["homework-processed", paths.processed, image.processed, "image/jpeg"],
        ["homework-thumbnails", paths.thumbnail, image.thumbnail, "image/jpeg"],
      ] as const) {
        const { error } = await client.storage
          .from(bucket)
          .upload(path, body, { contentType, upsert: false });
        if (error) throw error;
        uploaded.push({ bucket, path });
      }
      records.push({
        original_path: paths.original,
        processed_path: paths.processed,
        thumbnail_path: paths.thumbnail,
        original_name: image.original.name,
        mime_type: image.original.type || "application/octet-stream",
        size_bytes: image.original.size,
        width: image.width,
        height: image.height,
        rotation: image.rotation,
        crop: image.crop,
      });
      onProgress?.(index, "done");
    }
    const { data, error } = await client.rpc("finalize_manual_submission", {
      p_submission: draft.submission_id,
      p_images: records,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    if (activeIndex >= 0) onProgress?.(activeIndex, "failed");
    await Promise.allSettled(
      uploaded.map(({ bucket, path }) =>
        client.storage.from(bucket).remove([path]),
      ),
    );
    throw error;
  }
}

export type ReviewQueueItem = {
  id: string;
  studentName: string;
  homeworkTitle: string;
  topic: string;
  submittedAt: string;
  deadlineAt: string;
  imageCount: number;
  status: string;
  reviewed: boolean;
  overdue: boolean;
};
type ReviewQueueRow = {
  id: string;
  student_first_name: string;
  student_last_name: string;
  homework_title: string;
  topic: string;
  submitted_at: string;
  effective_deadline: string;
  image_count: number;
};
async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("manual_review_queue");
  if (error) throw error;
  return ((data ?? []) as ReviewQueueRow[]).map((row) => {
    const deadlineAt = row.effective_deadline ?? row.submitted_at!;
    return {
      id: row.id,
      studentName: `${row.student_first_name} ${row.student_last_name}`,
      homeworkTitle: row.homework_title,
      topic: row.topic,
      submittedAt: row.submitted_at!,
      deadlineAt,
      imageCount: Number(row.image_count ?? 0),
      status: "Ожидает проверки",
      reviewed: false,
      overdue: new Date(row.submitted_at!) > new Date(deadlineAt),
    };
  });
}
export const useReviewQueue = () =>
  useQuery({ queryKey: ["review-queue"], queryFn: fetchReviewQueue });

export type SubmissionDetail = {
  id: string;
  studentName: string;
  homeworkTitle: string;
  previousVersions: { id: string; version: number; submittedAt: string }[];
  savedScores: Record<string, number>;
  images: {
    id: string;
    position: number;
    processedUrl: string;
    originalUrl: string;
    originalName: string;
  }[];
  tasks: { id: string; position: number; prompt: string; maxPoints: number }[];
};
async function fetchSubmissionDetail(id: string): Promise<SubmissionDetail> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error: beginError } = await supabase.rpc("begin_manual_review", {
    p_submission: id,
  });
  if (beginError) throw beginError;
  const { data, error } = await supabase
    .from("manual_submissions")
    .select(
      "id,assignment_id,version,student:profiles!manual_submissions_student_id_fkey(first_name,last_name),assignment:homework_assignments!manual_submissions_assignment_id_fkey(homework_versions(id,title,manual_tasks(id,position,prompt,max_points))),submission_images(id,position,processed_path,original_path,original_name)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: versions, error: versionsError } = await supabase
    .from("manual_submissions")
    .select("id,version,submitted_at")
    .eq("assignment_id", data.assignment_id)
    .neq("id", data.id)
    .not("submitted_at", "is", null)
    .order("version", { ascending: false });
  if (versionsError) throw versionsError;
  const { data: storedScores, error: scoresError } = await supabase
    .from("manual_task_scores")
    .select("task_number,points")
    .eq("submission_id", data.id);
  if (scoresError) throw scoresError;
  const student = Array.isArray(data.student) ? data.student[0] : data.student;
  const assignment = Array.isArray(data.assignment)
    ? data.assignment[0]
    : data.assignment;
  const version = assignment
    ? Array.isArray(assignment.homework_versions)
      ? assignment.homework_versions[0]
      : assignment.homework_versions
    : null;
  const tasks = [...(version?.manual_tasks ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const scoreByPosition = new Map(
    (storedScores ?? []).map((score) => [score.task_number, score.points]),
  );
  const images = await Promise.all(
    [...(data.submission_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(async (image) => {
        const [processed, original] = await Promise.all([
          supabase!.storage
            .from("homework-processed")
            .createSignedUrl(image.processed_path, 300),
          supabase!.storage
            .from("homework-originals")
            .createSignedUrl(image.original_path, 300),
        ]);
        if (processed.error || original.error)
          throw processed.error ?? original.error;
        return {
          id: image.id,
          position: image.position,
          processedUrl: processed.data.signedUrl,
          originalUrl: original.data.signedUrl,
          originalName: image.original_name,
        };
      }),
  );
  return {
    id: data.id,
    studentName: student
      ? `${student.first_name} ${student.last_name}`
      : "Ученик",
    homeworkTitle: version?.title ?? "Задание",
    previousVersions: (versions ?? []).map((item) => ({
      id: item.id,
      version: item.version,
      submittedAt: item.submitted_at!,
    })),
    savedScores: Object.fromEntries(
      tasks
        .filter((task) => scoreByPosition.has(task.position))
        .map((task) => [task.id, scoreByPosition.get(task.position)!]),
    ),
    images,
    tasks: tasks.map((task) => ({ ...task, maxPoints: task.max_points })),
  };
}
export const useSubmissionDetail = (id: string) =>
  useQuery({
    queryKey: ["submission", id],
    queryFn: () => fetchSubmissionDetail(id),
    enabled: Boolean(id),
  });
export async function gradeSubmission(
  id: string,
  scores: Record<string, number>,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.rpc("grade_manual_submission", {
    p_submission: id,
    p_scores: scores,
  });
  if (error) throw error;
  return data?.[0];
}
export async function saveSubmissionReview(
  id: string,
  scores: Record<string, number>,
) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error } = await supabase.rpc("save_manual_review", {
    p_submission: id,
    p_scores: scores,
  });
  if (error) throw error;
}
export async function returnSubmission(id: string) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { error } = await supabase.rpc("return_manual_submission", {
    p_submission: id,
  });
  if (error) throw error;
}
export async function manageStudent(body: {
  studentId: string;
  action: "reset-password" | "archive" | "restore" | "update-profile";
  password?: string;
  className?: string;
  zoomUrl?: string;
}) {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase.functions.invoke("manage-student", {
    body,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.ok && !data?.actionCompleted)
    throw new Error(data?.warning ?? "Операция не выполнена");
  return data as {
    ok: boolean;
    actionCompleted: boolean;
    auditRecorded: boolean;
    warning: string | null;
  };
}
