// Odd / even semester for the whole app.
//
// January–May is always the even semester. June–December is the odd semester
// only once that academic year's promotion has been run: until then students are
// still in last year's sections, finishing their even semester, so switching on
// a fixed date would show them the wrong courses. The dashboard layout loads the
// promotion state once per session (setAcademicState) before any page renders.

type AcademicState = { academicYear: string | null; promotedAt: string | null }
let state: AcademicState | null = null

export function setAcademicState(s: AcademicState) { state = s }
export function getAcademicState() { return state }

const academicYearOf = (d: Date) => {
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1
  return `${start}-${start + 1}`
}

export function getCurrentSemParity(d = new Date()): "odd" | "even" {
  if (d.getMonth() < 5) return "even"
  if (state?.academicYear && state.academicYear !== academicYearOf(d)) return "even"
  return "odd"
}

/** First day of the running semester: the promotion date for odd semesters (1 June if unknown), 1 January for even. */
export function semesterStartDate(d = new Date()): Date {
  if (getCurrentSemParity(d) === "even") {
    return d.getMonth() < 5 ? new Date(d.getFullYear(), 0, 1) : new Date(d.getFullYear(), 0, 1)
  }
  if (state?.promotedAt && state.academicYear === academicYearOf(d)) return new Date(state.promotedAt)
  return new Date(d.getFullYear(), 5, 1)
}

const SEM_MAP: Record<string, [number, number]> = {
  "I CSE-A":   [1, 2], "I CSE-B":   [1, 2],
  "II CSE-A":  [3, 4], "II CSE-B":  [3, 4],
  "III CSE-A": [5, 6], "III CSE-B": [5, 6],
  "IV CSE-A":  [7, 8], "IV CSE-B":  [7, 8],
}

export function getActiveSemester(section: string): number {
  const [odd, even] = SEM_MAP[section] ?? [1, 2]
  return getCurrentSemParity() === "odd" ? odd : even
}
