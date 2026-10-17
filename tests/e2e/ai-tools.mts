// AI assistant tools as a student and a teacher: own data only, staff tools hidden from students.
console.log('ai-tools.mts')
import { createClient } from '@supabase/supabase-js'
import { toolsFor, runTool, type Asker } from '../../src/lib/ai/tools'
const URL_ = process.env.API_URL!, ANON = process.env.ANON_KEY!
async function as(email: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: 'LocalTest#2026' })
  const { data: p } = await c.from('profiles').select('*').eq('id', data.user!.id).single()
  const me: Asker = { id: p.id, role: p.role, tier1: p.role === 'HOD', full_name: p.full_name, section: p.section, advisor_section: p.advisor_section }
  return { c, me }
}
const ok = (c: boolean, m: string, i = '') => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}${c ? '' : '  — ' + i}`)
const s = await as('student12@test.local')
ok(toolsFor(s.me).every(t => !['students_below', 'find_student', 'faculty_load'].includes(t.name)), 'a student has no staff tools')
const att = JSON.parse(String(await runTool(s.c, s.me, 'my_attendance', {})))
ok(att.total_hours > 0 && att.percent !== null, 'student: own attendance', JSON.stringify(att).slice(0, 120))
ok(String(await runTool(s.c, s.me, 'students_below', {})).includes('Not available'), 'student cannot call a staff tool by name')
const tt = String(await runTool(s.c, s.me, 'timetable', { section: 'II CSE-A' }))
ok(tt.includes('III CSE-A'), 'a student always gets their own class timetable', tt.slice(0, 100))
const f = await as('faculty1@test.local')
const below = JSON.parse(String(await runTool(f.c, f.me, 'students_below', { threshold: 75 })))
ok(Array.isArray(below) && below.some((r: { full_name: string }) => r.full_name === 'Test Student 12'), 'staff: students below 75%', JSON.stringify(below).slice(0, 120))
const found = JSON.parse(String(await runTool(f.c, f.me, 'find_student', { query: 'Student 05' })))
ok(found[0]?.attendance, 'staff: find a student with attendance', JSON.stringify(found).slice(0, 120))
ok(!toolsFor(f.me).some(t => t.name === 'faculty_load'), 'faculty have no HOD-only tool')
ok(String(await runTool(f.c, f.me, 'how_to', { topic: 'hand over' })).includes('Hand over my class'), 'how-to answers from the user guide')
