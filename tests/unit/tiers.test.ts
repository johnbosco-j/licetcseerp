import { describe, it, expect } from 'vitest'
import { getAllowedModules, isAdminStaff, isLabStaff, isTeaching, tierLabel } from '@/lib/roles'
import { canResetPassword } from '@/lib/passwords'
import { toolsFor, type Asker } from '@/lib/ai/tools'
import { actionsFor } from '@/lib/ai/actions'

const staff = (x: object) => ({ type: 'staff', role: 'PROFESSOR', access_tier: null, staff_type: 'TEACHING', is_admin: false, advisor_section: null, can_reset_passwords: false, ...x })

describe('tiers', () => {
  it('administrators get accounts, students and courses — no marks, attendance or timetable', () => {
    const m = getAllowedModules(staff({ staff_type: 'ADMIN' }))
    expect(m).toEqual(expect.arrayContaining(['students', 'subjects', 'accounts']))
    for (const no of ['marks', 'attendance', 'timetable', 'insights', 'export', 'config', 'leaves', 'grievances']) expect(m).not.toContain(no)
  })
  it('lab instructors get attendance and the timetable only', () => {
    const m = getAllowedModules(staff({ staff_type: 'LAB' }))
    expect(m).toContain('attendance'); expect(m).toContain('timetable')
    for (const no of ['marks', 'students', 'accounts', 'subjects', 'export']) expect(m).not.toContain(no)
  })
  it('a faculty member with administrator powers keeps the faculty menus and gains accounts', () => {
    const m = getAllowedModules(staff({ is_admin: true }))
    expect(m).toEqual(expect.arrayContaining(['marks', 'attendance', 'accounts']))
  })
  it('classifies each tier', () => {
    expect(isTeaching(staff({}))).toBe(true)
    expect(isTeaching(staff({ staff_type: 'ADMIN' }))).toBe(false)
    expect(isAdminStaff(staff({ staff_type: 'ADMIN' }))).toBe(true)
    expect(isAdminStaff(staff({ is_admin: true }))).toBe(true)
    expect(isAdminStaff(staff({}))).toBe(false)
    expect(isLabStaff(staff({ staff_type: 'LAB' }))).toBe(true)
    expect(tierLabel({ role: 'PROFESSOR', staff_type: 'TEACHING', is_admin: true })).toBe('Faculty (tier 2) + administrator')
  })
})

describe('password resets', () => {
  const student = (section: string) => ({ id: 's', role: 'STUDENT', section, access_tier: null })
  const fac = { id: 'f', role: 'PROFESSOR', section: null, access_tier: null }
  it('a class advisor resets passwords of their own class only', () => {
    const advisor = { id: 'a', role: 'PROFESSOR', advisor_section: 'III CSE-A', can_reset_passwords: false }
    expect(canResetPassword(advisor, student('III CSE-A'))).toBe(true)
    expect(canResetPassword(advisor, student('III CSE-B'))).toBe(false)
    expect(canResetPassword(advisor, fac)).toBe(false)
  })
  it('administrators reset students and faculty, never tier 1 or the HOD', () => {
    const admin = { id: 'x', role: 'PROFESSOR', advisor_section: null, can_reset_passwords: false, staff_type: 'ADMIN' }
    expect(canResetPassword(admin, student('I CSE-A'))).toBe(true)
    expect(canResetPassword(admin, fac)).toBe(true)
    expect(canResetPassword(admin, { id: 'v', role: 'PROFESSOR', section: null, access_tier: 1 })).toBe(false)
    expect(canResetPassword(admin, { id: 'h', role: 'HOD', section: null, access_tier: null })).toBe(false)
  })
  it('lab instructors cannot reset passwords', () => {
    expect(canResetPassword({ id: 'l', role: 'PROFESSOR', advisor_section: null, can_reset_passwords: false, staff_type: 'LAB' }, student('I CSE-A'))).toBe(false)
  })
})

describe('LICET AI follows the tiers', () => {
  const me = (x: Partial<Asker>): Asker => ({ id: '1', role: 'PROFESSOR', tier1: false, full_name: 'X', section: null, advisor_section: null, kind: 'TEACHING', admin: false, ...x })
  it('an administrator has no marks or attendance tools, and account drafts', () => {
    const t = toolsFor(me({ kind: 'ADMIN', admin: true })).map(x => x.name)
    for (const no of ['students_below', 'class_kpis', 'course_marks', 'find_student', 'my_courses']) expect(t).not.toContain(no)
    expect(actionsFor(me({ kind: 'ADMIN', admin: true })).map(a => a.name)).toEqual(expect.arrayContaining(['draft_students', 'draft_staff']))
    expect(actionsFor(me({ kind: 'ADMIN', admin: true })).map(a => a.name)).not.toContain('draft_marks')
  })
  it('a lab instructor drafts attendance and leave only', () => {
    expect(actionsFor(me({ kind: 'LAB' })).map(a => a.name).sort()).toEqual(['draft_attendance', 'draft_leave'])
    expect(toolsFor(me({ kind: 'LAB' })).map(x => x.name)).not.toContain('course_marks')
  })
  it('faculty with administrator powers get account drafts too', () => {
    expect(actionsFor(me({ admin: true })).map(a => a.name)).toEqual(expect.arrayContaining(['draft_marks', 'draft_students']))
    expect(actionsFor(me({})).map(a => a.name)).not.toContain('draft_students')
  })
})
