// LICET AI drafts on the LOCAL stack: prepare → confirm, with each person's own session.
// No AI model is called; this checks what the drafts do once the model has asked for them.
console.log('ai-actions.mts')
import { createClient } from '@supabase/supabase-js'
import type { Asker } from '../../src/lib/ai/tools'
const URL_ = process.env.API_URL!, ANON = process.env.ANON_KEY!, SERVICE = process.env.SERVICE_ROLE_KEY!
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON
const { actionsFor, prepareAction, executeAction, readDraft } = await import('../../src/lib/ai/actions')
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

async function as(email: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: 'LocalTest#2026' })
  const { data: p } = await c.from('profiles').select('*').eq('id', data.user!.id).single()
  const me: Asker = { id: p.id, role: p.role, tier1: p.role === 'HOD', full_name: p.full_name, section: p.section, advisor_section: p.advisor_section }
  return { c, me, token: data.session!.access_token }
}
const ok = (c: boolean, m: string, i = '') => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}${c ? '' : '  — ' + i}`)

const f = await as('faculty1@test.local')
const { data: course } = await admin.from('subjects').select('id, code, section').eq('code', 'CS24501').eq('section', 'III CSE-A').limit(1).single()
const { data: kids } = await admin.from('profiles').select('id, full_name, roll_number, register_number').eq('role', 'STUDENT').eq('section', 'III CSE-A').order('full_name').limit(3)
const k = kids ?? []
const ident = (s: { roll_number: string | null; register_number: string | null; full_name: string }) => s.roll_number ?? s.register_number ?? s.full_name

// marks: draft, scaled, unknown student reported, nothing saved before confirm
await admin.from('marks').delete().eq('subject_id', course!.id).eq('exam_type', 'CIA2_CAT')
const d = await prepareAction(f.c, f.me, 'draft_marks', { course: 'CS24501', section: 'III CSE-A', component: 'CIA 2 CAT', out_of: 100,
  rows: [{ student: ident(k[0]), marks: '80' }, { student: ident(k[1]), marks: 'AB' }, { student: 'NOBODY123', marks: '50' }] })
const p = d.proposal
ok(!!p && p.lines.length === 2 && p.lines[0].includes('→ 48/60'), 'marks draft: two students, 80/100 scaled to 48/60', JSON.stringify(d).slice(0, 200))
ok(!!p && p.warnings.some(w => w.includes('NOBODY123')), 'marks draft: unknown student listed, not saved')
const { count: before } = await admin.from('marks').select('id', { count: 'exact', head: true }).eq('subject_id', course!.id).eq('exam_type', 'CIA2_CAT')
ok(before === 0, 'nothing is saved before Confirm', String(before))
const r = p ? await executeAction(f.c, f.me, p.token, f.token).catch(e => ({ message: 'ERR ' + e.message })) : { message: 'no draft' }
const { data: saved } = await admin.from('marks').select('student_id, marks_obtained, max_marks, faculty_id').eq('subject_id', course!.id).eq('exam_type', 'CIA2_CAT')
ok((saved ?? []).length === 2 && saved!.some(m => Number(m.marks_obtained) === 48 && Number(m.max_marks) === 60) && saved!.every(m => m.faculty_id === f.me.id), 'Confirm saves the marks as the teacher', r.message)
await admin.from('marks').delete().eq('subject_id', course!.id).eq('exam_type', 'CIA2_CAT')

// signed drafts: tampering and someone else's draft are refused
if (p) {
  const [body, mac] = p.token.split('.')
  const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), p: { subject_id: course!.id, exam_type: 'CIA2_CAT', max: 60, rows: [[k[0].id, 60]] } })).toString('base64url')
  ok(readDraft(`${evil}.${mac}`, f.me.id) === 'Not a valid draft', 'a changed draft is refused')
  const st = await as('student12@test.local')
  ok(readDraft(p.token, st.me.id) === 'This draft was made for someone else', "someone else's draft is refused")
  ok(!actionsFor(st.me).some(a => a.name === 'draft_marks' || a.name === 'draft_students'), 'students get no staff or HOD drafts')
  const g = await prepareAction(st.c, st.me, 'draft_grievance', { category: 'Infrastructure', subject_line: 'AI test fan', description: 'The fan in I21 is not working.' })
  const gr = g.proposal ? await executeAction(st.c, st.me, g.proposal.token, st.token).catch(e => ({ message: 'ERR ' + e.message })) : { message: 'no draft' }
  const { data: gv } = await admin.from('grievances').select('id').eq('student_id', st.me.id).eq('subject_line', 'AI test fan')
  ok((gv ?? []).length === 1, 'student: grievance draft → confirm', gr.message)
  await admin.from('grievances').delete().eq('subject_line', 'AI test fan')
  const no = await prepareAction(st.c, st.me, 'draft_marks', { course: 'CS24501', component: 'CIA1_CT', rows: [] })
  ok(!no.proposal && /not available/.test(no.text), 'student cannot draft marks by naming the tool')
}

// a teacher cannot enter marks for a course they do not teach
const other = await as('faculty2@test.local')
const nd = await prepareAction(other.c, other.me, 'draft_marks', { course: 'CS24501', section: 'III CSE-A', component: 'CIA1_CT', rows: [{ student: ident(k[0]), marks: '20' }] })
ok(!nd.proposal, 'another teacher cannot draft marks for this course', nd.text)

// attendance: yesterday's period 1 of III CSE-A (faculty1 teaches it), one absentee
const y = new Date(Date.now() + 5.5 * 3600e3 - 864e5); while ([0, 6].includes(y.getUTCDay())) y.setUTCDate(y.getUTCDate() - 1)
const date = y.toISOString().slice(0, 10)
await admin.from('attendance_sessions').delete().eq('section', 'III CSE-A').eq('date', date).eq('period_no', 1)
const a = await prepareAction(f.c, f.me, 'draft_attendance', { section: 'III CSE-A', date, periods: [1], absent: [ident(k[2])] })
ok(!!a.proposal && a.proposal.lines.length === 1, 'attendance draft: one absentee', a.text)
if (a.proposal) {
  const ar = await executeAction(f.c, f.me, a.proposal.token, f.token).catch(e => ({ message: 'ERR ' + e.message }))
  const { data: s } = await admin.from('attendance_sessions').select('absent, status, roster').eq('section', 'III CSE-A').eq('date', date).eq('period_no', 1).maybeSingle()
  ok(!!s && s.absent.length === 1 && s.absent[0] === k[2].id && s.status === 'SUBMITTED', 'Confirm submits the hour with that student absent', `${ar.message} ${JSON.stringify(s)?.slice(0, 120)}`)
  await admin.from('attendance_sessions').delete().eq('section', 'III CSE-A').eq('date', date).eq('period_no', 1)
}

// HOD: calendar and new student accounts
const h = await as('hod@test.local')
const cal = await prepareAction(h.c, h.me, 'draft_calendar', { dates: ['2031-01-03'], working: false, label: 'AI test holiday', scopes: ['HS'] })
const cr = cal.proposal ? await executeAction(h.c, h.me, cal.proposal.token, h.token).catch(e => ({ message: 'ERR ' + e.message })) : { message: cal.text }
const { data: cd } = await admin.from('calendar_days').select('is_working, label').eq('date', '2031-01-03').eq('scope', 'HS').maybeSingle()
ok(cd?.is_working === false && cd?.label === 'AI test holiday', 'HOD: holiday draft → confirm', cr.message)
await admin.from('calendar_days').delete().eq('date', '2031-01-03')
const fc = await prepareAction(f.c, f.me, 'draft_calendar', { dates: ['2031-01-03'], working: false })
ok(!fc.proposal, 'faculty cannot draft calendar changes')
const sd = await prepareAction(h.c, h.me, 'draft_students', { students: [{ full_name: 'Ai Test Lateral', email: 'ai.lateral@test.local', section: 'II CSE-B', batch_year: 2029, lab_batch: 1, roll_number: '25CS999' }] })
const sr = sd.proposal ? await executeAction(h.c, h.me, sd.proposal.token, h.token).catch(e => ({ message: 'ERR ' + e.message })) : { message: sd.text }
const { data: np } = await admin.from('profiles').select('id, section, roll_number, must_change_password').eq('email', 'ai.lateral@test.local').maybeSingle()
ok(np?.section === 'II CSE-B' && np?.roll_number === '25CS999' && np?.must_change_password === true, 'HOD: add-students draft creates the account', sr.message)
if (np) await admin.auth.admin.deleteUser(np.id)
