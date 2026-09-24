// LICET Regulations 2024 (CBCS) and the B.E. CSE R2024 curriculum.
// Every grade/pass/attendance rule in the ERP should come from here.

export type CourseType = 'THEORY' | 'LAB_INTEGRATED' | 'LAB' | 'PROJECT' | 'FORMATION'

export interface Course {
  code: string
  title: string
  semester: number
  category: 'HSMC' | 'BSC' | 'ESC' | 'PCC' | 'PEC' | 'OEC' | 'EEC'
  L: number; T: number; P: number
  credits: number
  type: CourseType
  /** false for 0-credit and "#" courses that are not included for GPA */
  inGpa: boolean
}

const c = (code: string, title: string, semester: number, category: Course['category'],
  L: number, T: number, P: number, credits: number, type: CourseType, inGpa = true): Course =>
  ({ code, title, semester, category, L, T, P, credits, type, inGpa: inGpa && credits > 0 })

// Curriculum and Syllabi R-2024, B.E. Computer Science and Engineering (Semesters I–VIII).
export const CSE_R2024: Course[] = [
  c('MA24101', 'Calculus for Engineers', 1, 'BSC', 3, 1, 0, 4, 'THEORY'),
  c('BE24101', 'Basic Electrical and Electronics Engineering', 1, 'ESC', 3, 0, 0, 3, 'THEORY'),
  c('CY24101', 'Applied Chemistry', 1, 'BSC', 3, 0, 0, 3, 'THEORY'),
  c('HS24101', 'English for Professional Communication', 1, 'HSMC', 3, 0, 0, 3, 'THEORY'),
  c('GE24101', 'Heritage of Tamils', 1, 'HSMC', 1, 0, 0, 1, 'THEORY'),
  c('GE24112', 'Problem Solving using Python', 1, 'ESC', 2, 0, 4, 4, 'LAB_INTEGRATED'),
  c('CY24121', 'Engineering Chemistry Laboratory', 1, 'BSC', 0, 0, 2, 1, 'LAB'),
  c('GE24121', 'Engineering Practices Laboratory – Civil and Mechanical', 1, 'ESC', 0, 0, 2, 1, 'LAB'),
  c('FC24101', 'Life Skills', 1, 'HSMC', 2, 0, 0, 1, 'FORMATION'),

  c('MA24201', 'Probability and Queuing Theory', 2, 'BSC', 3, 1, 0, 4, 'THEORY'),
  c('CS24201', 'Programming in C', 2, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('PH24201', 'Physics for Information Science', 2, 'BSC', 3, 0, 0, 3, 'THEORY'),
  c('GE24201', 'Tamils and Technology', 2, 'HSMC', 1, 0, 0, 1, 'THEORY'),
  c('GE24111', 'Engineering Graphics', 2, 'ESC', 2, 0, 4, 4, 'LAB_INTEGRATED'),
  c('CS24221', 'C Programming Laboratory', 2, 'PCC', 0, 0, 4, 2, 'LAB'),
  c('GE24122', 'Engineering Practices Laboratory – Electrical and Electronics', 2, 'ESC', 0, 0, 2, 1, 'LAB'),
  c('PH24121', 'Physics Laboratory', 2, 'BSC', 0, 0, 2, 1, 'LAB'),
  c('GE24123', 'Design Thinking', 2, 'HSMC', 0, 0, 2, 1, 'FORMATION'),
  c('FC24102', 'Cultural Identities and Globalization', 2, 'HSMC', 2, 0, 0, 0, 'FORMATION'),

  c('MA24301', 'Discrete Mathematics', 3, 'BSC', 3, 1, 0, 4, 'THEORY'),
  c('BS24301', 'Environmental Science and Sustainability', 3, 'BSC', 3, 0, 0, 3, 'THEORY'),
  c('CS24301', 'Data Structures', 3, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('CS24302', 'Database Management Systems', 3, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('CS24311', 'Digital Principles and Computer Organization', 3, 'ESC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24312', 'Object Oriented Programming in JAVA', 3, 'PCC', 2, 0, 4, 4, 'LAB_INTEGRATED'),
  c('CS24321', 'Data Structures Laboratory', 3, 'PCC', 0, 0, 3, 1.5, 'LAB'),
  c('CS24322', 'Database Management Systems Laboratory', 3, 'PCC', 0, 0, 3, 1.5, 'LAB'),
  c('FC24301', 'Soft Skills', 3, 'HSMC', 2, 0, 0, 1, 'FORMATION'),
  c('BS24321', 'System Discovery and Analysis', 3, 'BSC', 0, 0, 2, 0, 'FORMATION'),

  c('MA24401', 'Linear Algebra and Number Theory', 4, 'BSC', 3, 1, 0, 4, 'THEORY'),
  c('CS24401', 'Operating Systems', 4, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('CS24402', 'Microprocessors and Microcontrollers', 4, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('CS24411', 'Design and Analysis of Algorithms', 4, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24412', 'Object Oriented Software Engineering', 4, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24413', 'Foundations of Data Science', 4, 'PCC', 2, 0, 2, 3, 'LAB_INTEGRATED'),
  c('CS24421', 'Operating Systems Laboratory', 4, 'PCC', 0, 0, 3, 1.5, 'LAB'),
  c('CS24422', 'Microprocessors and Microcontrollers Laboratory', 4, 'PCC', 0, 0, 3, 1.5, 'LAB'),
  c('HS24321', 'Communication Skills Building Laboratory', 4, 'HSMC', 0, 0, 2, 1, 'FORMATION'),
  c('CS24423', 'Project Driven Learning', 4, 'EEC', 0, 0, 2, 1, 'FORMATION'),

  c('CS24501', 'Theory of Computation', 5, 'PCC', 3, 0, 0, 3, 'THEORY'),
  c('GE24501', 'Project Management and Operations Management', 5, 'HSMC', 2, 0, 0, 2, 'THEORY'),
  c('CS24511', 'Artificial Intelligence and Machine Learning', 5, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24512', 'Computer Networks', 5, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('FC24501', 'Universal Human Values and Service Learning', 5, 'HSMC', 1, 0, 1, 1, 'FORMATION'),
  c('BS24502', 'Logical Reasoning and Aptitude Training', 5, 'BSC', 2, 0, 0, 1, 'FORMATION', false),
  c('GE24503', 'Financial Literacy', 5, 'HSMC', 2, 0, 0, 0, 'FORMATION'),

  c('CS24601', 'Compiler Design', 6, 'PCC', 4, 0, 0, 4, 'THEORY'),
  c('GE24502', 'Entrepreneurship and International Business Market', 6, 'HSMC', 2, 0, 0, 2, 'THEORY'),
  c('CS24611', 'Distributed and Cloud Computing', 6, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24612', 'Embedded Systems and IoT', 6, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24613', 'Internet Programming', 6, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('GE24621', 'Interdisciplinary Project', 6, 'EEC', 0, 0, 2, 1, 'FORMATION'),
  c('GE24622', 'Problem Solving Techniques', 6, 'EEC', 0, 0, 2, 1, 'FORMATION', false),

  c('GE24701', 'Working to Engineer a Better World', 7, 'HSMC', 2, 0, 0, 2, 'THEORY'),
  c('CS24711', 'Cryptography and Cyber Security', 7, 'PCC', 3, 0, 2, 4, 'LAB_INTEGRATED'),
  c('CS24721', 'Professional Project - I', 7, 'EEC', 0, 0, 4, 2, 'PROJECT'),
  c('CS24722', 'Internship', 7, 'EEC', 0, 0, 0, 2, 'FORMATION'),

  c('CS24821', 'Professional Project – II', 8, 'EEC', 0, 0, 20, 10, 'PROJECT'),
]

const BY_CODE = new Map(CSE_R2024.map(x => [x.code, x]))

export function findCourse(code: string | null | undefined): Course | undefined {
  if (!code) return undefined
  const key = code.trim().toUpperCase()
  return BY_CODE.get(key) ?? BY_CODE.get(key.slice(0, 7))
}

/** Courses not in the catalogue (electives, older codes) default to theory. */
export function courseType(code: string | null | undefined): CourseType {
  return findCourse(code)?.type ?? 'THEORY'
}

/** Table 5 — maximum internal (CIA) and semester-end (SEE) marks. */
export function markSplit(type: CourseType): { internal: number; see: number } {
  switch (type) {
    case 'THEORY': return { internal: 40, see: 60 }
    case 'LAB_INTEGRATED': return { internal: 50, see: 50 }
    case 'LAB': return { internal: 60, see: 40 }
    case 'PROJECT': return { internal: 60, see: 40 }
    case 'FORMATION': return { internal: 100, see: 0 }
  }
}

/** Table 7 — theory (X) / lab (Y) share of the 50 internal marks by L-T-P-C. */
export function labIntegratedWeights(code: string | null | undefined): { theory: number; lab: number } {
  const course = findCourse(code)
  if (course && course.L === 2 && course.P === 4) return { theory: 25, lab: 25 }
  return { theory: 30, lab: 20 }
}

export type MarkMap = Record<string, number | undefined>
const n = (v: number | undefined) => Number(v ?? 0)

// Table 6 — each theory CIA is out of 100: concept test 20%, CAT 40%, activity 40%.
const theoryCia = (m: MarkMap, k: 'CIA1' | 'CIA2') =>
  n(m[`${k}_CT`]) / 30 * 20 + n(m[`${k}_CAT`]) / 60 * 40 + n(m[`${k}_ACTIVITY`]) / 10 * 40
// Table 8 — lab-integrated theory part is concept test + CAT only (as % of their 60).
const litTheoryPct = (m: MarkMap, k: 'CIA1' | 'CIA2') =>
  (n(m[`${k}_CT`]) / 30 * 20 + n(m[`${k}_CAT`]) / 60 * 40) / 60
// Table 9 — lab CIA: experiments, record, viva, lab assessment, 25 each.
const labCia = (m: MarkMap, k: 'CIA1' | 'CIA2') =>
  n(m[`${k}_EXP`]) + n(m[`${k}_RECORD`]) + n(m[`${k}_VIVA`]) + n(m[`${k}_LAB`])

/** Clause 11 — internal marks, proportionately reduced and rounded to the nearest integer. */
export function internalMarks(code: string, m: MarkMap): number {
  const type = courseType(code)
  if (type === 'THEORY') return Math.round((theoryCia(m, 'CIA1') + theoryCia(m, 'CIA2')) / 200 * 40)
  if (type === 'LAB' || type === 'PROJECT') return Math.round((labCia(m, 'CIA1') + labCia(m, 'CIA2')) / 200 * 60)
  if (type === 'LAB_INTEGRATED') {
    const w = labIntegratedWeights(code)
    const theory = (litTheoryPct(m, 'CIA1') + litTheoryPct(m, 'CIA2')) / 2
    const lab = (labCia(m, 'CIA1') + labCia(m, 'CIA2')) / 200
    return Math.round(theory * w.theory + lab * w.lab)
  }
  return Math.round(Math.min(100, n(m['INTERNAL'] ?? m['SEM_END'])))
}

export const GRADE_POINTS: Record<string, number> = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, U: 0 }

/** Table 14 — fixed grading on the total out of 100. */
export function letterGrade(total: number): string {
  if (total >= 91) return 'O'
  if (total >= 81) return 'A+'
  if (total >= 71) return 'A'
  if (total >= 61) return 'B+'
  if (total >= 56) return 'B'
  if (total >= 50) return 'C'
  return 'U'
}

export interface CourseResult {
  type: CourseType
  internal: number
  internalMax: number
  see: number | null
  seeMax: number
  total: number
  grade: string          // O … C, U, or '—' while the SEE is not entered
  gradePoint: number
  passed: boolean
  pending: boolean
  reason?: string
}

/**
 * Clause 12 — pass needs ≥ 50% of the total and ≥ 45% in both CIA and SEE.
 * Formation/EEC courses assessed only internally pass at 50% (clause 12.4).
 */
export function courseResult(code: string, m: MarkMap): CourseResult {
  const type = courseType(code)
  const { internal: internalMax, see: seeMax } = markSplit(type)
  const internal = internalMarks(code, m)

  if (type === 'FORMATION') {
    const passed = internal >= 50
    const grade = passed ? letterGrade(internal) : 'U'
    return { type, internal, internalMax, see: null, seeMax: 0, total: internal, grade, gradePoint: GRADE_POINTS[grade], passed, pending: false,
      reason: passed ? undefined : 'Below 50% in continuous assessment' }
  }

  const seeRaw = m['SEM_END']
  if (seeRaw === undefined || seeRaw === null) {
    return { type, internal, internalMax, see: null, seeMax, total: internal, grade: '—', gradePoint: 0, passed: false, pending: true }
  }
  const see = Number(seeRaw)
  const total = internal + see
  let reason: string | undefined
  if (internal < 0.45 * internalMax) reason = `Internal below 45% (${internal}/${internalMax})`
  else if (see < 0.45 * seeMax) reason = `Semester-end exam below 45% (${see}/${seeMax})`
  else if (total < 50) reason = 'Total below 50%'
  const grade = reason ? 'U' : letterGrade(total)
  return { type, internal, internalMax, see, seeMax, total, grade, gradePoint: GRADE_POINTS[grade], passed: !reason, pending: false, reason }
}

/** Clause 14 — GPA/CGPA over passed curricular courses; U, SA and non-GPA courses excluded. */
export function gpa(results: { credits: number; gradePoint: number; passed: boolean; inGpa: boolean }[]): number {
  const counted = results.filter(r => r.passed && r.inGpa && r.credits > 0)
  const credits = counted.reduce((s, r) => s + r.credits, 0)
  if (!credits) return 0
  return Math.round(counted.reduce((s, r) => s + r.credits * r.gradePoint, 0) / credits * 100) / 100
}

/** Clause 7 / Table 4 — attendance classification and eligibility for the semester-end exam. */
export function attendanceStatus(pct: number): { code: string; label: string; eligible: 'YES' | 'CONDONATION' | 'NO'; tone: 'good' | 'warn' | 'bad' } {
  const p = Math.round(pct)
  if (p >= 95) return { code: 'VG', label: 'Very Good', eligible: 'YES', tone: 'good' }
  if (p >= 85) return { code: 'G', label: 'Good', eligible: 'YES', tone: 'good' }
  if (p >= 75) return { code: 'S', label: 'Satisfactory', eligible: 'YES', tone: 'good' }
  if (p >= 65) return { code: 'C', label: 'Needs medical/sports condonation', eligible: 'CONDONATION', tone: 'warn' }
  return { code: 'SA', label: 'Shortage of attendance — not permitted', eligible: 'NO', tone: 'bad' }
}

export const ATTENDANCE_MIN = 75
export const ATTENDANCE_CONDONATION_MIN = 65

/** Clause 15.2 — classification of the degree by CGPA. */
export function degreeClass(cgpa: number, firstAttempt: boolean): string {
  if (cgpa >= 8.5 && firstAttempt) return 'First Class with Distinction'
  if (cgpa >= 6.5) return 'First Class'
  return 'Second Class'
}
