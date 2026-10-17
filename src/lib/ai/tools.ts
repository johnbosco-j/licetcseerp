// What the assistant can look up. Every tool runs with the asking person's own session, so
// row level security limits it to what that person may see; nothing here writes data.
import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { ToolDef } from './claude'

export type Asker = { id: string; role: 'HOD' | 'PROFESSOR' | 'STUDENT'; tier1: boolean; full_name: string; section: string | null; advisor_section: string | null }
type Tool = ToolDef & { for: 'all' | 'staff' | 'student' | 'hod'; run: (db: SupabaseClient, me: Asker, input: Record<string, unknown>) => Promise<unknown> }

const ist = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
async function term(db: SupabaseClient) {
  const { data } = await db.from('academic_terms').select('id, label, starts_on, ends_on').eq('is_current', true).maybeSingle()
  return data as { id: string; label: string; starts_on: string | null; ends_on: string | null } | null
}
const str = (v: unknown, max = 60) => String(v ?? '').slice(0, max).trim()

const TOOLS: Tool[] = [
  {
    name: 'how_to', for: 'all',
    description: 'How to do something in LICET Things (the user guide). Use for any "how do I …" question.',
    input_schema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
    run: async () => {
      try { return fs.readFileSync(path.join(process.cwd(), 'docs', 'USER-GUIDE.md'), 'utf8') } catch { return 'User guide not available.' }
    },
  },
  {
    name: 'timetable', for: 'all',
    description: 'Timetable of a class for a date (default today): periods, courses, batches/verticals, teachers. Students get their own class.',
    input_schema: { type: 'object', properties: { section: { type: 'string', description: 'e.g. III CSE-A' }, date: { type: 'string', description: 'YYYY-MM-DD' } } },
    run: async (db, me, i) => {
      const t = await term(db); if (!t) return 'No current term.'
      const section = me.role === 'STUDENT' ? me.section : str(i.section) || me.advisor_section
      if (!section) return 'Which class? (e.g. III CSE-A)'
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str(i.date)) ? str(i.date) : ist()
      const scope = section.startsWith('I ') ? 'FY' : section.startsWith('IV') ? 'IV' : 'HS'
      const { data: day } = await db.from('calendar_days').select('is_working, day_order, label').eq('date', date).eq('scope', scope).maybeSingle()
      if (day && !day.is_working) return { date, section, holiday: day.label ?? 'Not a working day' }
      const order = day?.day_order ?? ((new Date(date + 'T00:00:00').getDay() || 7))
      const { data } = await db.from('timetable_entries').select('period_no, label, audience, audience_value, faculty_names, subjects(code, short_name, name, elective_slot)')
        .eq('term_id', t.id).eq('section', section).eq('day_order', order).order('period_no')
      return { date, section, follows: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][order], hours: data }
    },
  },
  {
    name: 'my_attendance', for: 'student',
    description: "The student's own attendance this term: overall, per course, and hours needed to reach 75%.",
    input_schema: { type: 'object', properties: {} },
    run: async db => {
      const { data } = await db.rpc('my_attendance', { p_term: null })
      const hours = (data ?? []) as { subject_id: string | null; label: string | null; present: boolean; on_duty: boolean }[]
      const total = hours.length, present = hours.filter(h => h.present).length
      const by = new Map<string, { n: number; p: number }>()
      for (const h of hours) { const k = h.subject_id ?? h.label ?? '-'; const x = by.get(k) ?? { n: 0, p: 0 }; x.n++; if (h.present) x.p++; by.set(k, x) }
      const ids = [...by.keys()].filter(k => /^[0-9a-f-]{36}$/.test(k))
      const { data: subs } = ids.length ? await db.from('subjects').select('id, code, name, elective_slot').in('id', ids) : { data: [] }
      const name = (k: string) => { const s = (subs ?? []).find((x: { id: string }) => x.id === k) as { code: string; name: string } | undefined; return s ? `${s.code} ${s.name}` : k }
      const need = total ? Math.max(0, Math.ceil((0.745 * total - present) / 0.255)) : 0
      return { total_hours: total, attended: present, percent: total ? Math.round(1000 * present / total) / 10 : null, hours_in_a_row_needed_for_75: need,
        on_duty_hours: hours.filter(h => h.on_duty).length, by_course: [...by.entries()].map(([k, v]) => ({ course: name(k), attended: v.p, hours: v.n })) }
    },
  },
  {
    name: 'my_marks', for: 'student',
    description: "The student's own internal and semester-end marks by course.",
    input_schema: { type: 'object', properties: {} },
    run: async (db, me) => {
      const { data } = await db.from('marks').select('exam_type, marks_obtained, max_marks, subjects(code, name)').eq('student_id', me.id).limit(300)
      return data
    },
  },
  {
    name: 'class_kpis', for: 'staff',
    description: 'Attendance of every class this term: overall %, last 7 days, students below 75% and 65%, OD hours.',
    input_schema: { type: 'object', properties: {} },
    run: async db => { const t = await term(db); return t ? (await db.rpc('ana_section_kpis', { p_term: t.id })).data : 'No current term.' },
  },
  {
    name: 'students_below', for: 'staff',
    description: 'Students below an attendance percentage this term (default 75), optionally for one class.',
    input_schema: { type: 'object', properties: { threshold: { type: 'number' }, section: { type: 'string' } } },
    run: async (db, _me, i) => {
      const t = await term(db)
      const { data } = await db.rpc('student_attendance_summary', { p_from: t?.starts_on ?? null, p_section: str(i.section) || null })
      const th = Number(i.threshold) || 75
      return ((data ?? []) as { full_name: string; section: string; pct: number; present: number; sessions: number }[])
        .filter(r => Number(r.pct) < th).sort((a, b) => a.pct - b.pct).slice(0, 80)
    },
  },
  {
    name: 'find_student', for: 'staff',
    description: 'Find a student by name, register number or roll number: class, batch, vertical, attendance this term.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async (db, _me, i) => {
      const q = str(i.query, 40).replace(/[%,()]/g, '')
      if (q.length < 3) return 'Give at least 3 characters.'
      const { data } = await db.from('profiles').select('id, full_name, register_number, roll_number, section, batch_year, lab_batch, vertical, is_active')
        .eq('role', 'STUDENT').or(`full_name.ilike.%${q}%,register_number.ilike.%${q}%,roll_number.ilike.%${q}%`).limit(8)
      const list = (data ?? []) as { id: string }[]
      const { data: tot } = list.length ? await db.rpc('att_student_totals', { p_ids: list.map(s => s.id), p_from: null }) : { data: [] }
      return list.map(s => { const t = (tot ?? []).find((x: { student_id: string }) => x.student_id === s.id) as { hours: number; present: number } | undefined; return { ...s, attendance: t ? `${t.present}/${t.hours}` : null } })
    },
  },
  {
    name: 'missing_hours', for: 'staff',
    description: 'Timetable hours with no attendance recorded, for the last N days (default 7).',
    input_schema: { type: 'object', properties: { days: { type: 'number' } } },
    run: async db => {
      const t = await term(db); if (!t) return 'No current term.'
      const from = new Date(Date.now() + 5.5 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10)
      return ((await db.rpc('ana_missing_hours', { p_term: t.id, p_from: from, p_to: ist() })).data ?? []).slice(0, 120)
    },
  },
  {
    name: 'course_attendance', for: 'staff',
    description: 'Attendance % of every course in every class this term.',
    input_schema: { type: 'object', properties: {} },
    run: async db => { const t = await term(db); return t ? (await db.rpc('ana_course_matrix', { p_term: t.id })).data : 'No current term.' },
  },
  {
    name: 'faculty_load', for: 'hod',
    description: 'Each teacher: hours scheduled vs recorded this term, topics entered, self check-ins.',
    input_schema: { type: 'object', properties: {} },
    run: async db => { const t = await term(db); return t ? (await db.rpc('ana_faculty_load', { p_term: t.id, p_from: null, p_to: null })).data : 'No current term.' },
  },
]

export function toolsFor(me: Asker) {
  const staff = me.role !== 'STUDENT', hod = me.tier1
  return TOOLS.filter(t => t.for === 'all' || (t.for === 'student' && !staff) || (t.for === 'staff' && staff) || (t.for === 'hod' && hod))
}
export async function runTool(db: SupabaseClient, me: Asker, name: string, input: Record<string, unknown>) {
  const t = toolsFor(me).find(x => x.name === name)
  if (!t) return JSON.stringify({ error: 'Not available to you' })
  const out = await t.run(db, me, input ?? {})
  const s = typeof out === 'string' ? out : JSON.stringify(out)
  return s.length > 12000 ? s.slice(0, 12000) + '…(cut)' : s
}
