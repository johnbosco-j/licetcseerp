import { describe, expect, it } from 'vitest'
import {
  NAV_FACULTY_IDS,
  NAV_HOD_IDS,
  NAV_LABELS,
  NAV_STUDENT_IDS,
  getAllowedModules,
  isTier1,
  tierOf,
  type NavUser,
} from '@/lib/roles'

const HOD: NavUser = { type: 'staff', role: 'HOD' }
const VICE_PRINCIPAL: NavUser = { type: 'staff', role: 'PROFESSOR', access_tier: 1 }
const FACULTY: NavUser = { type: 'staff', role: 'PROFESSOR', access_tier: 2 }
const ADVISOR: NavUser = { type: 'staff', role: 'PROFESSOR', advisor_section: 'II CSE-A' }
const RESETTER: NavUser = { type: 'staff', role: 'PROFESSOR', can_reset_passwords: true }
const STUDENT: NavUser = { type: 'student', role: 'STUDENT' }

const ALWAYS = ['dashboard', 'profile', 'change-password']

describe('isTier1', () => {
  it('is true for the HOD and tier-1 professors', () => {
    expect(isTier1({ role: 'HOD' })).toBe(true)
    expect(isTier1({ role: 'HOD', access_tier: 3 })).toBe(true)
    expect(isTier1({ role: 'PROFESSOR', access_tier: 1 })).toBe(true)
  })

  it('is false for other faculty and students', () => {
    expect(isTier1({ role: 'PROFESSOR', access_tier: 2 })).toBe(false)
    expect(isTier1({ role: 'PROFESSOR', access_tier: null })).toBe(false)
    expect(isTier1({ role: 'PROFESSOR' })).toBe(false)
    expect(isTier1({ role: 'STUDENT', access_tier: 1 })).toBe(false)
  })

  it('is false without a user', () => {
    expect(isTier1(null)).toBe(false)
    expect(isTier1(undefined)).toBe(false)
  })

  it('unwraps an auth-store user ({ type, data })', () => {
    expect(isTier1({ type: 'staff', data: { role: 'HOD' } })).toBe(true)
    expect(isTier1({ type: 'staff', data: { role: 'PROFESSOR', access_tier: 1 } })).toBe(true)
    expect(isTier1({ type: 'staff', data: { role: 'PROFESSOR' } })).toBe(false)
    expect(isTier1({ type: 'staff', data: null })).toBe(false)
  })
})

describe('tierOf', () => {
  it('ranks leadership 1, faculty 2, students 3', () => {
    expect(tierOf({ role: 'HOD' })).toBe(1)
    expect(tierOf({ role: 'PROFESSOR', access_tier: 1 })).toBe(1)
    expect(tierOf({ role: 'PROFESSOR', access_tier: 2 })).toBe(2)
    expect(tierOf({ role: 'PROFESSOR' })).toBe(2)
    expect(tierOf({ role: 'STUDENT' })).toBe(3)
    expect(tierOf(null)).toBe(3)
    expect(tierOf(undefined)).toBe(3)
  })
})

