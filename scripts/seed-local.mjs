#!/usr/bin/env node
// Seeds a LOCAL Supabase (supabase start) with fake people and a working term so the
// app can be clicked through end to end. Refuses to run against anything but localhost.
//
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local service key> node scripts/seed-local.mjs
//
// Test accounts (local only):  hod@test.local, faculty1@test.local, faculty2@test.local,
// advisor@test.local, student1@test.local … — password for all: LocalTest#2026
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) { console.error('Refusing: seed-local only runs against a local Supabase'); process.exit(1) }
if (!key) { console.error('Set SUPABASE_SERVICE_ROLE_KEY (from `supabase status`)'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })
const PASSWORD = 'LocalTest#2026'
const DEPT = '00000000-0000-0000-0000-000000000001'

const must = (r, what) => { if (r.error) { console.error(what, r.error.message); process.exit(1) } return r.data }
const iso = d => d.toISOString().slice(0, 10)
const today = new Date(Date.now() + 5.5 * 3600e3)

async function user(email, profile) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
  let u = list.users.find(x => x.email === email)
  if (!u) u = must(await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), 'createUser ' + email).user
  must(await db.from('profiles').upsert({ id: u.id, email, department_id: DEPT, is_active: true, must_change_password: false, ...profile }), 'profile ' + email)
  return u.id
}

const dept = await db.from('departments').select('id').eq('id', DEPT).maybeSingle()
if (!dept.data) must(await db.from('departments').insert({ id: DEPT, name: 'Computer Science and Engineering', code: 'CSE' }), 'department')

const hod = await user('hod@test.local', { role: 'HOD', full_name: 'Test HOD' })
const f1 = await user('faculty1@test.local', { role: 'PROFESSOR', full_name: 'Test Faculty One' })
const f2 = await user('faculty2@test.local', { role: 'PROFESSOR', full_name: 'Test Faculty Two' })
const adv = await user('advisor@test.local', { role: 'PROFESSOR', full_name: 'Test Advisor', advisor_section: 'III CSE-A' })
const students = []
for (let i = 1; i <= 12; i++) {
  students.push(await user(`student${i}@test.local`, {
    role: 'STUDENT', full_name: `Test Student ${String(i).padStart(2, '0')}`, section: 'III CSE-A', batch_year: 2028,
    register_number: `3111241040${String(i).padStart(2, '0')}`, roll_number: `24CS${String(i).padStart(3, '0')}`,
    lab_batch: i <= 6 ? 1 : 2, vertical: i % 2 ? 'AIML' : 'FSD',
  }))
}

// current term with periods and a calendar around today
await db.from('academic_terms').update({ is_current: false }).neq('academic_year', 'x')
const year = today.getUTCMonth() >= 5 ? today.getUTCFullYear() : today.getUTCFullYear() - 1
const termRow = must(await db.from('academic_terms').upsert({ academic_year: `${year}-${year + 1}`, parity: today.getUTCMonth() >= 5 ? 'ODD' : 'EVEN', label: 'Local Test Term', starts_on: iso(new Date(today.getTime() - 40 * 864e5)), ends_on: iso(new Date(today.getTime() + 60 * 864e5)), is_current: true }, { onConflict: 'academic_year,parity' }).select().single(), 'term')
const T = termRow.id
await db.from('period_slots').delete().eq('term_id', T)
must(await db.from('period_slots').insert([['08:00', '09:00'], ['09:00', '09:50'], ['10:10', '11:00'], ['11:00', '11:50'], ['11:50', '12:40'], ['13:30', '14:20'], ['14:20', '15:10'], ['15:10', '16:00']].map(([a, b], i) => ({ term_id: T, period_no: i + 1, starts_at: a, ends_at: b }))), 'periods')
const days = []
for (let k = -40; k <= 60; k++) {
  const d = new Date(today.getTime() + k * 864e5), wd = d.getUTCDay() || 7
  for (const scope of ['FY', 'HS', 'IV']) days.push({ date: iso(d), scope, term_id: T, is_working: wd <= 5, day_order: wd <= 5 ? wd : null, label: wd > 5 ? 'Weekend' : null })
}
must(await db.from('calendar_days').upsert(days, { onConflict: 'date,scope' }), 'calendar')

