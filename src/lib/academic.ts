// Terms, calendar, periods and timetable — shared by attendance, timetable and
// the HOD configuration pages. All of it is data the HOD can change.

import { supabase } from "./supabase"

export const SECTIONS = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B'] as const
export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type Audience = 'ALL' | 'BATCH' | 'VERTICAL' | 'GROUP'

export interface Term {
  id: string; academic_year: string; parity: 'ODD' | 'EVEN'; label: string
  starts_on: string | null; ends_on: string | null; is_current: boolean; notes: string | null
}
export interface PeriodSlot { id: string; term_id: string; period_no: number; starts_at: string; ends_at: string; label: string | null; years: number[] | null }
export interface CalendarDay { date: string; scope: 'ALL' | 'FY' | 'HS' | 'IV'; term_id: string | null; is_working: boolean; day_order: number | null; label: string | null }
export interface Offering {
  id: string; code: string; name: string; semester: number; section: string | null; term_id: string | null
  cohort_grad_year: number | null; audience: 'ALL' | 'VERTICAL' | 'GROUP'; audience_value: string | null; group_id: string | null
  short_name: string | null; course_type: string | null; regulation: string | null; credits: number | null
  l: number | null; t: number | null; p: number | null; faculty_id: string | null; faculty_names: string | null; is_active: boolean
}
export interface TimetableEntry {
  id: string; term_id: string; section: string; day_order: number; period_no: number
  subject_id: string | null; label: string | null; audience: Audience; audience_value: string | null; group_id: string | null
  room: string | null; faculty_ids: string[]; faculty_names: string | null; takes_attendance: boolean
  effective_from: string | null; effective_to: string | null
  subjects?: Pick<Offering, 'id' | 'code' | 'name' | 'short_name' | 'section' | 'cohort_grad_year' | 'audience' | 'audience_value'> | null
}
export interface Vertical { code: string; name: string; description: string | null; course_codes: string[]; is_active: boolean }
export interface StudentGroup { id: string; name: string; kind: string; cohort_grad_year: number | null; section: string | null; term_id: string | null }
export interface AttSession {
  id: string; term_id: string | null; date: string; period_no: number; section: string | null; cohort_grad_year: number | null
  subject_id: string | null; label: string | null; audience: Audience; audience_value: string | null; group_id: string | null
  entry_id: string | null; roster: string[]; absent: string[]; topic: string | null; mode: 'MANUAL' | 'SELF' | 'IMPORT'
  status: 'DRAFT' | 'SUBMITTED'; taken_by: string | null; submitted_at: string | null; lock_at: string | null
  unlocked_until: string | null; self_open_until: string | null; edit_reason: string | null; updated_at: string
  headcount: number | null; on_duty?: string[]
}

