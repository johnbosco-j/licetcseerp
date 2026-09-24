import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format name: "JOHN doe" → "John Doe"
export function toTitleCase(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Only allow http(s) links from user-entered data (blocks javascript:/data: URLs).
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url, window.location.origin)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}

// LICET academic year runs June–May: Sept 2026 → "2026-2027" (short: "2026-27").
export function academicYear(d = new Date(), short = false): string {
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1
  return short ? `${start}-${String(start + 1).slice(2)}` : `${start}-${start + 1}`
}

// Odd semesters run June–December (including end-semester exams), even semesters January–May.
export function semesterTerm(d = new Date()): 'Odd Semester' | 'Even Semester' {
  return d.getMonth() >= 5 ? 'Odd Semester' : 'Even Semester'
}