describe('getAllowedModules', () => {
  describe('HOD / tier 1', () => {
    it('gets every module, including configuration and accounts', () => {
      const ids = getAllowedModules(HOD)
      expect(ids).toEqual(NAV_HOD_IDS)
      expect(ids).toContain('config')
      expect(ids).toContain('accounts')
      expect(ids).toContain('audit')
    })

    it('includes everything faculty and students can open', () => {
      for (const id of [...NAV_FACULTY_IDS, ...NAV_STUDENT_IDS]) expect(NAV_HOD_IDS).toContain(id)
    })

    it('applies to tier-1 professors too', () => {
      expect(getAllowedModules(VICE_PRINCIPAL)).toEqual(NAV_HOD_IDS)
    })

    it('is never affected by hidden menus', () => {
      const hidden = { HOD: ['finance'], FACULTY: ['marks', 'config'], STUDENT: ['marks'], TIER1: ['config'] }
      expect(getAllowedModules(HOD, hidden)).toEqual(NAV_HOD_IDS)
      expect(getAllowedModules(VICE_PRINCIPAL, hidden)).toEqual(NAV_HOD_IDS)
    })

    it('requires a staff account', () => {
      expect(getAllowedModules({ type: 'student', role: 'HOD' })).toEqual(NAV_STUDENT_IDS)
    })
  })

  describe('faculty', () => {
    it('gets the faculty list without accounts or configuration', () => {
      const ids = getAllowedModules(FACULTY)
      expect(ids).toEqual(NAV_FACULTY_IDS)
      expect(ids).not.toContain('accounts')
      expect(ids).not.toContain('config')
      expect(ids).not.toContain('finance')
    })

    it('adds accounts for class advisors and password resetters, once; advisors also get insights', () => {
      expect(getAllowedModules(ADVISOR)).toEqual([...NAV_FACULTY_IDS, 'accounts', 'insights'])
      expect(getAllowedModules(RESETTER)).toEqual([...NAV_FACULTY_IDS, 'accounts'])
      const both = getAllowedModules({ ...ADVISOR, can_reset_passwords: true })
      expect(both.filter(id => id === 'accounts')).toHaveLength(1)
    })

    it('does not add accounts for an empty advisor section or false flag', () => {
      expect(getAllowedModules({ ...FACULTY, advisor_section: '', can_reset_passwords: false })).toEqual(NAV_FACULTY_IDS)
      expect(getAllowedModules({ ...FACULTY, advisor_section: null, can_reset_passwords: null })).toEqual(NAV_FACULTY_IDS)
    })

    it('removes modules hidden for faculty', () => {
      const ids = getAllowedModules(ADVISOR, { FACULTY: ['marks', 'accounts', 'appraisal'] })
      expect(ids).not.toContain('marks')
      expect(ids).not.toContain('accounts')
      expect(ids).not.toContain('appraisal')
      expect(ids).toContain('attendance')
    })

    it('never removes dashboard, profile or change-password', () => {
      const ids = getAllowedModules(FACULTY, { FACULTY: [...ALWAYS, 'notices'] })
      for (const id of ALWAYS) expect(ids).toContain(id)
      expect(ids).not.toContain('notices')
    })

    it('ignores menus hidden for students', () => {
      expect(getAllowedModules(FACULTY, { STUDENT: ['marks', 'attendance'] })).toEqual(NAV_FACULTY_IDS)
    })

    it('treats no setting as nothing hidden', () => {
      expect(getAllowedModules(FACULTY, null)).toEqual(NAV_FACULTY_IDS)
      expect(getAllowedModules(FACULTY, {})).toEqual(NAV_FACULTY_IDS)
    })
  })

  describe('students', () => {
    it('get the student list, with grievances but no staff modules', () => {
      const ids = getAllowedModules(STUDENT)
      expect(ids).toEqual(NAV_STUDENT_IDS)
      expect(ids).toContain('grievances')
      for (const id of ['students', 'accounts', 'config', 'audit', 'finance']) expect(ids).not.toContain(id)
    })

    it('removes modules hidden for students, keeping the always-on ones', () => {
      const ids = getAllowedModules(STUDENT, { STUDENT: ['placements', 'appraisal', ...ALWAYS] })
      expect(ids).not.toContain('placements')
      expect(ids).not.toContain('appraisal')
      for (const id of ALWAYS) expect(ids).toContain(id)
      expect(ids).toHaveLength(NAV_STUDENT_IDS.length - 2)
    })

    it('ignores menus hidden for faculty', () => {
      expect(getAllowedModules(STUDENT, { FACULTY: ['marks'] })).toEqual(NAV_STUDENT_IDS)
    })

    it('is the fallback for staff with an unknown role', () => {
      expect(getAllowedModules({ type: 'staff', role: 'LAB_ASSISTANT' })).toEqual(NAV_STUDENT_IDS)
    })
  })

  it('has a label for every module id and no duplicates in any list', () => {
    for (const list of [NAV_HOD_IDS, NAV_FACULTY_IDS, NAV_STUDENT_IDS]) {
      expect(new Set(list).size).toBe(list.length)
      for (const id of list) expect(NAV_LABELS[id], id).toBeTruthy()
    }
  })
})
