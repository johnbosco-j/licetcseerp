import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const tables = ['day_attendance','promotion_log','student_promotion_history']
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
