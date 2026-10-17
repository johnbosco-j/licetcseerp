import { describe, it, expect } from 'vitest'
import { parseStaffList } from '@/lib/staff-list'
import { defaultStaffPassword } from '@/lib/passwords'

describe('defaultStaffPassword', () => {
  it.each([
    ['Dr. Kavitha G', 'licet@kavitha'],
    ['Rev. Dr. M. Albert William SJ', 'licet@albertwilliam'],
    ['Mr. Arun V Rejus Kumar', 'licet@arunrejuskumar'],
    ['Ms. Princess Benita L', 'licet@princessbenita'],
  ])('%s → %s', (name, pw) => expect(defaultStaffPassword(name)).toBe(pw))
})

describe('parseStaffList', () => {
  it('reads name, email and department in any common layout', () => {
    expect(parseStaffList('Dr. Kavitha G, kavitha@licet.ac.in, S&H\nMinna Fathima <minnafathima@licet.ac.in>\n\nno email here\nSaratha B\tsaratha.b@licet.ac.in')).toEqual([
      { full_name: 'Dr. Kavitha G', email: 'kavitha@licet.ac.in', department: 'S&H' },
      { full_name: 'Minna Fathima', email: 'minnafathima@licet.ac.in', department: null },
      { full_name: 'Saratha B', email: 'saratha.b@licet.ac.in', department: null },
    ])
  })
})

import { semesterOf } from '@/lib/electives'
import { VERTICAL_CATALOG, PE_SLOTS } from '@/lib/verticals'
describe('elective plan', () => {
  it('finds the semester a batch is in', () => {
    expect(semesterOf('2026-2027', 'ODD', 2028)).toBe(5)
    expect(semesterOf('2026-2027', 'EVEN', 2028)).toBe(6)
    expect(semesterOf('2027-2028', 'ODD', 2028)).toBe(7)
    expect(semesterOf('2026-2027', 'ODD', 2027)).toBe(7)
  })
  it('has the six R2024 verticals with credits for every course', () => {
    expect(VERTICAL_CATALOG.map(v => v.code)).toEqual(['DS', 'FSD', 'DCT', 'CYBER', 'EMERGING', 'AIML'])
    expect(VERTICAL_CATALOG.find(v => v.code === 'AIML')!.courses.map(c => c.code)).toEqual(['PCS2440', 'PCS2441', 'PCS2442', 'PCS2443', 'PCS2444', 'PCS2445', 'PCS2446'])
    for (const v of VERTICAL_CATALOG) for (const c of v.courses) expect(c.credits).toBe(3)
    expect(PE_SLOTS.filter(s => s.semester === 5).map(s => s.slot)).toEqual(['PE1', 'PE2'])
  })
})
