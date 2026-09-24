import { supabase } from './admin-client.mjs'
const { data: count } = await supabase.from('subjects').select('count')
console.log('Total subjects:', count)

const { data: sample, error } = await supabase.from('subjects').select('id,code,name,section,semester').limit(5)
console.log('Error:', error?.message)
console.log('Sample:', JSON.stringify(sample, null, 2))
