import { supabase } from "./supabase"
import { courseResult, findCourse, gpa, letterGrade, GRADE_POINTS } from "./regulations"

export interface SubjectResult {
  subjectId:   string
  subjectCode: string
  subjectName: string
  credits:     number
  semester:    number
  internal:    number
  semEnd:      number
  total:       number
  grade:       string
  gradePoint:  number
  included:    boolean // false for 0-credit / non-GPA courses
}

export interface SemesterGPA {
  semester: number
  gpa:      number
  credits:  number
  results:  SubjectResult[]
}

export interface CGPAResult {
  cgpa:       number
  totalCredits: number
  semesters:  SemesterGPA[]
  allResults: SubjectResult[]
}

// Grade from total marks (Table 14, fixed grading)
export function getGrade(total: number): { grade: string; point: number } {
  const grade = letterGrade(total)
  return { grade, point: GRADE_POINTS[grade] }
}

export async function computeCGPA(studentId: string): Promise<CGPAResult> {
  const { data: marksData } = await supabase
    .from('marks')
    .select('*, subjects(id, code, name, credits, semester, section)')
    .eq('student_id', studentId)
  return cgpaFromMarks(marksData ?? [])
}

// Pure CGPA computation from a student's marks rows (joined with subjects).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cgpaFromMarks(marksData: any[]): CGPAResult {
  if (!marksData.length) {
    return { cgpa: 0, totalCredits: 0, semesters: [], allResults: [] }
  }

  // Group marks by subject
  const bySubject: Record<string, { subject: any; marks: Record<string, number> }> = {}
  marksData.forEach((m: any) => {
    const s = m.subjects
    if (!s) return
    if (!bySubject[s.id]) bySubject[s.id] = { subject: s, marks: {} }
    bySubject[s.id].marks[m.exam_type] = Number(m.marks_obtained)
  })

  const allResults: SubjectResult[] = []

  Object.values(bySubject).forEach(({ subject, marks }) => {
    const r = courseResult(subject.code, marks)
    if (r.pending) return // semester-end marks not entered yet — no grade
    const course  = findCourse(subject.code)
    const credits = course?.credits ?? Number(subject.credits)
    allResults.push({
      subjectId:   subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      credits,
      semester:    subject.semester,
      internal:    r.internal,
      semEnd:      r.see ?? 0,
      total:       r.total,
      grade:       r.grade,
      gradePoint:  r.gradePoint,
      included:    r.passed && (course?.inGpa ?? credits > 0),
    })
  })

  // Group by semester
  const semMap: Record<number, SubjectResult[]> = {}
  allResults.forEach(r => {
    if (!semMap[r.semester]) semMap[r.semester] = []
    semMap[r.semester].push(r)
  })

  const semesters: SemesterGPA[] = Object.entries(semMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sem, results]) => {
      const included = results.filter(r => r.included)
      return {
        semester: Number(sem),
        gpa: gpa(included.map(r => ({ credits: r.credits, gradePoint: r.gradePoint, passed: true, inGpa: true }))),
        credits: included.reduce((s, r) => s + r.credits, 0),
        results,
      }
    })

  // Overall CGPA (clause 14: U / SA and non-GPA courses excluded)
  const allIncluded = allResults.filter(r => r.included)
  const cgpa   = gpa(allIncluded.map(r => ({ credits: r.credits, gradePoint: r.gradePoint, passed: true, inGpa: true })))
  const totalC = allIncluded.reduce((s, r) => s + r.credits, 0)

  return { cgpa, totalCredits: totalC, semesters, allResults }
}

// At-risk detection
export interface RiskScore {
  studentId:     string
  riskLevel:     'SAFE' | 'WATCH' | 'AT_RISK' | 'CRITICAL'
  riskScore:     number  // 0-100
  attendancePct: number | null
  avgMarksPct:   number | null
  cgpa:          number
  flags:         string[]
  /** false when no attendance, marks or grades have been recorded yet */
  hasData:       boolean
}

