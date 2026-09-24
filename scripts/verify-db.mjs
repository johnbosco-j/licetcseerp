import { supabase } from './admin-client.mjs'
const tables = ['departments','profiles','subjects','attendance','day_attendance','marks','subject_locks','announcements','leaves','grievances','inventory','placements','finance_ledger','student_risk_scores','attendance_alerts','promotion_log','student_promotion_history']
for (const t of tables) {
  const { error } = await supabase.from(t).select('count').limit(1)
  console.log(`${error ? '✗' : '✓'} ${t} ${error ? '— '+error.message : ''}`)
}

const { data, error } = await supabase.from('attendance').select('marked_via').limit(1)
console.log(`${error ? '✗ marked_via column missing — '+error.message : '✓ marked_via column exists'}`)

const { count: attCount } = await supabase.from('attendance').select('*', { count: 'exact', head: true })
const { count: stuCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role','STUDENT')
console.log(`\n✓ ${stuCount} students in DB`)
console.log(`✓ ${attCount} attendance records`)
