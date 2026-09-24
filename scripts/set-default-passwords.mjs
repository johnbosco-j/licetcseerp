// Set students' passwords to the default pattern: email local part without dots + "@licet"
// (lithika.30csb@licet.ac.in → lithika30csb@licet).
//
//   node scripts/set-default-passwords.mjs "I CSE-A" "I CSE-B"          # preview
//   node scripts/set-default-passwords.mjs "I CSE-A" "I CSE-B" --apply  # apply

import { supabase } from './admin-client.mjs'

const apply = process.argv.includes('--apply')
const sections = process.argv.slice(2).filter(a => a !== '--apply')
if (!sections.length) { console.error('Give one or more sections, e.g. "I CSE-A"'); process.exit(1) }

const { data: students, error } = await supabase.from('profiles')
  .select('id, email, section').eq('role', 'STUDENT').in('section', sections).like('email', '%@licet.ac.in')
if (error) { console.error(error.message); process.exit(1) }

const pw = email => email.split('@')[0].replace(/\./g, '') + '@licet'
console.log(`${students.length} college-email students in ${sections.join(', ')}; e.g. ${students[0]?.email} → ${students[0] && pw(students[0].email)}`)
if (!apply) { console.log('Preview only. Re-run with --apply.'); process.exit(0) }

let ok = 0
for (const s of students) {
  const { error: e } = await supabase.auth.admin.updateUserById(s.id, { password: pw(s.email) })
  if (e) console.log(`✗ ${s.email}: ${e.message}`); else ok++
}
console.log(`✓ Updated ${ok}/${students.length}`)
