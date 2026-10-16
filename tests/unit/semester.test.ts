import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAcademicState,
  getActiveSemester,
  getCurrentSemParity,
  semesterStartDate,
  setAcademicState,
} from '@/lib/semester'

const NO_STATE = { academicYear: null, promotedAt: null }

beforeEach(() => setAcademicState(NO_STATE))
afterEach(() => { vi.useRealTimers() })

describe('getCurrentSemParity', () => {
  it('is even from January to May', () => {
    expect(getCurrentSemParity(new Date(2027, 0, 1))).toBe('even')
    expect(getCurrentSemParity(new Date(2027, 2, 15))).toBe('even')
    expect(getCurrentSemParity(new Date(2027, 4, 31, 23, 59))).toBe('even')
  })

  it('is odd from June to December when the promotion state is unknown', () => {
    expect(getCurrentSemParity(new Date(2026, 5, 1))).toBe('odd')
    expect(getCurrentSemParity(new Date(2026, 9, 16))).toBe('odd')
    expect(getCurrentSemParity(new Date(2026, 11, 31))).toBe('odd')
  })

  it('stays even in June–December until this academic year is promoted', () => {
    setAcademicState({ academicYear: '2025-2026', promotedAt: '2025-06-18T09:00:00Z' })
    expect(getCurrentSemParity(new Date(2026, 6, 10))).toBe('even')
  })

  it('switches to odd once this academic year is promoted', () => {
    setAcademicState({ academicYear: '2026-2027', promotedAt: '2026-06-22T09:00:00Z' })
    expect(getCurrentSemParity(new Date(2026, 6, 10))).toBe('odd')
    expect(getCurrentSemParity(new Date(2027, 1, 10))).toBe('even')
  })

  it('uses the current date by default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 10))
    expect(getCurrentSemParity()).toBe('odd')
    vi.setSystemTime(new Date(2027, 3, 1, 10))
    expect(getCurrentSemParity()).toBe('even')
  })
})

describe('getActiveSemester', () => {
  it.each([
    ['I CSE-A', 1, 2], ['I CSE-B', 1, 2],
    ['II CSE-A', 3, 4], ['II CSE-B', 3, 4],
    ['III CSE-A', 5, 6], ['III CSE-B', 5, 6],
    ['IV CSE-A', 7, 8], ['IV CSE-B', 7, 8],
  ])('%s is in semester %i (odd) / %i (even)', (section, odd, even) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 10))
    expect(getActiveSemester(section)).toBe(odd)
    vi.setSystemTime(new Date(2027, 1, 16, 10))
    expect(getActiveSemester(section)).toBe(even)
  })

  it('keeps last year\'s even semester until promotion', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 1, 10))
    setAcademicState({ academicYear: '2025-2026', promotedAt: null })
    expect(getActiveSemester('II CSE-A')).toBe(4)
    setAcademicState({ academicYear: '2026-2027', promotedAt: '2026-06-30' })
    expect(getActiveSemester('II CSE-A')).toBe(3)
  })

  it('defaults unknown sections to semesters 1 / 2', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 10))
    expect(getActiveSemester('V CSE-A')).toBe(1)
    vi.setSystemTime(new Date(2027, 1, 16, 10))
    expect(getActiveSemester('')).toBe(2)
  })
})

describe('semesterStartDate', () => {
  it('is 1 January for the even semester', () => {
    expect(semesterStartDate(new Date(2027, 2, 15))).toEqual(new Date(2027, 0, 1))
  })

  it('is 1 January of the same year while promotion is pending in June–December', () => {
    setAcademicState({ academicYear: '2025-2026', promotedAt: '2025-06-18' })
    expect(semesterStartDate(new Date(2026, 6, 10))).toEqual(new Date(2026, 0, 1))
  })

  it('is the promotion date for the odd semester', () => {
    setAcademicState({ academicYear: '2026-2027', promotedAt: '2026-06-22T09:00:00Z' })
    expect(semesterStartDate(new Date(2026, 9, 16))).toEqual(new Date('2026-06-22T09:00:00Z'))
  })

  it('falls back to 1 June when the promotion date is unknown', () => {
    expect(semesterStartDate(new Date(2026, 9, 16))).toEqual(new Date(2026, 5, 1))
    setAcademicState({ academicYear: '2026-2027', promotedAt: null })
    expect(semesterStartDate(new Date(2026, 9, 16))).toEqual(new Date(2026, 5, 1))
  })
})

describe('academic state', () => {
  it('round-trips through set/get', () => {
    const s = { academicYear: '2026-2027', promotedAt: '2026-06-22' }
    setAcademicState(s)
    expect(getAcademicState()).toEqual(s)
  })
})