export async function computeRisk(
  studentId: string,
  attendancePct: number | null,
  avgMarksPct: number | null,
  cgpa: number
): Promise<RiskScore> {
  const flags: string[] = []
  let score = 0
  const hasData = attendancePct !== null || avgMarksPct !== null || cgpa > 0

  // Attendance risk (weight: 40) — clause 7: < 65% SA, 65–74% condonation
  if (attendancePct === null)     { /* nothing recorded yet */ }
  else if (attendancePct < 65)   { score += 40; flags.push('Attendance below 65% — SA, not eligible for the semester-end examination') }
  else if (attendancePct < 75)   { score += 30; flags.push('Attendance 65–74% — condonation required') }
  else if (attendancePct < 85)   { score += 15; flags.push('Attendance below 85%') }

  // Marks risk (weight: 35)
  if (avgMarksPct === null)       { /* nothing recorded yet */ }
  else if (avgMarksPct < 45)     { score += 35; flags.push('Internal marks below 45% — may fail') }
  else if (avgMarksPct < 50)    { score += 25; flags.push('Internal marks borderline — below 50%') }
  else if (avgMarksPct < 60)    { score += 10; flags.push('Internal marks below 60%') }

  // CGPA risk (weight: 25)
  if (cgpa > 0) {
    if (cgpa < 5.0)             { score += 25; flags.push('CGPA below 5.0 — at risk of failing') }
    else if (cgpa < 6.5)        { score += 15; flags.push('CGPA below 6.5 — Second Class') }
    else if (cgpa < 7.5)        { score += 5;  flags.push('CGPA below 7.5 — no Honours eligibility') }
  }

  const riskLevel: RiskScore['riskLevel'] =
    score >= 60 ? 'CRITICAL' :
    score >= 40 ? 'AT_RISK'  :
    score >= 20 ? 'WATCH'    : 'SAFE'

  return { studentId, riskLevel, riskScore: score, attendancePct, avgMarksPct, cgpa, flags, hasData }
}

export interface StudentStats {
  /** null when no attendance has been recorded */
  attendancePct: number | null
  attendanceSessions: number
  /** null when no marks have been entered */
  avgMarksPct: number | null
  cgpa: CGPAResult
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchForStudents(table: string, select: string, column: string, ids: string[]): Promise<any[]> {
  const rows: unknown[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table as never).select(select).in(column, chunk).range(from, from + 999)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows as any[]
}

/** Attendance (session-wise), marks and CGPA for many students in a handful of requests. */
export async function loadStudentStats(studentIds: string[]): Promise<Record<string, StudentStats>> {
  const [att, marks] = await Promise.all([
    fetchForStudents('day_attendance', 'student_id, status', 'student_id', studentIds),
    fetchForStudents('marks', '*, subjects(id, code, name, credits, semester, section)', 'student_id', studentIds),
  ])
  const out: Record<string, StudentStats> = {}
  for (const id of studentIds) {
    const a = att.filter(r => r.student_id === id)
    const present = a.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
    const m = marks.filter(r => r.student_id === id)
    const obtained = m.reduce((s, r) => s + Number(r.marks_obtained), 0)
    const max = m.reduce((s, r) => s + Number(r.max_marks), 0)
    out[id] = {
      attendancePct: a.length ? Math.round(present / a.length * 100) : null,
      attendanceSessions: a.length,
      avgMarksPct: max ? Math.round(obtained / max * 100) : null,
      cgpa: cgpaFromMarks(m),
    }
  }
  return out
}

export interface DepartmentTotals {
  /** session-wise attendance (day_attendance), null when none recorded */
  attendancePct: number | null
  attendanceRecords: number
  /** average of all entered marks, null when none entered */
  marksPct: number | null
  /** share of mark entries at or above 45% (clause 12 component minimum) */
  passRate: number | null
  markEntries: number
}

/** Department-wide attendance and marks, counted exactly (no 1000-row cap). */
export async function loadDepartmentTotals(): Promise<DepartmentTotals> {
  const [total, present] = await Promise.all([
    supabase.from('day_attendance').select('id', { count: 'exact', head: true }),
    supabase.from('day_attendance').select('id', { count: 'exact', head: true }).in('status', ['PRESENT', 'LATE']),
  ])
  const marks: { marks_obtained: number; max_marks: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('marks').select('marks_obtained, max_marks').range(from, from + 999)
    if (error) throw new Error(error.message)
    marks.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const attendanceRecords = total.count ?? 0
  const obtained = marks.reduce((s, m) => s + Number(m.marks_obtained), 0)
  const max = marks.reduce((s, m) => s + Number(m.max_marks), 0)
  const passed = marks.filter(m => Number(m.marks_obtained) >= Number(m.max_marks) * 0.45).length
  return {
    attendancePct: attendanceRecords ? Math.round((present.count ?? 0) / attendanceRecords * 100) : null,
    attendanceRecords,
    marksPct: max ? Math.round(obtained / max * 100) : null,
    passRate: marks.length ? Math.round(passed / marks.length * 100) : null,
    markEntries: marks.length,
  }
}
