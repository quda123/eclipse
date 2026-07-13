import { describe, expect, it } from 'vitest'
import { internalEmail } from './auth'
describe('username auth', () => { it('uses a hidden normalized email', () => expect(internalEmail(' Иван.Петров ')).toBe('иван.петров@users.eclipse.local')) })
