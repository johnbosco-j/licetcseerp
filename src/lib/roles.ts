// Shared role-based navigation constants
// Single source of truth used by both layout.tsx and page.tsx

export const NAV_HOD_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "analytics","finance","inventory","placements","leaves","events",
  "documents","feedback","grievances","notices","alerts","appraisal",
  "attendance-analysis","change-password","editor","examination",
  "naac","promotion","curriculum","reports"
]

export const NAV_FACULTY_IDS = [
  "dashboard","students","attendance","marks","subjects","timetable",
  "leaves","events","documents","feedback","notices","change-password"
]

export const NAV_STUDENT_IDS = [
  "dashboard","attendance","marks","subjects","timetable","placements",
  "leaves","documents","feedback","grievances","notices","change-password"
]

export function getAllowedModules(userType: string, role: string): string[] {
  if (userType === 'staff' && role === 'HOD') return NAV_HOD_IDS
  if (userType === 'staff' && role === 'PROFESSOR') return NAV_FACULTY_IDS
  return NAV_STUDENT_IDS
}