export const yearOf = (section: string) => ({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[section.split(' ')[0]] ?? 0
/** The calendar keeps separate working days for first years, II–III and IV. */
export const scopeOf = (section: string) => { const y = yearOf(section); return y === 1 ? 'FY' : y === 4 ? 'IV' : 'HS' }

export function isoToday(): string {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
export const weekdayOf = (iso: string) => { const w = new Date(iso + 'T00:00:00').getDay(); return w === 0 ? 7 : w }

export function audienceLabel(a: Audience, v: string | null, verticals?: Vertical[], groups?: StudentGroup[], groupId?: string | null): string {
  if (a === 'BATCH') return `Batch ${v}`
  if (a === 'VERTICAL') return verticals?.find(x => x.code === v)?.name ?? (v === 'AIML' ? 'AI & ML vertical' : v === 'FSD' ? 'Full Stack vertical' : `${v} vertical`)
  if (a === 'GROUP') return groups?.find(g => g.id === groupId)?.name ?? 'Group'
  return 'Whole class'
}
export const shortAudience = (a: Audience, v: string | null) =>
  a === 'BATCH' ? `B${v}` : a === 'VERTICAL' ? (v === 'AIML' ? 'AI&ML' : v === 'FSD' ? 'FSD' : v ?? '') : a === 'GROUP' ? 'Group' : ''

export function entryTitle(e: Pick<TimetableEntry, 'label' | 'subjects'>): string {
  if (e.label && (!e.subjects || /lab/i.test(e.label))) return e.label
  return e.subjects?.short_name || e.subjects?.code || e.label || '—'
}

export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// ── loaders ─────────────────────────────────────────────────────────────────
export async function loadTerms(): Promise<Term[]> {
  const { data, error } = await supabase.from('academic_terms').select('*').order('starts_on', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Term[]
}
export async function loadPeriods(termId: string): Promise<PeriodSlot[]> {
  const { data } = await supabase.from('period_slots').select('*').eq('term_id', termId).order('period_no')
  return (data ?? []) as PeriodSlot[]
}
export async function loadVerticals(): Promise<Vertical[]> {
  const { data } = await supabase.from('verticals').select('*').order('code')
  return (data ?? []) as Vertical[]
}
export async function loadGroups(): Promise<StudentGroup[]> {
  const { data } = await supabase.from('student_groups').select('*').order('name')
  return (data ?? []) as StudentGroup[]
}
export async function loadSettings(): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('app_settings').select('key, value')
  return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map(r => [r.key, r.value]))
}

/** Calendar entry for a date and class: working day? which weekday's timetable? */
export async function dayInfo(date: string, section: string): Promise<{ working: boolean; dayOrder: number | null; label: string | null; known: boolean }> {
  const { data } = await supabase.from('calendar_days').select('*').eq('date', date).in('scope', [scopeOf(section), 'ALL'])
  const rows = (data ?? []) as CalendarDay[]
  const c = rows.find(r => r.scope === scopeOf(section)) ?? rows[0]
  const wd = weekdayOf(date)
  if (!c) return { working: wd <= 5, dayOrder: wd <= 6 ? wd : null, label: null, known: false }
  return { working: c.is_working, dayOrder: c.day_order ?? (c.is_working && wd <= 6 ? wd : null), label: c.label, known: true }
}

const ENTRY_SELECT = '*, subjects(id, code, name, short_name, section, cohort_grad_year, audience, audience_value)'
export async function loadTimetable(termId: string, section?: string): Promise<TimetableEntry[]> {
  let q = supabase.from('timetable_entries').select(ENTRY_SELECT).eq('term_id', termId)
  if (section) q = q.eq('section', section)
  const { data, error } = await q.order('day_order').order('period_no')
  if (error) throw new Error(error.message)
  return (data ?? []) as TimetableEntry[]
}

/** Entries that apply on a date (effective dates respected). */
export const activeOn = (e: TimetableEntry, date: string) =>
  (!e.effective_from || e.effective_from <= date) && (!e.effective_to || e.effective_to >= date)

/** Consecutive periods of the same class become one block (a 3-hour lab is one item). */
export interface ClassBlock { key: string; section: string; periods: number[]; entry: TimetableEntry; entries: TimetableEntry[] }
export function toBlocks(entries: TimetableEntry[]): ClassBlock[] {
  const sorted = [...entries].sort((a, b) => a.section.localeCompare(b.section) || a.period_no - b.period_no)
  const out: ClassBlock[] = []
  // Latest block per class: batches/verticals that share a period are interleaved
  // in `sorted`, so the previous block in `out` is not necessarily the same class.
  const latest = new Map<string, ClassBlock>()
  for (const e of sorted) {
    const id = `${e.section}|${e.subject_id ?? e.label}|${e.audience}|${e.audience_value ?? ''}`
    const last = latest.get(id)
    if (last && last.periods[last.periods.length - 1] === e.period_no - 1) {
      last.periods.push(e.period_no); last.entries.push(e); continue
    }
    const block: ClassBlock = { key: `${id}|${e.period_no}`, section: e.section, periods: [e.period_no], entry: e, entries: [e] }
    out.push(block); latest.set(id, block)
  }
  return out
}

/** Students of a class/batch/vertical/group, ordered by register number (same rule as the database roster). */
export interface RosterStudent { id: string; full_name: string; register_number: string | null; roll_number: string | null; section: string | null; lab_batch: number | null; vertical: string | null }
export async function loadRosterStudents(ids: string[]): Promise<RosterStudent[]> {
  const out: RosterStudent[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from('profiles').select('id, full_name, register_number, roll_number, section, lab_batch, vertical').in('id', ids.slice(i, i + 150))
    out.push(...((data ?? []) as RosterStudent[]))
  }
  const order = new Map(ids.map((id, i) => [id, i]))
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export function eligibility(pct: number | null, minPct = 75, condPct = 65): { code: string; label: string; tone: 'ok' | 'warn' | 'bad' | 'none' } {
  if (pct === null || Number.isNaN(pct)) return { code: '—', label: 'No classes yet', tone: 'none' }
  const r = Math.round(pct)
  if (r >= minPct) return { code: r >= 95 ? 'VG' : r >= 85 ? 'G' : 'S', label: r >= 95 ? 'Very good' : r >= 85 ? 'Good' : 'Satisfactory', tone: 'ok' }
  if (r >= condPct) return { code: 'C', label: 'Condonation (medical / sports only)', tone: 'warn' }
  return { code: 'SA', label: 'Shortage of attendance', tone: 'bad' }
}
export const TONE: Record<string, string> = {
  ok: 'text-green-800 bg-green-50 border-green-200',
  warn: 'text-amber-800 bg-amber-50 border-amber-200',
  bad: 'text-red-800 bg-red-50 border-red-200',
  none: 'text-muted-foreground bg-muted/40 border-border',
}

/**
 * Students of a course offering, for marks and outcomes. A section course belongs to the
 * batch that was in that section when it ran (cohort year + section letter), so a past
 * term still shows the right students after promotion. A combined course is that batch's
 * vertical / group (or the whole batch). Anyone who already has marks in it is included,
 * so graduated batches keep their records.
 */
export async function loadCourseRoster(subject: Pick<Offering, 'id' | 'section' | 'cohort_grad_year' | 'audience' | 'audience_value' | 'group_id'>) {
  const cols = 'id, full_name, register_number, roll_number, section, batch_year, vertical, lab_batch, email, is_active'
  type P = { id: string; full_name: string; register_number: string | null; roll_number: string | null; section: string | null; batch_year: number | null; vertical: string | null; lab_batch: number | null; email: string; is_active: boolean }
  let q = supabase.from('profiles').select(cols).eq('role', 'STUDENT')
  if (subject.cohort_grad_year) {
    q = q.eq('batch_year', subject.cohort_grad_year)
    if (subject.section) q = q.like('section', `%${subject.section.split(' ').pop()}`)
    else if (subject.audience === 'VERTICAL' && subject.audience_value) q = q.eq('vertical', subject.audience_value)
  } else if (subject.section) q = q.eq('section', subject.section)
  const [{ data: base }, { data: marked }, members] = await Promise.all([
    q.order('full_name').range(0, 999),
    supabase.from('marks').select('student_id').eq('subject_id', subject.id).range(0, 9999),
    subject.audience === 'GROUP' && subject.group_id
      ? supabase.from('student_group_members').select('student_id').eq('group_id', subject.group_id)
      : Promise.resolve({ data: null }),
  ])
  let list = (base ?? []) as P[]
  if (members.data) { const m = new Set((members.data as { student_id: string }[]).map(x => x.student_id)); list = list.filter(s => m.has(s.id)) }
  const have = new Set(list.map(s => s.id))
  const extra = [...new Set(((marked ?? []) as { student_id: string }[]).map(m => m.student_id))].filter(id => !have.has(id))
  if (extra.length) {
    const { data } = await supabase.from('profiles').select(cols).in('id', extra.slice(0, 500))
    list = [...list, ...((data ?? []) as P[])]
  }
  return list.sort((a, b) => (a.roll_number ?? a.full_name).localeCompare(b.roll_number ?? b.full_name))
}
