import { describe, expect, it } from 'vitest'
import { usernameSchema } from './schemas'
describe('username', () => { it('normalizes valid usernames and refuses spaces', () => { expect(usernameSchema.parse('  Иван.Петров  ')).toBe('иван.петров'); expect(() => usernameSchema.parse('иван петров')).toThrow() }) })
