export const normalizeAnswer = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')

export const isAcceptedAnswer = (answer: string, accepted: string[]) => accepted.some((value) => normalizeAnswer(value) === normalizeAnswer(answer))

export type AttemptScore = { automaticCorrect: number; automaticTotal: number; manualPoints: number; manualMaximum: number }
export const scoreAttempt = ({ automaticCorrect, automaticTotal, manualPoints, manualMaximum }: AttemptScore) => {
  const score = automaticCorrect + manualPoints
  const maximum = automaticTotal + manualMaximum
  return { score, maximum, percentage: maximum ? Math.round((score / maximum) * 100) : 0 }
}

export const bestAttempt = <T extends { score: number }>(attempts: T[]) => attempts.reduce<T | null>((best, item) => !best || item.score > best.score ? item : best, null)

export const canSubmit = (deadline: string | Date, serverNow: string | Date, extension?: string | Date) => new Date(serverNow).getTime() <= new Date(extension ?? deadline).getTime()

export type AssignmentState = { archived?: boolean; submitted?: boolean; reviewed?: boolean; returned?: boolean; started?: boolean; deadline: string | Date; now: string | Date }
export const assignmentStatus = (state: AssignmentState) => {
  if (state.archived) return 'Архивировано'
  if (state.returned) return 'Возвращено на пересдачу'
  if (state.reviewed) return 'Проверено'
  if (state.submitted) return 'Сдано'
  if (!canSubmit(state.deadline, state.now)) return 'Просрочено'
  return state.started ? 'В процессе' : 'Не начато'
}

export const notificationKey = (kind: string, entityId: string, occurrence = '') => `${kind}:${entityId}:${occurrence}`
