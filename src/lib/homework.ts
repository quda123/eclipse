export const normalizeAnswer = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU");

export const isAcceptedAnswer = (answer: string, accepted: string[]) =>
  accepted.some((value) => normalizeAnswer(value) === normalizeAnswer(answer));

export type AttemptScore = {
  automaticCorrect: number;
  automaticTotal: number;
  manualPoints: number;
  manualMaximum: number;
};
export const scoreAttempt = ({
  automaticCorrect,
  automaticTotal,
  manualPoints,
  manualMaximum,
}: AttemptScore) => {
  const score = automaticCorrect + manualPoints;
  const maximum = automaticTotal + manualMaximum;
  return {
    score,
    maximum,
    percentage: maximum ? Math.round((score / maximum) * 100) : 0,
  };
};

export const bestAttempt = <T extends { score: number }>(attempts: T[]) =>
  attempts.reduce<T | null>(
    (best, item) => (!best || item.score > best.score ? item : best),
    null,
  );

export const canSubmit = (
  deadline: string | Date,
  serverNow: string | Date,
  extension?: string | Date,
) => new Date(serverNow).getTime() <= new Date(extension ?? deadline).getTime();

export type AssignmentState = {
  archived?: boolean;
  submitted?: boolean;
  reviewed?: boolean;
  returned?: boolean;
  started?: boolean;
  deadline: string | Date;
  now: string | Date;
};
export const assignmentStatus = (state: AssignmentState) => {
  if (state.archived) return "Архивировано";
  if (state.returned) return "Возвращено на пересдачу";
  if (state.reviewed) return "Проверено";
  if (state.submitted) return "Сдано";
  if (!canSubmit(state.deadline, state.now)) return "Просрочено";
  return state.started ? "В процессе" : "Не начато";
};

export const notificationKey = (
  kind: string,
  entityId: string,
  occurrence = "",
) => `${kind}:${entityId}:${occurrence}`;
export const manualMaximum = (tasks: number | number[]) =>
  Array.isArray(tasks)
    ? tasks.reduce((sum, points) => sum + Math.max(0, Math.trunc(points)), 0)
    : Math.max(0, Math.trunc(tasks)) * 2;
export const effectiveDeadline = (
  deadline: string | Date,
  extensions: (string | Date)[] = [],
) =>
  [deadline, ...extensions].reduce((latest, value) =>
    new Date(value) > new Date(latest) ? value : latest,
  );
export const validateImage = (file: Pick<File, "name" | "type" | "size">) => {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  return (
    file.size > 0 &&
    file.size <= 20 * 1024 * 1024 &&
    ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension ?? "") &&
    /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)
  );
};
export const movedOccurrence = <T extends { startsAt: string }>(
  occurrences: T[],
  originalStart: string,
  nextStart: string,
) =>
  occurrences.map((item) =>
    item.startsAt === originalStart ? { ...item, startsAt: nextStart } : item,
  );

export type HomeworkValidationInput = {
  title: string;
  mode: "automatic" | "manual" | "combined";
  attempts: number;
  studentIds: string[];
  questions: { prompt: string; answers: string[] }[];
  manualTasks: { prompt: string; maxPoints: number }[];
};

export const validateHomework = (input: HomeworkValidationInput) => {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("Введите название");
  if (
    !Number.isInteger(input.attempts) ||
    input.attempts < 1 ||
    input.attempts > 20
  )
    errors.push("Укажите от 1 до 20 попыток");
  if (!input.studentIds.length) errors.push("Выберите учеников");
  if (
    input.mode !== "manual" &&
    (!input.questions.length ||
      input.questions.some(
        (question) =>
          !question.prompt.trim() ||
          !question.answers.some((answer) => answer.trim()),
      ))
  )
    errors.push("Заполните вопросы и принимаемые ответы");
  if (
    input.mode !== "automatic" &&
    (!input.manualTasks.length ||
      input.manualTasks.some(
        (task) =>
          !task.prompt.trim() ||
          !Number.isInteger(task.maxPoints) ||
          task.maxPoints < 1 ||
          task.maxPoints > 20,
      ))
  )
    errors.push("Заполните письменные задачи");
  return errors;
};
