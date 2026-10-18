// Role-based navigation — which dashboard modules each user may open.
// The database (RLS) is the real guard; this only shapes the UI.

export const NAV_HOD_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "analytics","finance","inventory","placements","leaves","events",
  "documents","feedback","grievances","notices","alerts","appraisal",
  "change-password","editor","examination",
  "naac","promotion","curriculum","reports","accounts","audit","export","profile","config","insights","obe"
]

export const NAV_FACULTY_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "alerts","leaves","events","documents","feedback","notices","placements","appraisal","change-password","export","profile","obe"
]

export const NAV_STUDENT_IDS = [
  "dashboard","attendance","marks","subjects","timetable","placements",
  "alerts","leaves","events","documents","feedback","grievances","notices","appraisal","change-password","export","profile"
]

// Non-teaching administrators: add and correct students, courses and staff accounts —
// no marks, attendance, timetable, academics or administration.
export const NAV_ADMIN_IDS = ["dashboard", "students", "subjects", "accounts", "notices", "change-password", "profile"]
// Lab instructors: take attendance in lab hours (any class), see the timetable and notices.
export const NAV_LAB_IDS = ["dashboard", "attendance", "timetable", "notices", "leaves", "change-password", "profile"]

export interface NavUser {
  type: string
  role?: string | null
  advisor_section?: string | null
  can_reset_passwords?: boolean | null
  access_tier?: number | null
  staff_type?: string | null
  is_admin?: boolean | null
}

type TierSource = { role?: string | null; access_tier?: number | null; staff_type?: string | null; is_admin?: boolean | null } | null | undefined

/** Tier 1 = department leadership: the HOD, or faculty granted tier 1 (e.g. Vice Principal). */
export function isTier1(u: TierSource | { type: string; data: TierSource }): boolean {
  const p = u && 'data' in u ? u.data : u
  return !!p && (p.role === 'HOD' || (p.role === 'PROFESSOR' && p.access_tier === 1))
}

/** 1 leadership · 2 faculty · 3 students */
export function tierOf(u: TierSource): 1 | 2 | 3 {
  return isTier1(u) ? 1 : u?.role === 'PROFESSOR' ? 2 : 3
}

/** Teaching staff (tier 1 or 2): HOD, faculty. Administrators and lab instructors are not. */
export function isTeaching(u: TierSource | { type: string; data: TierSource }): boolean {
  const p = u && 'data' in u ? u.data : u
  return !!p && (p.role === 'HOD' || (p.role === 'PROFESSOR' && (p.staff_type ?? 'TEACHING') === 'TEACHING'))
}
/** May add / correct students, courses and staff accounts: the HOD, administrators, faculty with administrator powers. */
export function isAdminStaff(u: TierSource | { type: string; data: TierSource }): boolean {
  const p = u && 'data' in u ? u.data : u
  return !!p && (isTier1(p) || (p.role === 'PROFESSOR' && (p.staff_type === 'ADMIN' || !!p.is_admin)))
}
export function isLabStaff(u: TierSource | { type: string; data: TierSource }): boolean {
  const p = u && 'data' in u ? u.data : u
  return !!p && p.role === 'PROFESSOR' && p.staff_type === 'LAB'
}
/** Plain-language name of someone's tier, for profile and account pages. */
export function tierLabel(u: TierSource): string {
  if (!u) return ''
  if (u.role === 'STUDENT') return 'Student (tier 3)'
  if (isTier1(u)) return u.role === 'HOD' ? 'Head of Department (tier 1)' : 'Department leadership (tier 1)'
  if (u.staff_type === 'ADMIN') return 'Administrator (non-teaching)'
  if (u.staff_type === 'LAB') return 'Lab instructor'
  return u.is_admin ? 'Faculty (tier 2) + administrator' : 'Faculty (tier 2)'
}

export const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard", students: "Student Records", attendance: "Attendance Register", marks: "Assessments & Marks",
  subjects: "Courses", curriculum: "Curriculum & Syllabus", timetable: "Class Timetable", examination: "Examinations",
  analytics: "Academic Analytics", finance: "Finance Ledger", inventory: "Assets & Inventory", placements: "Training & Placement",
  leaves: "Leave Management", events: "Events & Activities", accounts: "User Accounts", documents: "Document Repository",
  feedback: "Course Feedback", grievances: "Grievance Redressal", notices: "Notices & Circulars", alerts: "Attendance Alerts",
  audit: "Audit Trail", export: "Data Export", appraisal: "Faculty Appraisal", "attendance-analysis": "Attendance Analysis",
  editor: "Document Editor", naac: "NAAC & NBA", promotion: "Year Promotion", reports: "Departmental Reports",
  config: "Configuration", insights: "Insights", obe: "Outcomes (CO–PO)", profile: "My Profile", "change-password": "Change Password",
}

const ALWAYS = ["dashboard", "change-password", "profile"]

/** `hidden` is the HOD's menu setting (app_settings nav.hidden): module ids switched off per role. */
export function getAllowedModules(user: NavUser, hidden?: Record<string, string[]> | null): string[] {
  if (user.type === 'staff' && isTier1(user)) return NAV_HOD_IDS
  const drop = (ids: string[], role: string) => ids.filter(id => ALWAYS.includes(id) || !(hidden?.[role] ?? []).includes(id))
  if (user.type === 'staff' && user.staff_type === 'ADMIN') return NAV_ADMIN_IDS
  if (user.type === 'staff' && user.staff_type === 'LAB') return NAV_LAB_IDS
  if (user.type === 'staff' && user.role === 'PROFESSOR') {
    const extra = [...(user.advisor_section || user.can_reset_passwords || user.is_admin ? ["accounts"] : []), ...(user.advisor_section ? ["insights"] : [])]
    return drop([...NAV_FACULTY_IDS, ...extra], 'FACULTY')
  }
  return drop(NAV_STUDENT_IDS, 'STUDENT')
}
