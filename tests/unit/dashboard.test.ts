import { describe, expect, it } from 'vitest'
import { PERIODS, attendanceHeadroom, dayPhase, fmtTime, isFinalYear, isoDate, yearOf } from '@/lib/dashboard'

describe('attendanceHeadroom (75% by default)', () => {
  it('is zero before any class', () => {
    expect(attendanceHeadroom(0, 0)).toEqual({ canMiss: 0, mustAttend: 0 })
  })

  it('is zero both ways at exactly 75%', () => {
    expect(attendanceHeadroom(75, 100)).toEqual({ canMiss: 0, mustAttend: 0 })
    expect(attendanceHeadroom(3, 4)).toEqual({ canMiss: 0, mustAttend: 0 })
  })

  it('counts the classes that can still be missed', () => {
    expect(attendanceHeadroom(80, 100)).toEqual({ canMiss: 6, mustAttend: 0 })   // 80/106 = 75.5%, 80/107 = 74.8%
    expect(attendanceHeadroom(10, 10)).toEqual({ canMiss: 3, mustAttend: 0 })    // 10/13 = 76.9%, 10/14 = 71.4%
  })

  it('counts the classes in a row needed to get back to 75%', () => {
    expect(attendanceHeadroom(60, 100)).toEqual({ canMiss: 0, mustAttend: 60 })  // 120/160
    expect(attendanceHeadroom(0, 10)).toEqual({ canMiss: 0, mustAttend: 30 })    // 30/40
    expect(attendanceHeadroom(74, 100)).toEqual({ canMiss: 0, mustAttend: 4 })   // 78/104
  })

  // Brute-force check against exact integer arithmetic for whole-percent targets, the
  // values the HOD can configure as the minimum attendance.
  const exact = (present: number, sessions: number, pct: number) => ({
    canMiss: 100 * present >= pct * sessions ? Math.floor((100 * present - pct * sessions) / pct) : 0,
    mustAttend: Math.max(0, Math.ceil((pct * sessions - 100 * present) / (100 - pct))),
  })

  it.each([60, 65, 70, 75, 80, 85, 90])('is exact for a target of %i percent', pct => {
    for (let sessions = 1; sessions <= 120; sessions++) {
      for (let present = 0; present <= sessions; present++) {
        const got = attendanceHeadroom(present, sessions, pct / 100)
        const want = exact(present, sessions, pct)
        if (got.canMiss !== want.canMiss || got.mustAttend !== want.mustAttend) {
          expect({ present, sessions, ...got }).toEqual({ present, sessions, ...want })
        }
      }
    }
  })

  it('reaches the target after exactly mustAttend classes (80% target)', () => {
    // 0/1 needs 4 more classes: 4/5 = 80%. Floating point once made this 5.
    expect(attendanceHeadroom(0, 1, 0.8).mustAttend).toBe(4)
    expect(attendanceHeadroom(8, 9, 0.8).canMiss).toBe(1)   // 8/10 = 80%
  })
})

describe('dayPhase', () => {
  const at = (h: number, m: number) => new Date(2026, 9, 16, h, m)

  it('is a holiday when there are no classes', () => {
    expect(dayPhase(at(10, 0), false)).toEqual({ kind: 'holiday' })
  })

  it('is before the first period until 8:00', () => {
    expect(dayPhase(at(7, 59))).toEqual({ kind: 'before' })
  })

  it('finds the running period (start inclusive, end exclusive)', () => {
    expect(dayPhase(at(8, 0))).toEqual({ kind: 'period', period: PERIODS[0] })
    expect(dayPhase(at(9, 0))).toEqual({ kind: 'period', period: PERIODS[1] })
    expect(dayPhase(at(15, 59))).toEqual({ kind: 'period', period: PERIODS[7] })
  })

  it('reports the next period during the breaks', () => {
    expect(dayPhase(at(9, 50))).toEqual({ kind: 'break', next: PERIODS[2] })
    expect(dayPhase(at(12, 40))).toEqual({ kind: 'break', next: PERIODS[5] })
    expect(dayPhase(at(13, 29))).toEqual({ kind: 'break', next: PERIODS[5] })
  })

  it('is after college from 16:00', () => {
    expect(dayPhase(at(16, 0))).toEqual({ kind: 'after' })
    expect(dayPhase(at(23, 59))).toEqual({ kind: 'after' })
  })
})

describe('dashboard helpers', () => {
  it('isoDate formats the local date', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(isoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('fmtTime is 12-hour without a suffix', () => {
    expect(fmtTime('08:00')).toBe('8:00')
    expect(fmtTime('13:30')).toBe('1:30')
    expect(fmtTime('12:05')).toBe('12:05')
  })

  it('yearOf / isFinalYear read the year prefix', () => {
    expect(yearOf('III CSE-A')).toBe('III')
    expect(isFinalYear('IV CSE-B')).toBe(true)
    expect(isFinalYear('III CSE-B')).toBe(false)
  })
})
