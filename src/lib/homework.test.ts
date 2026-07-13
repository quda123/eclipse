import { describe, expect, it } from 'vitest'
import { assignmentStatus, bestAttempt, canSubmit, isAcceptedAnswer, normalizeAnswer, notificationKey, scoreAttempt } from './homework'

describe('answers', () => {
  it('normalizes permitted differences only', () => {
    expect(normalizeAnswer('  Иван   Иванов ')).toBe('иван иванов')
    expect(isAcceptedAnswer('Москва', ['москва'])).toBe(true)
    expect(isAcceptedAnswer('0,5', ['0.5'])).toBe(false)
  })
})
describe('deadlines and status', () => {
  it('uses an individual extension', () => expect(canSubmit('2026-07-15T20:00:00Z', '2026-07-16T10:00:00Z', '2026-07-17T20:00:00Z')).toBe(true))
  it('derives overdue on the shared path', () => expect(assignmentStatus({ deadline: '2026-07-15T20:00:00Z', now: '2026-07-16T10:00:00Z' })).toBe('Просрочено'))
  it('builds stable notification keys', () => expect(notificationKey('deadline','abc','2026-07-15')).toBe('deadline:abc:2026-07-15'))
})
describe('scoring', () => {
  it('combines automatic and manual points', () => expect(scoreAttempt({ automaticCorrect: 3, automaticTotal: 4, manualPoints: 2, manualMaximum: 4 })).toEqual({ score: 5, maximum: 8, percentage: 63 }))
  it('selects the highest result', () => expect(bestAttempt([{ score: 4 }, { score: 7 }, { score: 6 }])).toEqual({ score: 7 }))
})
