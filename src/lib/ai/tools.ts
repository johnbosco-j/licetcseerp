// What the assistant can look up. Every tool runs with the asking person's own session, so
// row level security limits it to what that person may see; nothing here writes data.
import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { ToolDef } from './llm'
import { schemeOf, examType } from '@/lib/cia-scheme'

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
    name: 'my_courses', for: 'staff',
    description: 'Courses the user teaches this term (code, name, class, elective slot), with how many marks are entered per component.',
    input_schema: { type: 'object', properties: {} },
    run: async db => {
      const t = await term(db); if (!t) return 'No current term.'
      const { data: ids } = await db.rpc('my_teaching_ids')
      const mine = (ids ?? []) as string[]
      const [{ data: links }, { data: own }] = await Promise.all([
        db.from('subject_faculty').select('subject_id').in('faculty_id', mine),
        db.from('subjects').select('id').in('faculty_id', mine).eq('term_id', t.id),
      ])
      const sid = [...new Set([...(links ?? []).map((l: { subject_id: string }) => l.subject_id), ...(own ?? []).map((s: { id: string }) => s.id)])]
      if (!sid.length) return 'No courses are linked to you this term (the HOD links them in Configuration → Courses).'
      const [{ data: subs }, { data: marks }] = await Promise.all([
        db.from('subjects').select('id, code, name, short_name, section, cohort_grad_year, audience_value, elective_slot').eq('term_id', t.id).in('id', sid),
        db.from('marks').select('subject_id, exam_type').in('subject_id', sid).range(0, 9999),
      ])
      return (subs ?? []).map((s: { id: string }) => {
        const c: Record<string, number> = {}
        for (const m of (marks ?? []) as { subject_id: string; exam_type: string }[]) if (m.subject_id === s.id) c[m.exam_type] = (c[m.exam_type] ?? 0) + 1
        return { ...s, marks_entered: c }
      })
    },
  },
  {
    name: 'course_marks', for: 'staff',
    description: 'Marks entered for one course (by code) this term or a named past term: each student and component.',
    input_schema: { type: 'object', properties: { course: { type: 'string' }, section: { type: 'string' }, term: { type: 'string', description: 'e.g. "2025-26 Even"' } }, required: ['course'] },
    run: async (db, _me, i) => {
      const lbl = str(i.term, 40).replace(/[%,]/g, '')
      const { data: terms } = lbl ? await db.from('academic_terms').select('id, label').ilike('label', `%${lbl}%`) : await db.from('academic_terms').select('id, label').eq('is_current', true)
      const t = (terms ?? [])[0] as { id: string; label: string } | undefined; if (!t) return 'No such term.'
      let q = db.from('subjects').select('id, code, name, section').eq('term_id', t.id).ilike('code', str(i.course, 20).replace(/[%,]/g, ''))
      if (str(i.section)) q = q.eq('section', str(i.section, 20))
      const { data: subs } = await q
      if (!subs?.length) return `No course ${str(i.course)} in ${t.label}.`
      const { data } = await db.from('marks').select('exam_type, marks_obtained, max_marks, subject_id, profiles!marks_student_id_fkey(roll_number, full_name)').in('subject_id', subs.map((s: { id: string }) => s.id)).range(0, 4999)
      return { term: t.label, courses: subs, marks: data }
    },
  },
  {
    name: 'course_scheme', for: 'staff',
    description: 'The assessment scheme of a course: the components of CIA 1 and CIA 2 (exam_type code, name, out of, weight, part), the parts and their internal marks. Use before draft_marks.',
    input_schema: { type: 'object', properties: { course: { type: 'string' }, section: { type: 'string' } }, required: ['course'] },
    run: async (db, _me, i) => {
      const t = await term(db); if (!t) return 'No current term.'
      let q = db.from('subjects').select('id, code, name, section, cia_scheme').eq('term_id', t.id).ilike('code', str(i.course, 20).replace(/[%,]/g, ''))
      if (str(i.section)) q = q.eq('section', str(i.section, 20))
      const { data } = await q
      return (data ?? []).map((s: { code: string; name: string; section: string | null; cia_scheme: unknown }) => {
        const sc = schemeOf(s)
        return { course: `${s.code} ${s.name}`, section: s.section ?? 'combined', own_scheme: !!s.cia_scheme, parts: sc.parts, special_test_replaces_absent_CAT: sc.sp !== false,
          components: sc.comps.map(c => ({ exam_type: examType(c), name: `CIA ${c.cia} ${c.label}`, out_of: c.max, weight: c.weight, part: c.part, pool: c.pool })) }
      })
    },
  },
  {
    name: 'notices', for: 'all',
    description: 'Current notices (announcements) the user can see.',
    input_schema: { type: 'object', properties: {} },
    run: async (db, me) => {
      const aud = me.role === 'STUDENT' ? ['ALL', 'STUDENTS', me.section ?? ''] : ['ALL', 'PROFESSOR', 'FACULTY', 'STUDENTS', 'I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B']
      const { data } = await db.from('announcements').select('title, body, audience, is_urgent, created_at, expires_at').in('audience', aud).order('created_at', { ascending: false }).limit(20)
      return (data ?? []).filter((n: { expires_at: string | null }) => !n.expires_at || n.expires_at > new Date().toISOString())
    },
  },
  {
    name: 'calendar', for: 'all',
    description: 'Academic calendar between two dates (default the next 30 days): holidays, working Saturdays, which weekday each day follows. Scope FY (first year), HS (II–III), IV.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, scope: { type: 'string' } } },
    run: async (db, me, i) => {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(str(i.from)) ? str(i.from) : ist()
      const to = /^\d{4}-\d{2}-\d{2}$/.test(str(i.to)) ? str(i.to) : new Date(Date.parse(from) + 30 * 864e5).toISOString().slice(0, 10)
      const own = me.section ? (me.section.startsWith('I ') ? 'FY' : me.section.startsWith('IV') ? 'IV' : 'HS') : 'HS'
      const scope = ['FY', 'HS', 'IV'].includes(str(i.scope).toUpperCase()) ? str(i.scope).toUpperCase() : own
      const { data } = await db.from('calendar_days').select('date, is_working, day_order, label').eq('scope', scope).gte('date', from).lte('date', to).order('date')
      return { scope, days: (data ?? []).map((d: { date: string; is_working: boolean; day_order: number | null; label: string | null }) => ({ ...d, follows: d.day_order ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.day_order] : null })) }
    },
  },
  {
    name: 'find_staff', for: 'staff',
    description: 'Find a staff member by name or email: designation, department (blank = CSE), class they advise.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async (db, _me, i) => {
      const q = str(i.query, 40).replace(/[%,()]/g, '')
      if (q.length < 3) return 'Give at least 3 characters.'
      const { data } = await db.from('profiles').select('full_name, email, designation, home_department, advisor_section, is_active').in('role', ['PROFESSOR', 'HOD'])
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10)
      return data
    },
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
