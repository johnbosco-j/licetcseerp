import { supabase } from "./supabase"

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

// Grade from total marks
export function getGrade(total: number): { grade: string; point: number } {
  if (total >= 91) return { grade: 'O',  point: 10 }
  if (total >= 81) return { grade: 'A+', point: 9  }
  if (total >= 71) return { grade: 'A',  point: 8  }
  if (total >= 61) return { grade: 'B+', point: 7  }
  if (total >= 56) return { grade: 'B',  point: 6  }
  if (total >= 50) return { grade: 'C',  point: 5  }
  return { grade: 'U', point: 0 }
}

// CIA computation per course type
function computeInternal(marks: Record<string, number>, courseType: string): number {
  if (courseType === 'THEORY') {
    const cia1 = (marks['CIA1_CT']??0)/30*20 + (marks['CIA1_CAT']??0)/60*40 + (marks['CIA1_ACTIVITY']??0)/10*40
    const cia2 = (marks['CIA2_CT']??0)/30*20 + (marks['CIA2_CAT']??0)/60*40 + (marks['CIA2_ACTIVITY']??0)/10*40
    return Math.round((cia1 + cia2) / 2 / 100 * 40)
  }
  if (courseType === 'LAB') {
    const lab1 = (marks['CIA1_EXP']??0) + (marks['CIA1_RECORD']??0) + (marks['CIA1_VIVA']??0) + (marks['CIA1_LAB']??0)
    const lab2 = (marks['CIA2_EXP']??0) + (marks['CIA2_RECORD']??0) + (marks['CIA2_VIVA']??0) + (marks['CIA2_LAB']??0)
    return Math.round((lab1 + lab2) / 2 / 100 * 60)
  }
  if (courseType === 'LAB_INTEGRATED') {
    const cia1 = (marks['CIA1_CT']??0)/30*20 + (marks['CIA1_CAT']??0)/60*40 + (marks['CIA1_ACTIVITY']??0)/10*40
    const cia2 = (marks['CIA2_CT']??0)/30*20 + (marks['CIA2_CAT']??0)/60*40 + (marks['CIA2_ACTIVITY']??0)/10*40
    const theory = Math.round((cia1 + cia2) / 2 / 100 * 40)
    const lab1 = (marks['CIA1_EXP']??0) + (marks['CIA1_RECORD']??0) + (marks['CIA1_VIVA']??0) + (marks['CIA1_LAB']??0)
    const lab2 = (marks['CIA2_EXP']??0) + (marks['CIA2_RECORD']??0) + (marks['CIA2_VIVA']??0) + (marks['CIA2_LAB']??0)
    const lab = Math.round((lab1 + lab2) / 2 / 100 * 60)
    return Math.round((theory + lab) / 2)
  }
  return 0
}

function getCourseType(code: string): string {
  if (['CS24321','CS24322','CS24421','CS24422','CY24121','PH24121',
       'GE24121','GE24122','CS24221','CS24721','CS24821'].some(c => code.startsWith(c))) return 'LAB'
  if (['GE24112','GE24111','CS24311','CS24312','CS24411','CS24412',
       'CS24413','CS24511','CS24512','CS24611','CS24612','CS24613','CS24711'].some(c => code.startsWith(c))) return 'LAB_INTEGRATED'
  return 'THEORY'
}

// Non-GPA courses per R2024
const NON_GPA_CODES = new Set([
  'FC24102', 'BS24321', 'GE24503', 'BS24502', 'GE24622'
])

export async function computeCGPA(studentId: string): Promise<CGPAResult> {
  // Load all marks for student
  const { data: marksData } = await supabase
    .from('marks')
    .select('*, subjects(id, code, name, credits, semester, section)')
    .eq('student_id', studentId)

  if (!marksData || !marksData.length) {
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
    const ct      = getCourseType(subject.code)
    const internal = computeInternal(marks, ct)
    const semEnd   = marks['SEM_END'] ?? 0
    const total    = internal + semEnd
    const { grade, point } = getGrade(total)
    const credits  = Number(subject.credits)
    const included = credits > 0 && !NON_GPA_CODES.has(subject.code) && grade !== 'U'

    allResults.push({
      subjectId:   subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      credits,
      semester:    subject.semester,
      internal,
      semEnd,
      total,
      grade,
      gradePoint:  point,
      included,
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
      const sumCP    = included.reduce((s, r) => s + r.credits * r.gradePoint, 0)
      const sumC     = included.reduce((s, r) => s + r.credits, 0)
      const gpa      = sumC > 0 ? Math.round(sumCP / sumC * 100) / 100 : 0
      return { semester: Number(sem), gpa, credits: sumC, results }
    })

  // Overall CGPA
  const allIncluded = allResults.filter(r => r.included)
  const totalCP     = allIncluded.reduce((s, r) => s + r.credits * r.gradePoint, 0)
  const totalC      = allIncluded.reduce((s, r) => s + r.credits, 0)
  const cgpa        = totalC > 0 ? Math.round(totalCP / totalC * 100) / 100 : 0

  return { cgpa, totalCredits: totalC, semesters, allResults }
}

// At-risk detection
export interface RiskScore {
  studentId:     string
  riskLevel:     'SAFE' | 'WATCH' | 'AT_RISK' | 'CRITICAL'
  riskScore:     number  // 0-100
  attendancePct: number
  avgMarksPct:   number
  cgpa:          number
  flags:         string[]
}

export async function computeRisk(
  studentId: string,
  attendancePct: number,
  avgMarksPct: number,
  cgpa: number
): Promise<RiskScore> {
  const flags: string[] = []
  let score = 0

  // Attendance risk (weight: 40)
  if (attendancePct < 65)       { score += 40; flags.push('Attendance below 65% — prevented from exam') }
  else if (attendancePct < 75)  { score += 30; flags.push('Attendance below 75% — needs medical proof') }
  else if (attendancePct < 85)  { score += 15; flags.push('Attendance below 85%') }

  // Marks risk (weight: 35)
  if (avgMarksPct < 45)         { score += 35; flags.push('Internal marks below 45% — may fail') }
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

  return { studentId, riskLevel, riskScore: score, attendancePct, avgMarksPct, cgpa, flags }
}
