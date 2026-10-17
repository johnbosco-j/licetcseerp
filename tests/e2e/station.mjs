// Attendance Station: teacher sign-in, QR tickets, PIN, one check-in per ticket, head count,
// cross-site refusal and the optional projector code. Needs the station running on STATION_PORT.
import { admin, signIn, check, post, today, STATION, PW } from './lib.mjs'

const subj = async code => (await admin.from('subjects').select('id').eq('short_name', code).single()).data.id
// fresh hours for today (a re-run must not find them already submitted)
await admin.from('attendance_sessions').delete().eq('date', today()).in('period_no', [1, 2]).eq('section', 'III CSE-A')
await admin.from('app_settings').update({ value: false }).eq('key', 'attendance.projector_code')

async function scenario({ teacher, student, reg, course, period, code }) {
  const fac = await signIn(teacher), stu = await signIn(student)
  await stu.rpc('att_set_pin', { p_pin: '2468' })
  const { data: me } = await admin.from('profiles').select('id').eq('email', student).single()
  await admin.from('attendance_devices').delete().eq('student_id', me.id)   // start from an unregistered phone
  const { data: s, error } = await fac.rpc('att_open', { p_date: today(), p_period: period, p_section: 'III CSE-A', p_subject: await subj(course), p_label: null, p_audience: 'ALL', p_value: null, p_group: null, p_entry: null })
  if (error) throw error
  const so = await fac.rpc('att_self_open', { p_session: s.id, p_minutes: 10 })
  check(!so.error, `${course}: teacher opens self check-in`, so.error?.message)
  check((await post('/api/start', { ids: [s.id] }, { origin: 'https://evil.example' })).status === 403, `${course}: console refuses another website`)
  const login = await post('/api/login', { email: teacher, password: PW })
  check(login.status === 200, `${course}: teacher signs in on the station`, JSON.stringify(login.body))
  await post('/api/start', { ids: [s.id], title: course })
  const st = await fetch(STATION + '/api/status').then(r => r.json())
  check(!!st.qr && (code ? /^\d{2}$/.test(st.code ?? '') : !st.code), `${course}: QR shown${code ? ' with a 2-digit code' : ''}`)
  check((await post('/api/ticket', { nonce: 'fake' })).status === 410, `${course}: fake QR refused`)
  const t = await post('/api/ticket', { nonce: new URL(st.link).searchParams.get('n') })
  check(t.status === 200 && !!t.body.ticket, `${course}: fresh QR gives a ticket`)
  const base = { ticket: t.body.ticket, reg, device: 'e2e-' + reg }
  check((await post('/api/checkin', { ...base, pin: '1111', code: st.code })).status === 403, `${course}: wrong PIN refused`)
  if (code) check((await post('/api/checkin', { ...base, pin: '2468' })).status === 400, `${course}: missing projector code refused`)
  const ok = await post('/api/checkin', { ...base, pin: '2468', code: st.code })
  check(ok.status === 200 && ok.body.ok, `${course}: right PIN checks the student in`, JSON.stringify(ok.body))
  check((await post('/api/checkin', { ...base, reg: '311124104010', pin: '2468', code: st.code })).status === 410, `${course}: one check-in per ticket`)
  const { data: after } = await fac.from('attendance_sessions').select('roster, absent').eq('id', s.id).single()
  check(after.roster.length - after.absent.length === 1, `${course}: database shows the student present`)
  const noCount = await fac.rpc('att_save', { p_session: s.id, p_absent: after.absent, p_topic: null, p_submit: true })
  check(!!noCount.error, `${course}: submit without a head count refused`)
  const sub = await fac.rpc('att_save', { p_session: s.id, p_absent: after.absent, p_topic: 'e2e', p_submit: true, p_headcount: 1 })
  check(!sub.error, `${course}: submit with the head count works`, sub.error?.message)
  await post('/api/logout', {})
}

console.log('station.mjs')
await scenario({ teacher: 'faculty1@test.local', student: 'student1@test.local', reg: '311124104001', course: 'TOC', period: 1, code: false })
await admin.from('app_settings').update({ value: true }).eq('key', 'attendance.projector_code')
await scenario({ teacher: 'faculty2@test.local', student: 'student2@test.local', reg: '311124104002', course: 'CN', period: 2, code: true })
await admin.from('app_settings').update({ value: false }).eq('key', 'attendance.projector_code')
