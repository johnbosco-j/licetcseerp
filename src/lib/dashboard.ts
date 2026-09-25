import { supabase } from "@/lib/supabase"
import { getActiveSemester, semesterStartDate } from "@/lib/semester"

export const SECTIONS = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B']
export const YEARS = ['I', 'II', 'III', 'IV'] as const

export const yearOf = (section: string) => section.split(' ')[0]
/** Current IV-year sections were admitted before autonomy and do not follow R2024. */
export const isFinalYear = (section: string) => yearOf(section) === 'IV'
export const currentSemester = getActiveSemester

/** First day of the running semester (the promotion date for odd semesters, 1 January for even). */
export function semesterStart(d = new Date()): string {
  return isoDate(semesterStartDate(d))
}

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── Timetable (same periods as the Timetable page) ─────────────────────────
export interface Period { no: number; part: 1 | 2 | 3; start: string; end: string }
export const PERIODS: Period[] = [
  { no: 1, part: 1, start: '08:00', end: '09:00' },
  { no: 2, part: 1, start: '09:00', end: '09:50' },
  { no: 3, part: 2, start: '10:10', end: '11:00' },
  { no: 4, part: 2, start: '11:00', end: '11:50' },
  { no: 5, part: 2, start: '11:50', end: '12:40' },
  { no: 6, part: 3, start: '13:30', end: '14:20' },
  { no: 7, part: 3, start: '14:20', end: '15:10' },
  { no: 8, part: 3, start: '15:10', end: '16:00' },
]
export const PART_LABELS: Record<number, string> = { 1: 'Part I · 8:00', 2: 'Part II · 10:10', 3: 'Part III · 1:30' }

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
}

export type DayPhase =
  | { kind: 'before' }
  | { kind: 'period'; period: Period }
  | { kind: 'break'; next: Period }
  | { kind: 'after' }
  | { kind: 'holiday' }

export function dayPhase(now = new Date(), hasClasses = true): DayPhase {
  if (!hasClasses) return { kind: 'holiday' }
  const t = now.getHours() * 60 + now.getMinutes()
  if (t < toMin(PERIODS[0].start)) return { kind: 'before' }
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i]
    if (t >= toMin(p.start) && t < toMin(p.end)) return { kind: 'period', period: p }
    const next = PERIODS[i + 1]
    if (next && t >= toMin(p.end) && t < toMin(next.start)) return { kind: 'break', next }
  }
  return { kind: 'after' }
}

