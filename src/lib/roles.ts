// Role-based navigation — which dashboard modules each user may open.
// The database (RLS) is the real guard; this only shapes the UI.

export const NAV_HOD_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "analytics","finance","inventory","placements","leaves","events",
  "documents","feedback","grievances","notices","alerts","appraisal",
  "attendance-analysis","change-password","editor","examination",
  "naac","promotion","curriculum","reports","accounts","audit"
]

export const NAV_FACULTY_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "alerts","leaves","events","documents","feedback","notices","change-password"
]

export const NAV_STUDENT_IDS = [
  "dashboard","attendance","marks","subjects","timetable","placements",
  "alerts","leaves","documents","feedback","grievances","notices","change-password"
]

export interface NavUser {
  type: string
  role?: string | null
  advisor_section?: string | null
  can_reset_passwords?: boolean | null
}

export function getAllowedModules(user: NavUser): string[] {
  if (user.type === 'staff' && user.role === 'HOD') return NAV_HOD_IDS
  if (user.type === 'staff' && user.role === 'PROFESSOR') {
    return user.advisor_section || user.can_reset_passwords ? [...NAV_FACULTY_IDS, "accounts"] : NAV_FACULTY_IDS
  }
  return NAV_STUDENT_IDS
}
