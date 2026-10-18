import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_CONDONATION_MIN,
  ATTENDANCE_MIN,
  CSE_R2024,
  GRADE_POINTS,
  attendanceStatus,
  courseResult,
  courseType,
  degreeClass,
  findCourse,
  gpa,
  internalMarks,
  labIntegratedWeights,
  letterGrade,
  markSplit,
  type CourseType,
  type MarkMap,
} from '@/lib/regulations'

// Course codes used below, with their L-T-P-C from the R2024 curriculum.
const THEORY = 'CS24301'          // Data Structures, 3-0-0-3
const LAB = 'CS24221'             // C Programming Laboratory, 0-0-4-2
const LIT_2_0_4 = 'GE24112'       // Problem Solving using Python, 2-0-4-4
const LIT_3_0_2 = 'CS24511'       // AI and ML, 3-0-2-4
const LIT_2_0_2 = 'CS24413'       // Foundations of Data Science, 2-0-2-3
const FORMATION = 'FC24101'       // Life Skills
const PROJECT = 'CS24721'         // Professional Project - I

/** Same marks for both CIAs. */
const both = (marks: Record<string, number>): MarkMap =>
  Object.fromEntries(Object.entries(marks).flatMap(([k, v]) => [[`CIA1_${k}`, v], [`CIA2_${k}`, v]]))

const FULL_THEORY = both({ CT: 30, CAT: 60, ACTIVITY: 40 })
const FULL_LAB = both({ EXP: 25, RECORD: 25, VIVA: 25, LAB: 25 })

