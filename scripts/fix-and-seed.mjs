import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const STAFF_MAP = {
  'hodcse@licet.ac.in':           { name: 'Dr. Sharmila VJ',         role: 'HOD',       empId: 'FAC001' },
  'reme@licet.ac.in':             { name: 'Dr. Remegius Praveen L',   role: 'PROFESSOR', empId: 'FAC002' },
  'arulmozhi.p@licet.ac.in':      { name: 'Dr. Arulmozhi P',          role: 'PROFESSOR', empId: 'FAC003' },
  'drgk81@licet.ac.in':           { name: 'Dr. Gopalakrishnan K',     role: 'PROFESSOR', empId: 'FAC004' },
  'sharmila.vj@licet.ac.in':      { name: 'Dr. Sharmila VJ Member',   role: 'PROFESSOR', empId: 'FAC005' },
  'jainish.gr@licet.ac.in':       { name: 'Dr. Jainish GR',           role: 'PROFESSOR', empId: 'FAC006' },
  'delphy.p@licet.ac.in':         { name: 'Ms. Delphy P',             role: 'PROFESSOR', empId: 'FAC007' },
  'freesiegreta.l@licet.ac.in':   { name: 'Ms. Freesie Greta L',      role: 'PROFESSOR', empId: 'FAC008' },
  'jeevitha.a@licet.ac.in':       { name: 'Ms. Jeevitha A',           role: 'PROFESSOR', empId: 'FAC009' },
  'sathiapriya.r@licet.ac.in':    { name: 'Ms. Sathia Priya R',       role: 'PROFESSOR', empId: 'FAC010' },
  'dayamarymathew@licet.ac.in':   { name: 'Ms. Daya Mary Mathew',     role: 'PROFESSOR', empId: 'FAC011' },
  'accelia.s@licet.ac.in':        { name: 'Ms. Accelia S',            role: 'PROFESSOR', empId: 'FAC012' },
  'priya.a@licet.ac.in':          { name: 'Ms. Priya A',              role: 'PROFESSOR', empId: 'FAC013' },
  'reshma.m@licet.ac.in':         { name: 'Ms. Reshma M',             role: 'PROFESSOR', empId: 'FAC014' },
  'shirlysudhakaran@licet.ac.in': { name: 'Ms. Shirly Sudhakaran',    role: 'PROFESSOR', empId: 'FAC015' },
  'limsajoshi@licet.ac.in':       { name: 'Ms. Limsa Joshi',          role: 'PROFESSOR', empId: 'FAC016' },
  'iqac@licet.ac.in':             { name: 'Ms. Nirmala Santiago',     role: 'PROFESSOR', empId: 'FAC017' },
}

async function getAllUsers() {
  let allUsers = []
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) break
    allUsers = allUsers.concat(data.users)
    if (data.users.length < 1000) break
    page++
  }
  return allUsers
}

async function main() {
  // Insert department
  const { error: deptError } = await supabase.from('departments').upsert({
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Computer Science & Engineering',
    code: 'CSE'
  })
  if (deptError) console.log('Dept error:', deptError.message)
  else console.log('✓ Department ready')

  const users = await getAllUsers()
  console.log(`Found ${users.length} total auth users`)

  // Get existing profile IDs
  const { data: existingProfiles } = await supabase.from('profiles').select('id')
  const existingIds = new Set(existingProfiles?.map(p => p.id) ?? [])
  console.log(`Found ${existingIds.size} existing profiles`)

  let created = 0
  let skipped = 0

  for (const user of users) {
    const email = user.email
    if (!email) continue
    if (existingIds.has(user.id)) { skipped++; continue }

    if (STAFF_MAP[email]) {
      const s = STAFF_MAP[email]
      const { error } = await supabase.from('profiles').upsert({
        id: user.id, role: s.role,
        department_id: '00000000-0000-0000-0000-000000000001',
        full_name: s.name, email, employee_id: s.empId, is_active: true
      })
      if (error) console.log(`✗ Staff ${email}:`, error.message)
      else { console.log(`✓ Staff: ${s.name}`); created++ }
    } else {
      const section = email.includes('29csa') ? 'I CSE-A'
        : email.includes('29csb') ? 'I CSE-B'
        : email.includes('28csa') ? 'II CSE-A'
        : email.includes('28csb') ? 'II CSE-B'
        : email.includes('27csa') ? 'III CSE-A'
        : email.includes('27csb') ? 'III CSE-B' : 'UNKNOWN'
      const year = email.includes('29') ? 1 : email.includes('28') ? 2 : 3
      const name = user.user_metadata?.full_name ?? email.split('@')[0]

      const { error } = await supabase.from('profiles').upsert({
        id: user.id, role: 'STUDENT',
        department_id: '00000000-0000-0000-0000-000000000001',
        full_name: name, email, section, batch_year: year, is_active: true
      })
      if (error) console.log(`✗ Student ${email}:`, error.message)
      else { console.log(`✓ Student: ${email}`); created++ }
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped (already existed): ${skipped}`)
}

main().catch(console.error)
