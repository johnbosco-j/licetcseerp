import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getCurrentSemParity } from "./semester"

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

// Odd semester from promotion (June–December), even semester January–May — see lib/semester.
export function semesterTerm(d = new Date()): 'Odd Semester' | 'Even Semester' {
  return getCurrentSemParity(d) === 'odd' ? 'Odd Semester' : 'Even Semester'
}

/**
 * Indian mobile number → 10 digits (drops spaces, dashes and a +91 / 91 / 0 prefix).
 * Returns '' for empty input and null when it is not a valid 10-digit mobile number.
 */
export function normalizeMobile(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d
  return /^[6-9]\d{9}$/.test(ten) ? ten : null
}

/** 9876543210 → "98765 43210" */
export const formatMobile = (m: string | null | undefined) => (m && m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m ?? '')