describe('curriculum catalogue', () => {
  it('has unique 7-character course codes covering semesters I to VIII', () => {
    const codes = CSE_R2024.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}\d{5}$/)
    expect([...new Set(CSE_R2024.map(c => c.semester))].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('excludes 0-credit and "#" courses from the GPA', () => {
    expect(findCourse('FC24102')?.credits).toBe(0)
    expect(findCourse('FC24102')?.inGpa).toBe(false)
    expect(findCourse('BS24502')?.credits).toBe(1)   // marked "#" in the curriculum
    expect(findCourse('BS24502')?.inGpa).toBe(false)
    expect(findCourse('CS24301')?.inGpa).toBe(true)
  })
})

describe('findCourse', () => {
  it('finds a course by exact code', () => {
    expect(findCourse('CS24301')?.title).toBe('Data Structures')
  })

  it('ignores case and surrounding whitespace', () => {
    expect(findCourse('  cs24301 ')?.code).toBe('CS24301')
  })

  it('falls back to the first 7 characters (suffixed codes)', () => {
    expect(findCourse('CS24301A')?.code).toBe('CS24301')
    expect(findCourse('cs24312-lab')?.code).toBe('CS24312')
  })

  it('returns undefined for empty or unknown codes', () => {
    expect(findCourse(null)).toBeUndefined()
    expect(findCourse(undefined)).toBeUndefined()
    expect(findCourse('')).toBeUndefined()
    expect(findCourse('XX99999')).toBeUndefined()
    expect(findCourse('CS2430')).toBeUndefined()
  })
})

describe('courseType', () => {
  it('reads the type from the catalogue', () => {
    expect(courseType(THEORY)).toBe('THEORY')
    expect(courseType(LAB)).toBe('LAB')
    expect(courseType(LIT_3_0_2)).toBe('LAB_INTEGRATED')
    expect(courseType(FORMATION)).toBe('FORMATION')
    expect(courseType(PROJECT)).toBe('PROJECT')
  })

  it('defaults unknown codes (electives, old regulations) to THEORY', () => {
    expect(courseType('CS3591')).toBe('THEORY')
    expect(courseType(null)).toBe('THEORY')
    expect(courseType(undefined)).toBe('THEORY')
  })
})

describe('markSplit (Table 5)', () => {
  it.each<[CourseType, number, number]>([
    ['THEORY', 40, 60],
    ['LAB_INTEGRATED', 50, 50],
    ['LAB', 60, 40],
    ['PROJECT', 60, 40],
    ['FORMATION', 100, 0],
  ])('%s → internal %i / SEE %i', (type, internal, see) => {
    expect(markSplit(type)).toEqual({ internal, see })
    expect(internal + see).toBe(100)
  })
})

describe('labIntegratedWeights (Table 7)', () => {
  it('splits 25/25 for 2-0-4 courses', () => {
    expect(labIntegratedWeights(LIT_2_0_4)).toEqual({ theory: 25, lab: 25 })
    expect(labIntegratedWeights('GE24111')).toEqual({ theory: 25, lab: 25 })
    expect(labIntegratedWeights('CS24312')).toEqual({ theory: 25, lab: 25 })
  })

  it('splits 30/20 for 3-0-2 and 2-0-2 courses', () => {
    expect(labIntegratedWeights(LIT_3_0_2)).toEqual({ theory: 30, lab: 20 })
    expect(labIntegratedWeights(LIT_2_0_2)).toEqual({ theory: 30, lab: 20 })
  })

  it('defaults to 30/20 for unknown codes', () => {
    expect(labIntegratedWeights('ZZ00000')).toEqual({ theory: 30, lab: 20 })
    expect(labIntegratedWeights(null)).toEqual({ theory: 30, lab: 20 })
  })

  it('always totals the 50 internal marks', () => {
    for (const c of CSE_R2024.filter(x => x.type === 'LAB_INTEGRATED')) {
      const w = labIntegratedWeights(c.code)
      expect(w.theory + w.lab).toBe(markSplit('LAB_INTEGRATED').internal)
    }
  })
})

describe('internalMarks', () => {
  describe('THEORY (Table 6: CT 20%, CAT 40%, activity 40% per CIA, reduced to 40)', () => {
    it('gives 40 for full marks and 0 for no marks', () => {
      expect(internalMarks(THEORY, FULL_THEORY)).toBe(40)
      expect(internalMarks(THEORY, {})).toBe(0)
    })

    it('weights each component and averages the two CIAs', () => {
      // CIA1: 24/30·20 + 45/60·40 + 32/40·40 = 16 + 30 + 32 = 78
      // CIA2: 18/30·20 + 39/60·40 + 36/40·40 = 12 + 26 + 36 = 74
      // (78 + 74) / 200 · 40 = 30.4 → 30
      const m = { CIA1_CT: 24, CIA1_CAT: 45, CIA1_ACTIVITY: 32, CIA2_CT: 18, CIA2_CAT: 39, CIA2_ACTIVITY: 36 }
      expect(internalMarks(THEORY, m)).toBe(30)
    })

    it('rounds to the nearest integer', () => {
      // CIA1 full (100) + CIA2 ABA 24/40 (24) = 124 / 200 · 40 = 24.8 → 25
      expect(internalMarks(THEORY, { CIA1_CT: 30, CIA1_CAT: 60, CIA1_ACTIVITY: 40, CIA2_ACTIVITY: 24 })).toBe(25)
    })

    it('treats a missing CIA as zero', () => {
      expect(internalMarks(THEORY, { CIA1_CT: 30, CIA1_CAT: 60, CIA1_ACTIVITY: 40 })).toBe(20)
    })

    it('ignores lab components', () => {
      expect(internalMarks(THEORY, FULL_LAB)).toBe(0)
    })
  })

  describe('LAB and PROJECT (Table 9: four components of 25 per CIA, reduced to 60)', () => {
    it('gives 60 for full marks', () => {
      expect(internalMarks(LAB, FULL_LAB)).toBe(60)
      expect(internalMarks(PROJECT, FULL_LAB)).toBe(60)
    })

    it('sums the components', () => {
      // CIA1 20+22+18+20 = 80, CIA2 25+25+20+20 = 90 → 170/200·60 = 51
      const m = {
        CIA1_EXP: 20, CIA1_RECORD: 22, CIA1_VIVA: 18, CIA1_LAB: 20,
        CIA2_EXP: 25, CIA2_RECORD: 25, CIA2_VIVA: 20, CIA2_LAB: 20,
      }
      expect(internalMarks(LAB, m)).toBe(51)
      expect(internalMarks(PROJECT, m)).toBe(51)
    })

    it('ignores theory components', () => {
      expect(internalMarks(LAB, FULL_THEORY)).toBe(0)
    })
  })

  describe('LAB_INTEGRATED (as the IA sheets: theory CT 30 + CAT 60 + assignment 10, lab LP 75 + PT 25, weighted by Table 7)', () => {
    it('gives 50 for full marks whatever the weights', () => {
      const full = { ...both({ CT: 30, CAT: 60, ACTIVITY: 10 }), ...FULL_LAB }
      expect(internalMarks(LIT_2_0_4, full)).toBe(50)
      expect(internalMarks(LIT_3_0_2, full)).toBe(50)
    })

    it('applies the course weights to the theory and lab percentages', () => {
      // theory: 15 + 30 + 5 = 50 of 100; lab: 75/100 in both CIAs (older experiment/record/viva/lab rows count as LP + PT)
      const m = { ...both({ CT: 15, CAT: 30, ACTIVITY: 5 }), ...both({ EXP: 20, RECORD: 20, VIVA: 20, LAB: 15 }) }
      expect(internalMarks(LIT_3_0_2, m)).toBe(30)   // 0.5·30 + 0.75·20 = 15 + 15
      expect(internalMarks(LIT_2_0_4, m)).toBe(32)   // each part rounded, as in the sheets: 12.5 → 13, 18.75 → 19
    })

    it('counts the assignment / ABA in the theory part, as the IA sheets do', () => {
      const m = { ...both({ CT: 15, CAT: 30 }), ...both({ LP: 60, PT: 15 }) }
      expect(internalMarks(LIT_3_0_2, m)).toBe(29)                                    // theory 45% → 13.5 → 14, lab 15
      expect(internalMarks(LIT_3_0_2, { ...m, ...both({ ACTIVITY: 10 }) })).toBe(32)  // theory 55% → 16.5 → 17, lab 15
    })

    it('gives theory-only and lab-only shares', () => {
      expect(internalMarks(LIT_3_0_2, both({ CT: 30, CAT: 60, ACTIVITY: 10 }))).toBe(30)
      expect(internalMarks(LIT_3_0_2, FULL_LAB)).toBe(20)
    })
  })

  describe('FORMATION (continuous assessment out of 100)', () => {
    it('uses INTERNAL, capped at 100', () => {
      expect(internalMarks(FORMATION, { INTERNAL: 78 })).toBe(78)
      expect(internalMarks(FORMATION, { INTERNAL: 120 })).toBe(100)
      expect(internalMarks(FORMATION, { INTERNAL: 67.5 })).toBe(68)
    })

    it('falls back to SEM_END when INTERNAL is not entered', () => {
      expect(internalMarks(FORMATION, { SEM_END: 66 })).toBe(66)
      expect(internalMarks(FORMATION, { INTERNAL: 0, SEM_END: 80 })).toBe(0)
      expect(internalMarks(FORMATION, {})).toBe(0)
    })
  })
})

describe('letterGrade (Table 14)', () => {
  it.each([
    [100, 'O'], [91, 'O'],
    [90, 'A+'], [81, 'A+'],
    [80, 'A'], [71, 'A'],
    [70, 'B+'], [61, 'B+'],
    [60, 'B'], [56, 'B'],
    [55, 'C'], [50, 'C'],
    [49, 'U'], [0, 'U'],
  ])('%i → %s', (total, grade) => {
    expect(letterGrade(total)).toBe(grade)
  })

  it('does not round a fractional total up into the next grade', () => {
    expect(letterGrade(90.9)).toBe('A+')
    expect(letterGrade(49.9)).toBe('U')
  })
})

describe('GRADE_POINTS', () => {
  it('maps grades to points', () => {
    expect(GRADE_POINTS).toEqual({ O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, U: 0 })
  })

  it('has a point for every grade letterGrade can return', () => {
    for (let t = 0; t <= 100; t++) expect(GRADE_POINTS[letterGrade(t)]).toBeTypeOf('number')
  })
})

describe('courseResult (Clause 12)', () => {
  it('is pending, not failed, until the SEE is entered', () => {
    const r = courseResult(THEORY, FULL_THEORY)
    expect(r).toMatchObject({ internal: 40, see: null, total: 40, grade: '—', gradePoint: 0, passed: false, pending: true })
  })

  describe('THEORY: internal ≥ 18/40, SEE ≥ 27/60, total ≥ 50', () => {
    // CIA1 60 (CT + CAT full, no ABA) + CIA2 30 (CT 15 → 10, ABA 20/40 → 20) = 90 / 200 · 40 = 18
    const internal18 = { CIA1_CT: 30, CIA1_CAT: 60, CIA2_CT: 15, CIA2_ACTIVITY: 20 }
    // CIA1 60 + CIA2 ABA 24/40 (24) = 84 / 200 · 40 = 16.8 → 17
    const internal17 = { CIA1_CT: 30, CIA1_CAT: 60, CIA2_ACTIVITY: 24 }

    it('passes with grade and grade point from the total', () => {
      const r = courseResult(THEORY, { ...FULL_THEORY, SEM_END: 52 })
      expect(r).toMatchObject({ type: 'THEORY', internal: 40, internalMax: 40, see: 52, seeMax: 60, total: 92, grade: 'O', gradePoint: 10, passed: true, pending: false })
      expect(r.reason).toBeUndefined()
    })

    it('fails below 45% internal even when the total would pass', () => {
      expect(internalMarks(THEORY, internal17)).toBe(17)
      const r = courseResult(THEORY, { ...internal17, SEM_END: 60 })
      expect(r.total).toBe(77)
      expect(r).toMatchObject({ grade: 'U', gradePoint: 0, passed: false })
      expect(r.reason).toMatch(/Internal below 45%/)
    })

    it('fails below 45% in the SEE even when the total would pass', () => {
      const r = courseResult(THEORY, { ...FULL_THEORY, SEM_END: 26 })
      expect(r.total).toBe(66)
      expect(r).toMatchObject({ grade: 'U', passed: false })
      expect(r.reason).toMatch(/Semester-end exam below 45%/)
    })

    it('fails when both parts clear 45% but the total is below 50', () => {
      expect(internalMarks(THEORY, internal18)).toBe(18)
      const r = courseResult(THEORY, { ...internal18, SEM_END: 27 })
      expect(r).toMatchObject({ internal: 18, see: 27, total: 45, grade: 'U', passed: false, reason: 'Total below 50%' })
    })

    it('passes with C at exactly 45% / 45% / 50%', () => {
      const r = courseResult(THEORY, { ...internal18, SEM_END: 32 })
      expect(r).toMatchObject({ total: 50, grade: 'C', gradePoint: 5, passed: true })
    })

    it('fails with a zero SEE (absent) rather than leaving it pending', () => {
      const r = courseResult(THEORY, { ...FULL_THEORY, SEM_END: 0 })
      expect(r).toMatchObject({ pending: false, passed: false, grade: 'U' })
    })
  })

  describe('LAB: internal ≥ 27/60, SEE ≥ 18/40', () => {
    it('fails at 17/40 and passes at 18/40 in the SEE', () => {
      expect(courseResult(LAB, { ...FULL_LAB, SEM_END: 17 })).toMatchObject({ passed: false, grade: 'U' })
      expect(courseResult(LAB, { ...FULL_LAB, SEM_END: 18 })).toMatchObject({ total: 78, grade: 'A', passed: true, internalMax: 60, seeMax: 40 })
    })

    it('fails below 27/60 internal', () => {
      // 26/60 ↔ 86.67/200 lab marks; use 86 → 25.8 → 26
      const m = { CIA1_EXP: 25, CIA1_RECORD: 25, CIA1_VIVA: 25, CIA1_LAB: 11 }
      expect(internalMarks(LAB, m)).toBe(26)
      expect(courseResult(LAB, { ...m, SEM_END: 40 }).reason).toMatch(/Internal below 45% \(26\/60\)/)
    })
  })

  describe('LAB_INTEGRATED: internal ≥ 22.5/50, SEE ≥ 22.5/50', () => {
    const full = { ...both({ CT: 30, CAT: 60, ACTIVITY: 10 }), ...FULL_LAB }

    it('needs 23 in the SEE (22 is below 45% of 50)', () => {
      expect(courseResult(LIT_3_0_2, { ...full, SEM_END: 22 })).toMatchObject({ passed: false, grade: 'U' })
      expect(courseResult(LIT_3_0_2, { ...full, SEM_END: 23 })).toMatchObject({ total: 73, grade: 'A', passed: true, internalMax: 50, seeMax: 50 })
    })
  })

  describe('FORMATION: assessed internally, pass at 50', () => {
    it('passes at 50 with grade C', () => {
      const r = courseResult(FORMATION, { INTERNAL: 50 })
      expect(r).toMatchObject({ type: 'FORMATION', internal: 50, internalMax: 100, see: null, seeMax: 0, total: 50, grade: 'C', gradePoint: 5, passed: true, pending: false })
    })

    it('fails at 49 with a reason', () => {
      const r = courseResult(FORMATION, { INTERNAL: 49 })
      expect(r).toMatchObject({ grade: 'U', gradePoint: 0, passed: false, pending: false })
      expect(r.reason).toMatch(/Below 50%/)
    })

    it('is never pending', () => {
      expect(courseResult(FORMATION, {}).pending).toBe(false)
    })

    it('grades high scores like any course', () => {
      expect(courseResult(FORMATION, { INTERNAL: 95 }).grade).toBe('O')
    })
  })
})

describe('gpa (Clause 14)', () => {
  const r = (credits: number, gradePoint: number, passed = true, inGpa = true) => ({ credits, gradePoint, passed, inGpa })

  it('is the credit-weighted mean, rounded to 2 decimals', () => {
    expect(gpa([r(4, 10), r(3, 8)])).toBe(9.14)   // 64 / 7 = 9.142857…
    expect(gpa([r(3, 9), r(3, 7)])).toBe(8)
  })

  it('handles half credits', () => {
    expect(gpa([r(1.5, 10), r(4, 6)])).toBe(7.09)  // (15 + 24) / 5.5 = 7.0909…
  })

  it('excludes failed, non-GPA and 0-credit courses', () => {
    expect(gpa([r(4, 9), r(3, 0, false), r(1, 10, true, false), r(0, 10)])).toBe(9)
  })

  it('is 0 when nothing counts', () => {
    expect(gpa([])).toBe(0)
    expect(gpa([r(3, 0, false)])).toBe(0)
  })
})

describe('attendanceStatus (Clause 7 / Table 4)', () => {
  it.each([
    [100, 'VG', 'YES'], [95, 'VG', 'YES'], [94.5, 'VG', 'YES'], [94.4, 'G', 'YES'],
    [85, 'G', 'YES'], [84.9, 'G', 'YES'], [84.4, 'S', 'YES'],
    [75, 'S', 'YES'], [74.5, 'S', 'YES'], [74.4, 'C', 'CONDONATION'],
    [65, 'C', 'CONDONATION'], [64.5, 'C', 'CONDONATION'], [64.4, 'SA', 'NO'], [0, 'SA', 'NO'],
  ])('%f%% → %s (%s)', (pct, code, eligible) => {
    expect(attendanceStatus(pct)).toMatchObject({ code, eligible })
  })

  it('exports the thresholds it uses', () => {
    expect(ATTENDANCE_MIN).toBe(75)
    expect(ATTENDANCE_CONDONATION_MIN).toBe(65)
    expect(attendanceStatus(ATTENDANCE_MIN).eligible).toBe('YES')
    expect(attendanceStatus(ATTENDANCE_CONDONATION_MIN).eligible).toBe('CONDONATION')
  })
})

describe('degreeClass (Clause 15.2)', () => {
  it('awards distinction only at CGPA ≥ 8.5 on the first attempt', () => {
    expect(degreeClass(8.5, true)).toBe('First Class with Distinction')
    expect(degreeClass(9.9, true)).toBe('First Class with Distinction')
    expect(degreeClass(8.5, false)).toBe('First Class')
    expect(degreeClass(8.49, true)).toBe('First Class')
  })

  it('splits first and second class at 6.5', () => {
    expect(degreeClass(6.5, false)).toBe('First Class')
    expect(degreeClass(6.49, true)).toBe('Second Class')
  })
})
