import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const DEPT = '00000000-0000-0000-0000-000000000001'
const AY = '2025-2026'

const FAILED = [
  { code:'CS24321', name:'Data Structures Laboratory',               credits:1.5, sem:3, sections:['II CSE-A','II CSE-B'] },
  { code:'CS24322', name:'DBMS Laboratory',                          credits:1.5, sem:3, sections:['II CSE-A','II CSE-B'] },
  { code:'CS24421', name:'Operating Systems Laboratory',             credits:1.5, sem:4, sections:['II CSE-A','II CSE-B'] },
  { code:'CS24422', name:'Microprocessors and Microcontrollers Lab', credits:1.5, sem:4, sections:['II CSE-A','II CSE-B'] },
]

async function fix() {
  let ok = 0
  for (const s of FAILED) {
    for (const section of s.sections) {
      const { error } = await supabase.from('subjects').insert({
        code: s.code, name: s.name, semester: s.sem,
        section, credits: s.credits,
        department_id: DEPT, academic_year: AY
      })
      if (error) console.log(`✗ [${section}] ${s.code}: ${error.message}`)
      else { console.log(`✓ [${section} Sem${s.sem}] ${s.code} – ${s.name} (${s.credits}cr)`); ok++ }
    }
  }
  console.log(`\nFixed ${ok}/8 subjects`)
  const { data } = await supabase.from('subjects').select('count')
  console.log('Total subjects in DB:', data?.[0]?.count)
}

fix().catch(console.error)
