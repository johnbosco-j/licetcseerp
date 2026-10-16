// Role-based navigation — which dashboard modules each user may open.
// The database (RLS) is the real guard; this only shapes the UI.

export const NAV_HOD_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "analytics","finance","inventory","placements","leaves","events",
  "documents","feedback","grievances","notices","alerts","appraisal",
  "attendance-analysis","change-password","editor","examination",
  "naac","promotion","curriculum","reports","accounts","audit","export","profile","config"
]

export const NAV_FACULTY_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "alerts","leaves","events","documents","feedback","notices","placements","appraisal","change-password","export","profile"
]

export const NAV_STUDENT_IDS = [
  "dashboard","attendance","marks","subjects","timetable","placements",
  "alerts","leaves","events","documents","feedback","grievances","notices","appraisal","change-password","export","profile"
]

export interface NavUser {
  type: string
  role?: string | null
  advisor_section?: string | null
  can_reset_passwords?: boolean | null
  access_tier?: number | null
}

type TierSource = { role?: string | null; access_tier?: number | null } | null | undefined

/** Tier 1 = department leadership: the HOD, or faculty granted tier 1 (e.g. Vice Principal). */
export function isTier1(u: TierSource | { type: string; data: TierSource }): boolean {
  const p = u && 'data' in u ? u.data : u
  return !!p && (p.role === 'HOD' || (p.role === 'PROFESSOR' && p.access_tier === 1))
}

/** 1 leadership · 2 faculty · 3 students */
export function tierOf(u: TierSource): 1 | 2 | 3 {
  return isTier1(u) ? 1 : u?.role === 'PROFESSOR' ? 2 : 3
}

export const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard", students: "Student Records", attendance: "Attendance Register", marks: "Assessments & Marks",
  subjects: "Courses", curriculum: "Curriculum & Syllabus", timetable: "Class Timetable", examination: "Examinations",
  analytics: "Academic Analytics", finance: "Finance Ledger", inventory: "Assets & Inventory", placements: "Training & Placement",
  leaves: "Leave Management", events: "Events & Activities", accounts: "User Accounts", documents: "Document Repository",
  feedback: "Course Feedback", grievances: "Grievance Redressal", notices: "Notices & Circulars", alerts: "Attendance Alerts",
  audit: "Audit Trail", export: "Data Export", appraisal: "Faculty Appraisal", "attendance-analysis": "Attendance Analysis",
  editor: "Document Editor", naac: "NAAC & NBA", promotion: "Year Promotion", reports: "Departmental Reports",
  config: "Configuration", profile: "My Profile", "change-password": "Change Password",
}

const ALWAYS = ["dashboard", "change-password", "profile"]

/** `hidden` is the HOD's menu setting (app_settings nav.hidden): module ids switched off per role. */
export function getAllowedModules(user: NavUser, hidden?: Record<string, string[]> | null): string[] {
  if (user.type === 'staff' && isTier1(user)) return NAV_HOD_IDS
  const drop = (ids: string[], role: string) => ids.filter(id => ALWAYS.includes(id) || !(hidden?.[role] ?? []).includes(id))
  if (user.type === 'staff' && user.role === 'PROFESSOR') {
    return drop(user.advisor_section || user.can_reset_passwords ? [...NAV_FACULTY_IDS, "accounts"] : NAV_FACULTY_IDS, 'FACULTY')
  }
  return drop(NAV_STUDENT_IDS, 'STUDENT')
}
