import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const { data: count } = await supabase.from('subjects').select('count')
console.log('Total subjects:', count)

const { data: sample, error } = await supabase.from('subjects').select('id,code,name,section,semester').limit(5)
console.log('Error:', error?.message)
console.log('Sample:', JSON.stringify(sample, null, 2))