// courses and timetable for III CSE-A (+ a combined vertical course)
await db.from('timetable_entries').delete().eq('term_id', T)
await db.from('subjects').delete().eq('term_id', T)
const subj = must(await db.from('subjects').insert([
  { code: 'CS24501', name: 'Theory of Computation', short_name: 'TOC', semester: 5, section: 'III CSE-A', term_id: T, cohort_grad_year: 2028, audience: 'ALL', faculty_id: f1, faculty_names: 'Test Faculty One' },
  { code: 'CS24512', name: 'Computer Networks', short_name: 'CN', semester: 5, section: 'III CSE-A', term_id: T, cohort_grad_year: 2028, audience: 'ALL', faculty_id: f2, faculty_names: 'Test Faculty Two' },
  { code: 'CS24511', name: 'Artificial Intelligence and Machine Learning', short_name: 'AI&ML', semester: 5, section: 'III CSE-A', term_id: T, cohort_grad_year: 2028, audience: 'ALL', faculty_id: f1, faculty_names: 'Test Faculty One' },
  { code: 'PCS2444', name: 'Reinforcement Learning', short_name: 'RL', semester: 5, section: null, term_id: T, cohort_grad_year: 2028, audience: 'VERTICAL', audience_value: 'AIML', faculty_id: f2, faculty_names: 'Test Faculty Two' },
  { code: 'PCS2416', name: 'Principles of Programming Languages', short_name: 'POPL', semester: 5, section: null, term_id: T, cohort_grad_year: 2028, audience: 'VERTICAL', audience_value: 'FSD', faculty_id: f1, faculty_names: 'Test Faculty One' },
]).select(), 'subjects')
const S = Object.fromEntries(subj.map(s => [s.short_name, s.id]))
must(await db.from('subject_faculty').insert(subj.map(s => ({ subject_id: s.id, faculty_id: s.faculty_id, role: 'MAIN' }))), 'subject_faculty')
const tt = []
for (let d = 1; d <= 5; d++) {
  tt.push({ day_order: d, period_no: 1, subject_id: S['TOC'], faculty_ids: [f1] })
  tt.push({ day_order: d, period_no: 2, subject_id: S['CN'], faculty_ids: [f2] })
  tt.push({ day_order: d, period_no: 3, subject_id: S['RL'], audience: 'VERTICAL', audience_value: 'AIML', faculty_ids: [f2] })
  tt.push({ day_order: d, period_no: 3, subject_id: S['POPL'], audience: 'VERTICAL', audience_value: 'FSD', faculty_ids: [f1] })
  tt.push({ day_order: d, period_no: 4, subject_id: S['AI&ML'], audience: 'BATCH', audience_value: '1', label: 'AI&ML Lab', faculty_ids: [f1] })
  tt.push({ day_order: d, period_no: 4, subject_id: S['CN'], audience: 'BATCH', audience_value: '2', label: 'CN Lab', faculty_ids: [f2] })
  tt.push({ day_order: d, period_no: 5, subject_id: S['AI&ML'], audience: 'BATCH', audience_value: '1', label: 'AI&ML Lab', faculty_ids: [f1] })
  tt.push({ day_order: d, period_no: 5, subject_id: S['CN'], audience: 'BATCH', audience_value: '2', label: 'CN Lab', faculty_ids: [f2] })
  tt.push({ day_order: d, period_no: 8, label: 'Mentoring', takes_attendance: false })
}
must(await db.from('timetable_entries').insert(tt.map(e => ({ term_id: T, section: 'III CSE-A', audience: 'ALL', audience_value: null, label: null, subject_id: null, takes_attendance: true, faculty_ids: [], ...e }))), 'timetable')

// three weeks of past attendance (some absences) so registers and insights have data
await db.from('attendance_sessions').delete().eq('term_id', T)
const sessions = []
for (let k = 21; k >= 1; k--) {
  const d = new Date(today.getTime() - k * 864e5), wd = d.getUTCDay() || 7
  if (wd > 5) continue
  for (const [p, code, by] of [[1, 'TOC', f1], [2, 'CN', f2]]) {
    const absent = students.filter((_, i) => (i + k + p) % 9 === 0 || (i === 11 && k % 2 === 0))
    sessions.push({ term_id: T, date: iso(d), period_no: p, section: 'III CSE-A', cohort_grad_year: 2028, subject_id: S[code], roster: students, absent, mode: 'IMPORT', status: 'SUBMITTED', taken_by: by, submitted_at: d.toISOString(), lock_at: d.toISOString() })
  }
}
must(await db.from('attendance_sessions').insert(sessions), 'sessions')
console.log(`Seeded: term ${termRow.label}, ${students.length} students, ${tt.length} timetable cells, ${sessions.length} past hours. Password for every test account: ${PASSWORD}`)
