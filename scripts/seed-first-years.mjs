// Create login accounts + profiles for a first-year batch.
//
//   node scripts/seed-first-years.mjs scripts/data/first-years-2026-27.json          # preview
//   node scripts/seed-first-years.mjs scripts/data/first-years-2026-27.json --apply  # create accounts
//
// Initial password: email local part without dots + "@licet"
// (lithika.30csb@licet.ac.in → lithika30csb@licet).

import { readFileSync } from 'node:fs'
import { supabase } from './admin-client.mjs'

const DEPT_ID = '00000000-0000-0000-0000-000000000001'
const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file) { console.error('Usage: node scripts/seed-first-years.mjs <students.json> [--apply]'); process.exit(1) }

const students = JSON.parse(readFileSync(file, 'utf8'))
const { data: existing, error } = await supabase.from('profiles').select('email').in('email', students.map(s => s.email))
if (error) { console.error(error.message); process.exit(1) }
const have = new Set(existing.map(p => p.email))
const todo = students.filter(s => !have.has(s.email))

console.log(`${students.length} in file · ${have.size} already exist · ${todo.length} to create`)
for (const sec of [...new Set(todo.map(s => s.section))].sort()) {
  console.log(`  ${sec}: ${todo.filter(s => s.section === sec).length}`)
}
if (!apply) { console.log('\nPreview only. Re-run with --apply to create the accounts.'); process.exit(0) }

const created = []
for (const s of todo) {
  const password = s.email.split('@')[0].replace(/\./g, '') + '@licet'
  const { data, error: authErr } = await supabase.auth.admin.createUser({ email: s.email, password, email_confirm: true })
  if (authErr || !data.user) { console.log(`✗ ${s.email}: ${authErr?.message}`); continue }
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: data.user.id, role: 'STUDENT', department_id: DEPT_ID,
    full_name: s.name, email: s.email, section: s.section, batch_year: 1, is_active: true,
  })
  if (profErr) {
    await supabase.auth.admin.deleteUser(data.user.id)
    console.log(`✗ ${s.email}: ${profErr.message}`)
    continue
  }
  created.push({ ...s, password })
}

console.log(`\n✓ Created ${created.length}/${todo.length} accounts (initial password: e.g. ${created[0]?.password ?? '-'})`)
