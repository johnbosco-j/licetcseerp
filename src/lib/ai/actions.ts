// Changes LICET AI can prepare. The model only DRAFTS: `prepare` checks the request with the
// asker's own session and returns a preview; the person must press Confirm, and `execute` then
// runs with the same session, so row level security still decides what is allowed. Drafts are
// signed (HMAC) and expire, so the confirmed change is exactly the one that was shown.
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolDef } from './llm'
import type { Asker } from './tools'
import { guessComponent } from '@/lib/marks-columns'
import { schemeOf, examType, SP_KEY, SP_MAX } from '@/lib/cia-scheme'
import { importStudentsAdmin, createStaffAdmin, type NewStudent, type NewStaff } from '@/app/actions'

export type Proposal = { kind: string; title: string; summary: string; lines: string[]; warnings: string[]; payload: Record<string, unknown> }
export type Done = { message: string; notify?: { kind: 'handover'; to_email: string; to_name: string; course: string; from: string; until: string; note?: string } }
type Action = ToolDef & {
  for: 'all' | 'staff' | 'student' | 'hod'
  prepare: (db: SupabaseClient, me: Asker, i: Record<string, unknown>) => Promise<Proposal | string>
  execute: (db: SupabaseClient, me: Asker, p: Record<string, unknown>, token: string) => Promise<Done>
}

const DEPT_ID = '00000000-0000-0000-0000-000000000001'
const SECTIONS = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B']
const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max).trim()
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
const ist = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const section = (s: unknown) => {
  const m = str(s, 20).toUpperCase().replace(/\s+/g, ' ').match(/^(IV|III|II|I)\s*(?:YEAR)?\s*(?:CSE)?\s*-?\s*([AB])$/)
  return m ? `${m[1]} CSE-${m[2]}` : null
}
const list = (v: unknown, max = 400): unknown[] => Array.isArray(v) ? v.slice(0, max) : []

