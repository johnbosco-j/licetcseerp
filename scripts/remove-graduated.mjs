// Remove graduated students: their login accounts, profiles and linked records
// (attendance, marks, promotion history… via ON DELETE CASCADE).
// A JSON backup of everything removed is written to scripts/backups/ first.
//
//   node scripts/remove-graduated.mjs          # preview
//   node scripts/remove-graduated.mjs --apply  # back up, then delete

import { mkdirSync, writeFileSync } from 'node:fs'
import { supabase } from './admin-client.mjs'

const apply = process.argv.includes('--apply')

const { data: grads, error } = await supabase.from('profiles').select('*').eq('role', 'STUDENT').eq('section', 'GRADUATED')
if (error) { console.error(error.message); process.exit(1) }
const ids = grads.map(g => g.id)
console.log(`Graduated students: ${grads.length}`)
if (!grads.length) process.exit(0)

const related = {}
for (const [table, col] of [
  ['attendance', 'student_id'], ['marks', 'student_id'], ['day_attendance', 'student_id'],
  ['attendance_alerts', 'student_id'], ['leaves', 'applicant_id'], ['grievances', 'student_id'],
  ['student_promotion_history', 'student_id'], ['student_risk_scores', 'student_id'], ['announcements', 'created_by'],
]) {
  const rows = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e } = await supabase.from(table).select('*').in(col, ids.slice(i, i + 100))
    if (e) { console.error(`${table}: ${e.message}`); process.exit(1) }
    rows.push(...data)
  }
  related[table] = rows
  console.log(`  ${table.padEnd(26)} ${rows.length}`)
}

if (!apply) { console.log('\nPreview only. Re-run with --apply to back up and delete.'); process.exit(0) }

mkdirSync('scripts/backups', { recursive: true })
const file = `scripts/backups/graduated-removed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(file, JSON.stringify({ removedAt: new Date().toISOString(), profiles: grads, related }, null, 2), { mode: 0o600 })
console.log(`\nBackup written to ${file}`)

let ok = 0
for (const g of grads) {
  const { error: e } = await supabase.auth.admin.deleteUser(g.id)
  if (e) console.log(`✗ ${g.email}: ${e.message}`); else ok++
}
console.log(`✓ Removed ${ok}/${grads.length} graduated students`)
