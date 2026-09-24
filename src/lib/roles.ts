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

export function getAllowedModules(user: NavUser): string[] {
  if (user.type === 'staff' && isTier1(user)) return NAV_HOD_IDS
  if (user.type === 'staff' && user.role === 'PROFESSOR') {
    return user.advisor_section || user.can_reset_passwords ? [...NAV_FACULTY_IDS, "accounts"] : NAV_FACULTY_IDS
  }
  return NAV_STUDENT_IDS
}