export interface Slot { subjectId: string; subjectCode: string; subjectName: string }
interface StoredTimetable {
  timetable: Record<string, Record<string, Slot>>
  satConfig?: { enabled: boolean; followsDay: string; halfDay: boolean }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Today's periods for each section, honouring the Saturday configuration. */
export async function loadTodaysTimetables(sections: string[], now = new Date()): Promise<Record<string, { period: Period; slot: Slot }[]>> {
  const out: Record<string, { period: Period; slot: Slot }[]> = {}
  if (!sections.length) return out
  const { data } = await supabase.from('announcements').select('audience, body, created_at')
    .in('audience', sections.map(s => `TIMETABLE:${s}`))
    .order('created_at', { ascending: false })
  const day = DAY_NAMES[now.getDay()]
  for (const section of sections) {
    const row = data?.find(r => r.audience === `TIMETABLE:${section}`)
    out[section] = []
    if (!row) continue
    try {
      const tt = JSON.parse(row.body) as StoredTimetable
      let source = day
      let periods = PERIODS
      if (day === 'Sunday') continue
      if (day === 'Saturday') {
        if (!tt.satConfig?.enabled) continue
        source = tt.satConfig.followsDay
        if (tt.satConfig.halfDay) periods = PERIODS.slice(0, 5)
      }
      const daySlots = tt.timetable?.[source] ?? {}
      out[section] = periods.filter(p => daySlots[p.no]).map(p => ({ period: p, slot: daySlots[p.no] }))
    } catch { /* malformed timetable: treat as empty */ }
  }
  return out
}

// ── Attendance summaries (database functions, RLS applies) ─────────────────
export interface SectionAttendance {
  section: string; sessions: number; present: number; students_tracked: number
  below_75: number; below_65: number
  today_sessions: number; today_present: number; today_parts: number[]
}
export interface StudentAttendance {
  student_id: string; full_name: string; section: string; sessions: number; present: number; pct: number
}

export async function loadSectionAttendance(): Promise<Record<string, SectionAttendance>> {
  const { data, error } = await supabase.rpc('section_attendance_summary' as never, { p_from: semesterStart(), p_today: isoDate() } as never)
  if (error || !data) return {}
  const rows = data as unknown as SectionAttendance[]
  return Object.fromEntries(rows.map(r => [r.section, {
    ...r,
    sessions: Number(r.sessions), present: Number(r.present), students_tracked: Number(r.students_tracked),
    below_75: Number(r.below_75), below_65: Number(r.below_65),
    today_sessions: Number(r.today_sessions), today_present: Number(r.today_present), today_parts: r.today_parts ?? [],
  }]))
}

export async function loadStudentAttendance(section?: string): Promise<StudentAttendance[]> {
  const { data, error } = await supabase.rpc('student_attendance_summary' as never, { p_from: semesterStart(), p_section: section ?? null } as never)
  if (error || !data) return []
  return (data as unknown as StudentAttendance[]).map(r => ({ ...r, sessions: Number(r.sessions), present: Number(r.present), pct: Number(r.pct) }))
}

/** Sessions a student can still miss (or must attend) to stay at or reach 75%. */
export function attendanceHeadroom(present: number, sessions: number, target = 0.75) {
  if (!sessions) return { canMiss: 0, mustAttend: 0 }
  const canMiss = Math.max(0, Math.floor(present / target - sessions))
  const mustAttend = Math.max(0, Math.ceil((target * sessions - present) / (1 - target)))
  return { canMiss, mustAttend }
}

// ── Misc ───────────────────────────────────────────────────────────────────
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} d ago`
  return fmtDate(iso)
}

export const fmtDate = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export interface EventItem { id: string; title: string; date: string; venue?: string; type?: string }

/** Upcoming department events (stored as EVENT:* announcements with a JSON body). */
export async function loadUpcomingEvents(limit = 5): Promise<EventItem[]> {
  const { data } = await supabase.from('announcements').select('id, title, body, audience')
    .like('audience', 'EVENT:%').order('created_at', { ascending: false }).limit(60)
  const today = isoDate()
  return (data ?? []).flatMap(a => {
    try {
      const e = JSON.parse(a.body)
      return e.date && e.date >= today ? [{ id: a.id, title: e.title ?? a.title, date: e.date, venue: e.venue, type: e.type }] : []
    } catch { return [] }
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit)
}

export interface NoticeItem { id: string; title: string; body: string; audience: string; urgent: boolean; created_at: string }

export async function loadNotices(audiences: string[], limit = 6): Promise<NoticeItem[]> {
  const { data } = await supabase.from('announcements').select('id, title, body, audience, is_urgent, created_at')
    .in('audience', audiences)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('is_urgent', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(n => ({ id: n.id, title: n.title, body: n.body, audience: n.audience, urgent: n.is_urgent, created_at: n.created_at }))
}

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const todayName = (d = new Date()) => DAY_NAMES[d.getDay()]

export type WeekTimetable = Record<string, Record<number, Slot>>   // day -> period -> slot

/** Full weekly timetable per section (Saturday resolved from its configuration). */
export async function loadWeekTimetables(sections: string[]): Promise<Record<string, WeekTimetable>> {
  const out: Record<string, WeekTimetable> = {}
  if (!sections.length) return out
  const { data } = await supabase.from('announcements').select('audience, body, created_at')
    .in('audience', sections.map(s => `TIMETABLE:${s}`))
    .order('created_at', { ascending: false })
  for (const section of sections) {
    out[section] = {}
    const row = data?.find(r => r.audience === `TIMETABLE:${section}`)
    if (!row) continue
    try {
      const tt = JSON.parse(row.body) as StoredTimetable
      for (const day of WEEK_DAYS.slice(0, 5)) out[section][day] = { ...(tt.timetable?.[day] ?? {}) }
      if (tt.satConfig?.enabled) {
        const src = tt.timetable?.[tt.satConfig.followsDay] ?? {}
        const limit = tt.satConfig.halfDay ? 5 : 8
        out[section].Saturday = Object.fromEntries(Object.entries(src).filter(([p]) => Number(p) <= limit))
      }
    } catch { /* ignore malformed */ }
  }
  return out
}

export interface ExamItem {
  id: string; subject_code: string; subject_name: string; exam_type: string
  date: string; time?: string; venue?: string; section?: string; duration?: string
}

/** Upcoming examinations from the Examination module (EXAM_SCHED:* records). */
export async function loadUpcomingExams(sections?: string[], limit = 6): Promise<ExamItem[]> {
  const { data } = await supabase.from('announcements').select('id, body').like('audience', 'EXAM_SCHED%')
    .order('created_at', { ascending: false }).limit(300)
  const today = isoDate()
  return (data ?? []).flatMap(r => {
    try {
      const e = JSON.parse(r.body)
      if (!e.date || e.date < today) return []
      if (sections && e.section && !sections.includes(e.section)) return []
      return [{ id: r.id, ...e } as ExamItem]
    } catch { return [] }
  }).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).slice(0, limit)
}

export interface DocItem { id: string; title: string; category: string; section?: string; created_at: string }

/** Latest shared documents (DOCUMENT:* records), optionally for one section plus department-wide ones. */
export async function loadRecentDocuments(section?: string, limit = 5): Promise<DocItem[]> {
  const { data } = await supabase.from('announcements').select('id, title, body, audience, created_at')
    .like('audience', 'DOCUMENT:%').order('created_at', { ascending: false }).limit(60)
  return (data ?? []).flatMap(r => {
    try {
      const d = JSON.parse(r.body)
      if (section && d.section && d.section !== 'ALL' && d.section !== section) return []
      return [{ id: r.id, title: d.title || r.title || d.category, category: d.category ?? r.audience.slice(9), section: d.section, created_at: r.created_at }]
    } catch { return [] }
  }).slice(0, limit)
}

/** Parent / guardian mobiles for a set of students (staff only; RLS hides others' numbers from students). */
export async function loadParentMobiles(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('profiles').select('id, parent_mobile').in('id', ids.slice(0, 500))
  return Object.fromEntries((data ?? []).filter(r => r.parent_mobile).map(r => [r.id, r.parent_mobile as string]))
}