// ── signing ────────────────────────────────────────────────────────────────
const secret = () => process.env.AI_ACTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export function signDraft(kind: string, userId: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ k: kind, u: userId, p: payload, exp: Date.now() + 30 * 60e3 })).toString('base64url')
  return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}`
}
export function readDraft(token: string, userId: string): { kind: string; payload: Record<string, unknown> } | string {
  const [body, mac] = String(token ?? '').split('.')
  if (!body || !mac || !secret()) return 'Not a valid draft'
  const want = crypto.createHmac('sha256', secret()).update(body).digest()
  const got = Buffer.from(mac, 'base64url')
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return 'Not a valid draft'
  const d = JSON.parse(Buffer.from(body, 'base64url').toString()) as { k: string; u: string; p: Record<string, unknown>; exp: number }
  if (d.u !== userId) return 'This draft was made for someone else'
  if (d.exp < Date.now()) return 'This draft is older than 30 minutes — ask again'
  return { kind: d.k, payload: d.p }
}

// ── look-ups shared by the actions ─────────────────────────────────────────
type Term = { id: string; label: string }
async function termOf(db: SupabaseClient, label?: string): Promise<Term | string> {
  const q = db.from('academic_terms').select('id, label')
  const { data } = label ? await q.ilike('label', `%${label.replace(/[%,]/g, '')}%`) : await q.eq('is_current', true)
  const t = (data ?? []) as Term[]
  if (t.length === 1) return t[0]
  return t.length ? `Which term? ${t.map(x => x.label).join(', ')}` : label ? `No term called "${label}"` : 'No current term'
}

type Course = { id: string; code: string; name: string; short_name: string | null; section: string | null; cohort_grad_year: number | null; audience: string | null; audience_value: string | null; group_id: string | null; elective_slot: string | null; faculty_id: string | null }
async function findCourse(db: SupabaseClient, i: Record<string, unknown>): Promise<{ course: Course; term: Term } | string> {
  const term = await termOf(db, str(i.term, 40) || undefined)
  if (typeof term === 'string') return term
  const q = str(i.course, 80)
  if (!q) return 'Which course? Give its code or short name.'
  const { data } = await db.from('subjects').select('id, code, name, short_name, section, cohort_grad_year, audience, audience_value, group_id, elective_slot, faculty_id').eq('term_id', term.id)
  const all = (data ?? []) as Course[]
  const key = norm(q)
  let hit = all.filter(c => norm(c.code) === key || norm(c.short_name ?? '') === key)
  if (!hit.length) hit = all.filter(c => norm(c.name).includes(key) || key.includes(norm(c.code)))
  const sec = section(i.section)
  if (sec && hit.length > 1) {
    const year = sec.split(' ')[0]
    const narrowed = hit.filter(c => c.section === sec || (!c.section && c.cohort_grad_year))
    if (narrowed.some(c => c.section === sec)) hit = narrowed.filter(c => c.section === sec)
    else hit = narrowed.length ? narrowed : hit.filter(c => c.section?.startsWith(year + ' '))
  }
  if (!hit.length) return `No course "${q}" in ${term.label}.`
  if (hit.length > 1) return `"${q}" matches several offerings in ${term.label}: ${hit.map(c => `${c.code} ${c.section ?? 'combined'}`).join('; ')}. Say which class.`
  return { course: hit[0], term }
}

type Stu = { id: string; full_name: string; roll_number: string | null; register_number: string | null; section: string | null; email: string }
async function courseRoster(db: SupabaseClient, c: Course): Promise<Stu[]> {
  let q = db.from('profiles').select('id, full_name, roll_number, register_number, section, email').eq('role', 'STUDENT').eq('is_active', true)
  if (c.cohort_grad_year) {
    q = q.eq('batch_year', c.cohort_grad_year)
    if (c.section) q = q.like('section', `%${c.section.split(' ').pop()}`)
    else if (c.audience === 'VERTICAL' && c.audience_value) q = q.eq('vertical', c.audience_value)
  } else if (c.section) q = q.eq('section', c.section)
  const { data } = await q.range(0, 999)
  let out = (data ?? []) as Stu[]
  if (c.audience === 'GROUP' && c.group_id) {
    const { data: m } = await db.from('student_group_members').select('student_id').eq('group_id', c.group_id)
    const set = new Set((m ?? []).map((x: { student_id: string }) => x.student_id)); out = out.filter(s => set.has(s.id))
  }
  return out
}
/** Match "24CS001", "311124104001" or a name to one student of the list. */
function matchStudents(pool: Stu[], ids: unknown[]) {
  const byRoll = new Map(pool.filter(s => s.roll_number).map(s => [norm(s.roll_number!), s]))
  const byReg = new Map(pool.filter(s => s.register_number).map(s => [norm(s.register_number!), s]))
  const found: { key: string; s: Stu }[] = [], missing: string[] = []
  for (const raw of ids) {
    const key = str(raw, 80); if (!key) continue
    const k = norm(key)
    let s = byRoll.get(k) ?? byReg.get(k)
    if (!s) { const named = pool.filter(p => norm(p.full_name) === k || norm(p.full_name).startsWith(k)); if (named.length === 1) s = named[0] }
    if (s) found.push({ key, s }); else missing.push(key)
  }
  return { found, missing }
}
const who = (s: Stu) => `${s.roll_number ?? s.register_number ?? ''} ${s.full_name}`.trim()

async function findStaff(db: SupabaseClient, q: string) {
  const k = q.replace(/[%,()]/g, '').trim()
  if (k.length < 3) return 'Give at least 3 letters of the colleague’s name or email.'
  const { data } = await db.from('profiles').select('id, full_name, email').in('role', ['PROFESSOR', 'HOD']).eq('is_active', true)
    .or(`full_name.ilike.%${k}%,email.ilike.%${k}%`).limit(6)
  const s = (data ?? []) as { id: string; full_name: string; email: string }[]
  if (s.length === 1) return s[0]
  return s.length ? `Several staff match "${q}": ${s.map(x => `${x.full_name} <${x.email}>`).join('; ')}` : `No staff member matches "${q}".`
}

// ── the actions ────────────────────────────────────────────────────────────
const ROWS = { type: 'array', items: { type: 'object', properties: { student: { type: 'string', description: 'roll number, register number or name' }, marks: { type: 'string', description: 'number, or AB for absent' } }, required: ['student', 'marks'] } }

const ACTIONS: Action[] = [
  {
    name: 'draft_marks', for: 'staff',
    description: 'Prepare marks of ONE component of ONE course for the user to confirm (e.g. from an attached sheet or a pasted list). ' +
      'Each course has its own assessment scheme (see course_scheme); components are named like CIA1_CT, CIA1_CAT, CIA2_ACTIVITY (ABA / assignment), CIA1_LP (lab performance), CIA1_PT (practical test), SP (special test, replaces an absent CAT), SEM_END. ' +
      'Copy marks exactly as written in the sheet with its maximum in out_of; "AB" = absent. Nothing is saved until the user confirms.',
    input_schema: { type: 'object', properties: {
      course: { type: 'string', description: 'course code or short name' }, section: { type: 'string', description: 'class, e.g. III CSE-A (omit for combined/elective courses)' },
      term: { type: 'string', description: 'only for a past term, e.g. "2025-26 Even"' }, component: { type: 'string', description: 'e.g. CIA1_CAT, or words like "CAT 2"' }, out_of: { type: 'number', description: 'maximum the sheet uses, e.g. 100 for a CAT written out of 100' }, rows: ROWS,
    }, required: ['course', 'component', 'rows'] },
    prepare: async (db, _me, i) => {
      const f = await findCourse(db, i); if (typeof f === 'string') return f
      const { course, term } = f
      const { data: own } = await db.from('subjects').select('cia_scheme').eq('id', course.id).single()
      const scheme = schemeOf({ code: course.code, cia_scheme: own?.cia_scheme })
      const types = [...scheme.comps.map(c => ({ t: examType(c), name: `CIA ${c.cia} ${c.label}`, max: c.max })), { t: SP_KEY, name: 'Special test', max: SP_MAX }, { t: 'SEM_END', name: 'Semester-end', max: 100 }]
      const want = str(i.component, 40).toUpperCase().replace(/\s+/g, '_')
      const hit = types.find(x => x.t === want) ?? types.find(x => x.t === guessComponent(str(i.component, 60), scheme))
      if (!hit) return `Which component? This course has: ${types.map(x => `${x.t} (${x.name}, out of ${x.max})`).join(', ')}.`
      const comp = hit.t
      const { data: may } = await db.rpc('can_edit_subject', { p_subject: course.id, p_kind: 'MARKS' })
      if (may === false) return `You cannot enter marks for ${course.code} (only its teachers, its class advisor and the HOD can, and not while it is locked).`
      const max = Number(i.out_of) > 0 ? Number(i.out_of) : hit.max
      const rows = list(i.rows, 400) as { student?: unknown; marks?: unknown }[]
      const roster = await courseRoster(db, course)
      const { found, missing } = matchStudents(roster, rows.map(r => r.student))
      const warnings: string[] = [], lines: string[] = [], out: [string, number, boolean][] = []
      const bad: string[] = []
      found.forEach(({ key, s }) => {
        const raw = rows.find(r => str(r.student, 80) === key)?.marks
        const absent = /^\s*(ab|a|abs|absent)\s*$/i.test(String(raw ?? ''))
        const v = absent ? 0 : Number(String(raw ?? '').trim())
        if (!absent && (!Number.isFinite(v) || v < 0 || v > max)) { bad.push(`${who(s)}: "${raw}"`); return }
        if (out.some(o => o[0] === s.id)) return
        out.push([s.id, Math.round(v * 100) / 100, absent])
        lines.push(`${who(s)} — ${absent ? 'AB' : v}/${max}`)
      })
      if (!out.length) return `None of the students matched ${course.code} ${course.section ?? ''}${missing.length ? ` (not found: ${missing.slice(0, 10).join(', ')})` : ''}.`
      if (missing.length) warnings.push(`Not in this course, left out: ${missing.join(', ')}`)
      if (bad.length) warnings.push(`Not a valid mark (0–${max}), left out: ${bad.join('; ')}`)
      if (max !== hit.max) warnings.push(`Saved out of ${max} (the scheme says ${hit.max}); totals scale it.`)
      const { count } = await db.from('marks').select('id', { count: 'exact', head: true }).eq('subject_id', course.id).eq('exam_type', comp).in('student_id', out.map(o => o[0]))
      if (count) warnings.push(`${count} student${count === 1 ? ' already has' : 's already have'} a ${hit.name} mark — it will be replaced.`)
      if (roster.length > out.length + missing.length) warnings.push(`${roster.length - out.length} student(s) of the course get no mark in this draft.`)
      return { kind: 'draft_marks', title: `Save ${hit.name} marks`, summary: `${course.code} ${course.name} · ${course.section ?? 'combined'} · ${term.label} — ${out.length} student(s)`,
        lines, warnings, payload: { subject_id: course.id, exam_type: comp, max, rows: out, label: `${course.code} ${hit.name}` } }
    },
    execute: async (db, me, p) => {
      const rows = p.rows as [string, number, boolean][]
      const { error } = await db.from('marks').upsert(rows.map(([student_id, v, absent]) => ({
        student_id, subject_id: p.subject_id, faculty_id: me.id, exam_type: p.exam_type, marks_obtained: v, max_marks: p.max, absent: !!absent,
      })), { onConflict: 'student_id,subject_id,exam_type' })
      if (error) throw new Error(error.message)
      return { message: `Saved ${rows.length} ${p.label} marks. Check them under Assessments & Marks.` }
    },
  },
  {
    name: 'draft_attendance', for: 'staff',
    description: 'Prepare attendance of a class hour for the user to confirm: who is absent (and on duty). Everyone else is present. Default date is today. Nothing is saved until the user confirms.',
    input_schema: { type: 'object', properties: {
      section: { type: 'string', description: 'e.g. II CSE-B' }, date: { type: 'string', description: 'YYYY-MM-DD' },
      periods: { type: 'array', items: { type: 'number' }, description: 'period numbers, e.g. [3] or [5,6,7] for a lab' },
      course: { type: 'string', description: 'only needed when the hour is split between courses' },
      absent: { type: 'array', items: { type: 'string' }, description: 'roll numbers, register numbers or names' },
      on_duty: { type: 'array', items: { type: 'string' } }, topic: { type: 'string' },
    }, required: ['section', 'periods', 'absent'] },
    prepare: async (db, me, i) => {
      const sec = section(i.section); if (!sec) return 'Which class? e.g. III CSE-A'
      const date = isDate(str(i.date, 10)) ? str(i.date, 10) : ist()
      const periods = [...new Set((list(i.periods, 8)).map(Number).filter(n => n >= 1 && n <= 10))]
      if (!periods.length) return 'Which period(s)?'
      const term = await termOf(db); if (typeof term === 'string') return term
      const scope = sec.startsWith('I ') ? 'FY' : sec.startsWith('IV') ? 'IV' : 'HS'
      const { data: day } = await db.from('calendar_days').select('is_working, day_order, label').eq('date', date).in('scope', [scope, 'ALL']).limit(1).maybeSingle()
      if (day && !day.is_working) return `${date} is not a working day for ${sec} (${day.label ?? 'holiday'}).`
      const order = day?.day_order ?? (new Date(date + 'T00:00:00Z').getUTCDay() || 7)
      const { data: ents } = await db.from('timetable_entries').select('id, period_no, section, subject_id, label, audience, audience_value, group_id, subjects(code, short_name)')
        .eq('term_id', term.id).eq('section', sec).eq('day_order', order).in('period_no', periods)
      type E = { id: string; period_no: number; section: string; subject_id: string | null; label: string | null; audience: string; audience_value: string | null; group_id: string | null; subjects: { code: string; short_name: string | null } | null }
      const entries = (ents ?? []) as unknown as E[]
      const { data: mine } = await db.rpc('my_teaching_ids')
      const ids = (mine ?? []) as string[]
      const { data: links } = await db.from('subject_faculty').select('subject_id').in('faculty_id', ids)
      const { data: own } = await db.from('subjects').select('id').in('faculty_id', ids).eq('term_id', term.id)
      const teach = new Set([...(links ?? []), ...(own ?? [])].map((x: { subject_id?: string; id?: string }) => x.subject_id ?? x.id))
      const want = str(i.course, 40) ? norm(str(i.course, 40)) : ''
      const picked: E[] = []
      for (const p of periods) {
        let cell = entries.filter(e => e.period_no === p)
        if (!cell.length) return `${sec} has no class in period ${p} on ${date}.`
        if (want) cell = cell.filter(e => norm(e.subjects?.code ?? '') === want || norm(e.subjects?.short_name ?? e.label ?? '') === want)
        else if (cell.length > 1) { const t = cell.filter(e => e.subject_id && teach.has(e.subject_id)); if (t.length) cell = t }
        if (cell.length !== 1) return `Period ${p} of ${sec} is split (${entries.filter(e => e.period_no === p).map(e => e.subjects?.short_name || e.subjects?.code || e.label).join(' / ')}); say which course.`
        picked.push(cell[0])
      }
      const year = sec.split(' ')[0]
      const { data: pool } = await db.from('profiles').select('id, full_name, roll_number, register_number, section, email').eq('role', 'STUDENT').eq('is_active', true).like('section', `${year} CSE-%`)
      const ab = matchStudents((pool ?? []) as Stu[], list(i.absent, 120)), od = matchStudents((pool ?? []) as Stu[], list(i.on_duty, 120))
      const warnings: string[] = []
      if (ab.missing.length) warnings.push(`Not found, left out: ${ab.missing.join(', ')}`)
      if (od.missing.length) warnings.push(`On duty not found: ${od.missing.join(', ')}`)
      warnings.push('Everyone else on the roster is marked present. The hour is submitted (you can still correct it for 10 minutes).')
      const course = picked[0].subjects?.short_name || picked[0].subjects?.code || picked[0].label || 'class'
      return { kind: 'draft_attendance', title: `Take attendance — ${sec}, ${date}`, summary: `${course} · period ${periods.join(', ')} · ${ab.found.length} absent${od.found.length ? `, ${od.found.length} on duty` : ''}`,
        lines: [...ab.found.map(x => `Absent: ${who(x.s)}`), ...od.found.map(x => `On duty: ${who(x.s)}`)], warnings,
        payload: { date, topic: str(i.topic, 300) || null, absent: ab.found.map(x => x.s.id), on_duty: od.found.map(x => x.s.id).filter(id => !ab.found.some(a => a.s.id === id)),
          entries: picked.map(e => ({ period: e.period_no, id: e.id, section: e.section, subject_id: e.subject_id, label: e.subject_id ? null : e.label, audience: e.audience, value: e.audience_value, group: e.group_id })) } }
    },
    execute: async (db, _me, p) => {
      const absent = p.absent as string[], onDuty = p.on_duty as string[]
      let marked = 0, dropped = 0
      for (const e of p.entries as { period: number; id: string; section: string; subject_id: string | null; label: string | null; audience: string; value: string | null; group: string | null }[]) {
        const { data: s, error } = await db.rpc('att_open', { p_date: p.date, p_period: e.period, p_section: e.section, p_subject: e.subject_id, p_label: e.label, p_audience: e.audience, p_value: e.value, p_group: e.group, p_entry: e.id })
        if (error) throw new Error(`Period ${e.period}: ${error.message}`)
        const sess = s as { id: string; roster: string[]; updated_at: string }
        const ab = absent.filter(id => sess.roster.includes(id)); dropped = Math.max(dropped, absent.length - ab.length)
        const { error: e2 } = await db.rpc('att_save', { p_session: sess.id, p_absent: ab, p_topic: p.topic, p_submit: true, p_reason: null, p_headcount: null,
          p_on_duty: onDuty.filter(id => sess.roster.includes(id)), p_expected: sess.updated_at })
        if (e2) throw new Error(`Period ${e.period}: ${e2.message}`)
        marked++
      }
      return { message: `Attendance submitted for ${marked} hour(s)${dropped ? `; ${dropped} named student(s) are not on this hour’s roster and were ignored` : ''}.` }
    },
  },
  {
    name: 'draft_notice', for: 'staff',
    description: 'Prepare a notice (announcement) for the user to confirm. Audience: ALL, STUDENTS, FACULTY, or one class such as "III CSE-A".',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, audience: { type: 'string' }, urgent: { type: 'boolean' }, expires_on: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['title', 'body'] },
    prepare: async (_db, _me, i) => {
      const title = str(i.title, 150), body = str(i.body, 4000)
      if (!title || !body) return 'A notice needs a title and text.'
      const a = str(i.audience, 20).toUpperCase()
      const audience = ['ALL', 'STUDENTS', 'FACULTY'].includes(a) ? a : section(a) ?? 'ALL'
      const exp = isDate(str(i.expires_on, 10)) ? str(i.expires_on, 10) : null
      return { kind: 'draft_notice', title: 'Post a notice', summary: `${title} — to ${audience}${i.urgent ? ' · urgent' : ''}${exp ? ` · until ${exp}` : ''}`, lines: body.split('\n').slice(0, 40), warnings: [],
        payload: { title, body, audience, urgent: !!i.urgent, expires_at: exp ? `${exp}T23:59:59+05:30` : null } }
    },
    execute: async (db, me, p) => {
      const { error } = await db.from('announcements').insert({ title: p.title, body: p.body, audience: p.audience, is_urgent: p.urgent, expires_at: p.expires_at, created_by: me.id, department_id: DEPT_ID })
      if (error) throw new Error(error.message)
      return { message: 'Notice posted.' }
    },
  },
  {
    name: 'draft_course_outcomes', for: 'staff',
    description: 'Prepare the course outcome statements CO1–CO6 of a course for the user to confirm.',
    input_schema: { type: 'object', properties: { course: { type: 'string' }, section: { type: 'string' }, outcomes: { type: 'array', items: { type: 'string' } } }, required: ['course', 'outcomes'] },
    prepare: async (db, _me, i) => {
      const f = await findCourse(db, i); if (typeof f === 'string') return f
      const cos = list(i.outcomes, 6).map(x => str(x, 500)).filter(Boolean)
      if (!cos.length) return 'Give the outcome statements.'
      return { kind: 'draft_course_outcomes', title: 'Set course outcomes', summary: `${f.course.code} ${f.course.name} · ${f.course.section ?? 'combined'}`, lines: cos.map((c, n) => `CO${n + 1}: ${c}`),
        warnings: ['Replaces the current CO1–CO6 of this offering.'], payload: { subject_id: f.course.id, cos } }
    },
    execute: async (db, _me, p) => {
      const { error } = await db.rpc('set_course_outcomes', { p_subject: p.subject_id, p_cos: p.cos })
      if (error) throw new Error(error.message)
      return { message: 'Course outcomes saved. Map them to POs on the Outcomes page.' }
    },
  },
  {
    name: 'draft_handover', for: 'staff',
    description: "Prepare handing the user's class(es) to a colleague for some dates (at most 31 days), for the user to confirm.",
    input_schema: { type: 'object', properties: { to: { type: 'string', description: 'colleague name or email' }, course: { type: 'string', description: 'omit for all my classes' }, section: { type: 'string' },
      from: { type: 'string', description: 'YYYY-MM-DD' }, until: { type: 'string', description: 'YYYY-MM-DD' }, note: { type: 'string' } }, required: ['to', 'from', 'until'] },
    prepare: async (db, me, i) => {
      const to = await findStaff(db, str(i.to, 80)); if (typeof to === 'string') return to
      if (to.id === me.id) return 'Choose a colleague, not yourself.'
      const from = str(i.from, 10), until = str(i.until, 10)
      if (!isDate(from) || !isDate(until) || until < from) return 'Give the dates as YYYY-MM-DD (until on or after from).'
      if ((Date.parse(until) - Date.parse(from)) / 864e5 > 31) return 'A hand-over can cover at most 31 days.'
      let subject: Course | null = null
      if (str(i.course)) { const f = await findCourse(db, i); if (typeof f === 'string') return f; subject = f.course }
      const course = subject ? `${subject.short_name || subject.code} (${subject.section ?? 'combined'})` : 'All my classes'
      return { kind: 'draft_handover', title: 'Hand over my class', summary: `${course} → ${to.full_name}, ${from} to ${until}`, lines: str(i.note) ? [`Note: ${str(i.note, 300)}`] : [],
        warnings: [`${to.full_name} gets an email and sees the class under My classes.`], payload: { to: to.id, to_email: to.email, to_name: to.full_name, subject_id: subject?.id ?? null, course, from, until, note: str(i.note, 300) || null } }
    },
    execute: async (db, me, p) => {
      const { data: ids } = await db.rpc('my_teaching_ids')
      const fromFaculty = ((ids ?? []) as string[]).at(-1) ?? me.id
      const { error } = await db.from('attendance_delegations').insert({ from_faculty: fromFaculty, to_faculty: p.to, subject_id: p.subject_id, valid_from: p.from, valid_to: p.until, note: p.note })
      if (error) throw new Error(error.message)
      return { message: `Handed over to ${p.to_name}.`, notify: { kind: 'handover', to_email: String(p.to_email), to_name: String(p.to_name), course: String(p.course), from: String(p.from), until: String(p.until), note: (p.note as string) ?? undefined } }
    },
  },
  {
    name: 'draft_leave', for: 'all',
    description: 'Prepare a leave application of the user for them to confirm. Students: Medical, Personal, Family Emergency, On Duty (OD), Academic Event, Sports, Other. Staff: Casual Leave, Medical Leave, On Duty (OD), Earned Leave, Compensatory Off, Other.',
    input_schema: { type: 'object', properties: { leave_type: { type: 'string' }, from: { type: 'string' }, until: { type: 'string' }, reason: { type: 'string' } }, required: ['leave_type', 'from', 'until', 'reason'] },
    prepare: async (_db, me, i) => {
      const types = me.role === 'STUDENT' ? ['Medical', 'Personal', 'Family Emergency', 'On Duty (OD)', 'Academic Event', 'Sports', 'Other'] : ['Casual Leave', 'Medical Leave', 'On Duty (OD)', 'Earned Leave', 'Compensatory Off', 'Other']
      const t = types.find(x => norm(x) === norm(str(i.leave_type, 40))) ?? types.find(x => norm(x).startsWith(norm(str(i.leave_type, 40)).slice(0, 4)))
      if (!t) return `Leave type? One of: ${types.join(', ')}.`
      const from = str(i.from, 10), until = str(i.until, 10), reason = str(i.reason, 1000)
      if (!isDate(from) || !isDate(until) || until < from) return 'Give the dates as YYYY-MM-DD.'
      if (!reason) return 'Give the reason.'
      return { kind: 'draft_leave', title: 'Apply for leave', summary: `${t}, ${from} to ${until}`, lines: [reason], warnings: ['Attach a certificate, if needed, on the Leave page after applying.'], payload: { t, from, until, reason } }
    },
    execute: async (db, me, p) => {
      const { error } = await db.from('leaves').insert({ applicant_id: me.id, leave_type: p.t, from_date: p.from, to_date: p.until, reason: p.reason, status: 'PENDING' })
      if (error) throw new Error(error.message)
      return { message: 'Leave application sent.' }
    },
  },
  {
    name: 'draft_grievance', for: 'student',
    description: 'Prepare a grievance of the student for them to confirm. Category: Academic, Examination, Faculty, Infrastructure, Administration, Ragging, Other. Only the student and the HOD see it.',
    input_schema: { type: 'object', properties: { category: { type: 'string' }, subject_line: { type: 'string' }, description: { type: 'string' } }, required: ['category', 'subject_line', 'description'] },
    prepare: async (_db, _me, i) => {
      const cats = ['Academic', 'Examination', 'Faculty', 'Infrastructure', 'Administration', 'Ragging', 'Other']
      const c = cats.find(x => x.toLowerCase() === str(i.category, 30).toLowerCase()) ?? 'Other'
      const s = str(i.subject_line, 150), d = str(i.description, 3000)
      if (!s || !d) return 'A grievance needs a subject and a description.'
      return { kind: 'draft_grievance', title: 'Raise a grievance', summary: `${c}: ${s}`, lines: d.split('\n').slice(0, 30), warnings: ['Only you and the HOD can see it.'], payload: { c, s, d } }
    },
    execute: async (db, me, p) => {
      const { error } = await db.from('grievances').insert({ student_id: me.id, category: p.c, subject_line: p.s, description: p.d })
      if (error) throw new Error(error.message)
      return { message: 'Grievance submitted. Follow it on the Grievances page.' }
    },
  },
  {
    name: 'draft_students', for: 'hod',
    description: 'Prepare new student accounts for the HOD to confirm (at most 50). Each needs full_name, email, section (e.g. II CSE-A), batch_year (year of graduation, e.g. 2029), lab_batch (1 or 2); optional roll_number, register_number, vertical (III/IV year, e.g. AIML or FSD), parent_mobile, parent_email.',
    input_schema: { type: 'object', properties: { students: { type: 'array', items: { type: 'object', properties: {
      full_name: { type: 'string' }, email: { type: 'string' }, section: { type: 'string' }, batch_year: { type: 'number' }, lab_batch: { type: 'number' }, roll_number: { type: 'string' },
      register_number: { type: 'string' }, vertical: { type: 'string' }, parent_mobile: { type: 'string' }, parent_email: { type: 'string' } }, required: ['full_name', 'email', 'section'] } } }, required: ['students'] },
    prepare: async (db, _me, i) => {
      const rows = list(i.students, 50) as Record<string, unknown>[]
      const out: NewStudent[] = [], warnings: string[] = []
      for (const r of rows) {
        const sec = section(r.section)
        const s: NewStudent = { full_name: str(r.full_name, 120), email: str(r.email, 120).toLowerCase(), section: sec ?? str(r.section, 20), batch_year: Number(r.batch_year) || 0,
          lab_batch: Number(r.lab_batch) || null, roll_number: str(r.roll_number, 20) || undefined, register_number: str(r.register_number, 20) || undefined,
          vertical: str(r.vertical, 20).toUpperCase() || null, parent_mobile: str(r.parent_mobile, 20) || undefined, parent_email: str(r.parent_email, 120) || null }
        if (!sec) warnings.push(`${s.full_name}: section "${str(r.section, 20)}" is not one of ${SECTIONS.join(', ')}`)
        if (!s.lab_batch) warnings.push(`${s.full_name}: lab batch missing (1 or 2)`)
        if (!s.batch_year) warnings.push(`${s.full_name}: batch (year of graduation) missing`)
        out.push(s)
      }
      if (!out.length) return 'No students given.'
      const { data: ex } = await db.from('profiles').select('email').in('email', out.map(s => s.email))
      if (ex?.length) warnings.push(`Already have accounts (will be skipped): ${ex.map((e: { email: string }) => e.email).join(', ')}`)
      return { kind: 'draft_students', title: `Add ${out.length} student(s)`, summary: 'Each starts on the default student password and must change it at first sign-in.',
        lines: out.map(s => `${s.roll_number ?? ''} ${s.full_name} <${s.email}> · ${s.section} · batch ${s.batch_year || '?'} · lab ${s.lab_batch ?? '?'}${s.vertical ? ` · ${s.vertical}` : ''}`), warnings, payload: { rows: out } }
    },
    execute: async (_db, _me, p, token) => {
      const r = await importStudentsAdmin(token, p.rows as NewStudent[])
      if (r.error) throw new Error(r.error)
      const made = r.results?.filter(x => x.status === 'created').length ?? 0
      const other = r.results?.filter(x => x.status !== 'created').map(x => `${x.email}: ${x.message ?? x.status}`) ?? []
      return { message: `Created ${made} student account(s).${other.length ? ` Not created — ${other.join('; ')}` : ''}` }
    },
  },
  {
    name: 'draft_staff', for: 'hod',
    description: 'Prepare new staff accounts for the HOD to confirm. Each needs full_name and a licet.ac.in email; department only for staff of other departments.',
    input_schema: { type: 'object', properties: { staff: { type: 'array', items: { type: 'object', properties: { full_name: { type: 'string' }, email: { type: 'string' }, department: { type: 'string' } }, required: ['full_name', 'email'] } } }, required: ['staff'] },
    prepare: async (db, _me, i) => {
      const rows = (list(i.staff, 200) as Record<string, unknown>[]).map(r => ({ full_name: str(r.full_name, 120), email: str(r.email, 120).toLowerCase(), department: str(r.department, 40) || undefined }))
      if (!rows.length) return 'No staff given.'
      const warnings: string[] = []
      const bad = rows.filter(r => !/^[^\s@]+@licet\.ac\.in$/.test(r.email)); if (bad.length) warnings.push(`Not a licet.ac.in email (will fail): ${bad.map(b => b.email || b.full_name).join(', ')}`)
      const { data: ex } = await db.from('profiles').select('email').in('email', rows.map(r => r.email))
      if (ex?.length) warnings.push(`Already have accounts: ${ex.map((e: { email: string }) => e.email).join(', ')}`)
      return { kind: 'draft_staff', title: `Add ${rows.length} staff`, summary: 'Default password licet@<first name>; they must change it at first sign-in.',
        lines: rows.map(r => `${r.full_name} <${r.email}>${r.department ? ` · ${r.department}` : ''}`), warnings, payload: { rows } }
    },
    execute: async (_db, _me, p, token) => {
      const r = await createStaffAdmin(token, p.rows as NewStaff[])
      if (r.error) throw new Error(r.error)
      const ok = r.results?.filter(x => x.ok).length ?? 0
      const bad = r.results?.filter(x => !x.ok).map(x => `${x.email}: ${x.error}`) ?? []
      return { message: `Created ${ok} staff account(s).${bad.length ? ` Not created — ${bad.join('; ')}` : ''}` }
    },
  },
  {
    name: 'draft_calendar', for: 'hod',
    description: 'Prepare academic calendar changes for the HOD to confirm: declare dates holidays, or working days that follow a weekday’s timetable (e.g. a Saturday following Monday). Scopes: FY (first year), HS (II–III year), IV; default all.',
    input_schema: { type: 'object', properties: { dates: { type: 'array', items: { type: 'string' } }, working: { type: 'boolean' }, follows: { type: 'string', description: 'weekday whose timetable a working day follows, e.g. Monday' },
      label: { type: 'string', description: 'e.g. Diwali' }, scopes: { type: 'array', items: { type: 'string' } } }, required: ['dates', 'working'] },
    prepare: async (db, _me, i) => {
      const dates = [...new Set(list(i.dates, 31).map(d => str(d, 10)).filter(isDate))].sort()
      if (!dates.length) return 'Give the date(s) as YYYY-MM-DD.'
      const scopes = list(i.scopes, 3).map(s => str(s, 4).toUpperCase()).filter(s => ['FY', 'HS', 'IV'].includes(s))
      const sc = scopes.length ? scopes : ['FY', 'HS', 'IV']
      const working = !!i.working
      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
      const fo = days.findIndex(d => d.startsWith(str(i.follows, 12).toUpperCase().slice(0, 3)) && str(i.follows).length >= 3)
      if (working && fo < 0 && dates.some(d => new Date(d + 'T00:00:00Z').getUTCDay() === 0)) return 'A Sunday working day needs the weekday it follows.'
      const { data: terms } = await db.from('academic_terms').select('id, starts_on, ends_on')
      const termFor = (d: string) => ((terms ?? []) as { id: string; starts_on: string; ends_on: string }[]).find(t => t.starts_on <= d && d <= t.ends_on)?.id ?? null
      const rows = dates.flatMap(d => sc.map(scope => ({ date: d, scope, term_id: termFor(d), is_working: working,
        day_order: working ? (fo >= 0 ? fo + 1 : (new Date(d + 'T00:00:00Z').getUTCDay() || 7)) : null, label: str(i.label, 80) || null })))
      return { kind: 'draft_calendar', title: working ? 'Make working day(s)' : 'Declare holiday(s)', summary: `${dates.join(', ')} · ${sc.join(', ')}${str(i.label) ? ` · ${str(i.label, 80)}` : ''}`,
        lines: rows.map(r => `${r.date} ${r.scope}: ${r.is_working ? `working, follows ${days[(r.day_order ?? 1) - 1]}` : 'holiday'}`), warnings: rows.some(r => !r.term_id) ? ['Some dates are outside every term.'] : [], payload: { rows } }
    },
    execute: async (db, _me, p) => {
      const { error } = await db.from('calendar_days').upsert(p.rows as Record<string, unknown>[], { onConflict: 'date,scope' })
      if (error) throw new Error(error.message)
      return { message: 'Calendar updated.' }
    },
  },
  {
    name: 'draft_student_update', for: 'hod',
    description: 'Prepare corrections to ONE student’s record for the HOD to confirm: roll_number, register_number, lab_batch, vertical, parent_mobile, parent_email, phone.',
    input_schema: { type: 'object', properties: { student: { type: 'string' }, changes: { type: 'object', properties: {
      roll_number: { type: 'string' }, register_number: { type: 'string' }, lab_batch: { type: 'number' }, vertical: { type: 'string' }, parent_mobile: { type: 'string' }, parent_email: { type: 'string' }, phone: { type: 'string' } } } }, required: ['student', 'changes'] },
    prepare: async (db, _me, i) => {
      const { data } = await db.from('profiles').select('id, full_name, roll_number, register_number, section, email, lab_batch, vertical, parent_mobile, parent_email, phone').eq('role', 'STUDENT').eq('is_active', true)
      const pool = (data ?? []) as (Stu & Record<string, unknown>)[]
      const m = matchStudents(pool, [i.student])
      if (!m.found.length) return `No student matches "${str(i.student, 60)}".`
      const s = m.found[0].s as Stu & Record<string, unknown>
      const allowed = ['roll_number', 'register_number', 'lab_batch', 'vertical', 'parent_mobile', 'parent_email', 'phone']
      const ch = Object.fromEntries(Object.entries((i.changes ?? {}) as Record<string, unknown>).filter(([k, v]) => allowed.includes(k) && v !== undefined && v !== null && str(v) !== '')
        .map(([k, v]) => [k, k === 'lab_batch' ? Number(v) : k === 'vertical' ? str(v, 20).toUpperCase() : str(v, 120)]))
      if (!Object.keys(ch).length) return 'What should change?'
      return { kind: 'draft_student_update', title: 'Correct a student record', summary: `${who(s)} · ${s.section}`, lines: Object.entries(ch).map(([k, v]) => `${k}: ${String(s[k] ?? '—')} → ${v}`), warnings: [], payload: { id: s.id, ch } }
    },
    execute: async (db, _me, p) => {
      const { error } = await db.from('profiles').update(p.ch as Record<string, unknown>).eq('id', p.id)
      if (error) throw new Error(error.message)
      return { message: 'Student record updated.' }
    },
  },
  {
    name: 'draft_course_teacher', for: 'hod',
    description: 'Prepare linking a teacher to a course offering (MAIN or ASSISTANT) for the HOD to confirm.',
    input_schema: { type: 'object', properties: { course: { type: 'string' }, section: { type: 'string' }, term: { type: 'string' }, teacher: { type: 'string' }, role: { type: 'string', enum: ['MAIN', 'ASSISTANT'] } }, required: ['course', 'teacher'] },
    prepare: async (db, _me, i) => {
      const f = await findCourse(db, i); if (typeof f === 'string') return f
      const t = await findStaff(db, str(i.teacher, 80)); if (typeof t === 'string') return t
      const role = str(i.role, 10).toUpperCase() === 'ASSISTANT' ? 'ASSISTANT' : 'MAIN'
      return { kind: 'draft_course_teacher', title: 'Link a teacher to a course', summary: `${t.full_name} → ${f.course.code} ${f.course.name} · ${f.course.section ?? 'combined'} (${role})`, lines: [], warnings: [],
        payload: { subject_id: f.course.id, faculty_id: t.id, role, set_main: role === 'MAIN' } }
    },
    execute: async (db, _me, p) => {
      const { error } = await db.from('subject_faculty').upsert({ subject_id: p.subject_id, faculty_id: p.faculty_id, role: p.role }, { onConflict: 'subject_id,faculty_id' })
      if (error) throw new Error(error.message)
      if (p.set_main) { const { error: e2 } = await db.from('subjects').update({ faculty_id: p.faculty_id }).eq('id', p.subject_id); if (e2) throw new Error(e2.message) }
      return { message: 'Teacher linked to the course.' }
    },
  },
]

export function actionsFor(me: Asker) {
  const staff = me.role !== 'STUDENT'
  return ACTIONS.filter(a => a.for === 'all' || (a.for === 'student' && !staff) || (a.for === 'staff' && staff) || (a.for === 'hod' && me.tier1))
}
export const isAction = (name: string) => ACTIONS.some(a => a.name === name)

/** Model asked for a draft → preview + signed token (or a message saying what is missing). */
export async function prepareAction(db: SupabaseClient, me: Asker, name: string, input: Record<string, unknown>) {
  const a = actionsFor(me).find(x => x.name === name)
  if (!a) return { text: 'That change is not available to you.' }
  const r = await a.prepare(db, me, input ?? {})
  if (typeof r === 'string') return { text: r }
  const token = signDraft(r.kind, me.id, r.payload)
  const shown = { kind: r.kind, title: r.title, summary: r.summary, lines: r.lines.slice(0, 400), warnings: r.warnings }
  return { text: `Draft "${r.title}" is shown to the user with a Confirm button (${r.summary}${r.warnings.length ? `; notes: ${r.warnings.join(' ')}` : ''}). Nothing is saved until they confirm — tell them to check it and press Confirm.`, proposal: { ...shown, token } }
}

export async function executeAction(db: SupabaseClient, me: Asker, token: string, accessToken: string): Promise<Done> {
  const d = readDraft(token, me.id)
  if (typeof d === 'string') throw new Error(d)
  const a = actionsFor(me).find(x => x.name === d.kind)
  if (!a) throw new Error('That change is not available to you.')
  return a.execute(db, me, d.payload, accessToken)
}
