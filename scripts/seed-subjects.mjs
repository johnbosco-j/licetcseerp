import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const DEPT = '00000000-0000-0000-0000-000000000001'
const AY = '2025-2026'

// Template: build per-section subjects from master list
const SEM1 = [
  { code:'MA24101', name:'Calculus for Engineers',                   credits:4 },
  { code:'BE24101', name:'Basic Electrical and Electronics Engg',    credits:3 },
  { code:'CY24101', name:'Applied Chemistry',                        credits:3 },
  { code:'HS24101', name:'English for Professional Communication',   credits:3 },
  { code:'GE24101', name:'Heritage of Tamils',                       credits:1 },
  { code:'GE24112', name:'Problem Solving using Python',             credits:4 },
  { code:'CY24121', name:'Engineering Chemistry Laboratory',         credits:1 },
  { code:'GE24121', name:'Engineering Practices Lab – Civil & Mech', credits:1 },
  { code:'FC24101', name:'Life Skills',                              credits:1 },
]
const SEM2 = [
  { code:'MA24201', name:'Probability and Queueing Theory',          credits:4 },
  { code:'CS24201', name:'Programming in C',                         credits:3 },
  { code:'PH24201', name:'Physics for Information Science',          credits:3 },
  { code:'GE24201', name:'Tamils and Technology',                    credits:1 },
  { code:'GE24111', name:'Engineering Graphics',                     credits:4 },
  { code:'CS24221', name:'C Programming Laboratory',                 credits:2 },
  { code:'GE24122', name:'Engineering Practices Lab – Elec & Elec', credits:1 },
  { code:'PH24121', name:'Physics Laboratory',                       credits:1 },
  { code:'GE24123', name:'Design Thinking',                          credits:1 },
  { code:'FC24102', name:'Cultural Identities and Globalisation',    credits:0 },
]
const SEM3 = [
  { code:'MA24301', name:'Discrete Mathematics',                     credits:4 },
  { code:'BS24301', name:'Environmental Science and Sustainability', credits:3 },
  { code:'CS24301', name:'Data Structures',                          credits:3 },
  { code:'CS24302', name:'Database Management Systems',              credits:3 },
  { code:'CS24311', name:'Digital Principles and Computer Org',      credits:4 },
  { code:'CS24312', name:'Object Oriented Programming in Java',      credits:4 },
  { code:'CS24321', name:'Data Structures Laboratory',               credits:1.5 },
  { code:'CS24322', name:'DBMS Laboratory',                          credits:1.5 },
  { code:'FC24301', name:'Soft Skills',                              credits:1 },
  { code:'BS24321', name:'System Discovery and Analysis',            credits:0 },
]
const SEM4 = [
  { code:'MA24401', name:'Linear Algebra and Number Theory',         credits:4 },
  { code:'CS24401', name:'Operating Systems',                        credits:3 },
  { code:'CS24402', name:'Microprocessors and Microcontrollers',     credits:3 },
  { code:'CS24411', name:'Design and Analysis of Algorithms',        credits:4 },
  { code:'CS24412', name:'Object Oriented Software Engineering',     credits:4 },
  { code:'CS24413', name:'Foundations of Data Science',              credits:3 },
  { code:'CS24421', name:'Operating Systems Laboratory',             credits:1.5 },
  { code:'CS24422', name:'Microprocessors and Microcontrollers Lab', credits:1.5 },
  { code:'HS24321', name:'Communication Skills Building Lab',        credits:1 },
  { code:'CS24423', name:'Project Driven Learning',                  credits:1 },
]
const SEM5 = [
  { code:'CS24501', name:'Theory of Computation',                    credits:3 },
  { code:'GE24501', name:'Project Management and Operations Mgmt',   credits:2 },
  { code:'CS24511', name:'Artificial Intelligence and ML',           credits:4 },
  { code:'CS24512', name:'Computer Networks',                        credits:4 },
  { code:'PE-I',    name:'Professional Elective I',                  credits:3 },
  { code:'PE-II',   name:'Professional Elective II',                 credits:3 },
  { code:'FC24501', name:'Universal Human Values and Service Learning', credits:1 },
  { code:'BS24502', name:'Logical Reasoning and Aptitude Training',  credits:1 },
  { code:'GE24503', name:'Financial Literacy',                       credits:0 },
]
const SEM6 = [
  { code:'CS24601', name:'Compiler Design',                          credits:4 },
  { code:'GE24502', name:'Entrepreneurship and Intl Business Market',credits:2 },
  { code:'CS24611', name:'Distributed and Cloud Computing',          credits:4 },
  { code:'CS24612', name:'Embedded Systems and IoT',                 credits:4 },
  { code:'CS24613', name:'Internet Programming',                     credits:4 },
  { code:'PE-III',  name:'Professional Elective III',                credits:3 },
  { code:'PE-IV',   name:'Professional Elective IV',                 credits:3 },
  { code:'GE24621', name:'Interdisciplinary Project',                credits:1 },
  { code:'GE24622', name:'Problem Solving Techniques',               credits:1 },
]
const SEM7 = [
  { code:'OE-I',    name:'Open Elective I',                          credits:3 },
  { code:'OE-II',   name:'Open Elective II',                         credits:3 },
  { code:'GE24701', name:'Working to Engineer a Better World',       credits:2 },
  { code:'CS24711', name:'Cryptography and Cyber Security',          credits:4 },
  { code:'PE-V',    name:'Professional Elective V',                  credits:3 },
  { code:'PE-VI',   name:'Professional Elective VI',                 credits:3 },
  { code:'CS24721', name:'Professional Project I',                   credits:2 },
  { code:'CS24722', name:'Internship',                               credits:2 },
]
const SEM8 = [
  { code:'CS24821', name:'Professional Project II',                  credits:10 },
]

// Map section → which semesters apply
// I year: sem1, sem2 | II year: sem3, sem4 | III year: sem5, sem6 (+ sem7, sem8 kept for records)
const SECTION_SEMS = {
  'I CSE-A':   [{ sem:1, list:SEM1 }, { sem:2, list:SEM2 }],
  'I CSE-B':   [{ sem:1, list:SEM1 }, { sem:2, list:SEM2 }],
  'II CSE-A':  [{ sem:3, list:SEM3 }, { sem:4, list:SEM4 }],
  'II CSE-B':  [{ sem:3, list:SEM3 }, { sem:4, list:SEM4 }],
  'III CSE-A': [{ sem:5, list:SEM5 }, { sem:6, list:SEM6 }, { sem:7, list:SEM7 }, { sem:8, list:SEM8 }],
  'III CSE-B': [{ sem:5, list:SEM5 }, { sem:6, list:SEM6 }, { sem:7, list:SEM7 }, { sem:8, list:SEM8 }],
}

async function seed() {
  // Clear existing
  const { error: delErr } = await supabase.from('subjects').delete().eq('department_id', DEPT)
  if (delErr) { console.log('Clear error:', delErr.message); return }
  console.log('✓ Cleared old subjects')

  let ok = 0, fail = 0
  for (const [section, sems] of Object.entries(SECTION_SEMS)) {
    for (const { sem, list } of sems) {
      for (const s of list) {
        const { error } = await supabase.from('subjects').insert({
          code: s.code,
          name: s.name,
          semester: sem,
          section,
          credits: s.credits,
          department_id: DEPT,
          academic_year: AY
        })
        if (error) {
          console.log(`✗ [${section} Sem${sem}] ${s.code}: ${error.message}`)
          fail++
        } else {
          console.log(`✓ [${section} Sem${sem}] ${s.code} – ${s.name} (${s.credits}cr)`)
          ok++
        }
      }
    }
  }

  console.log(`\nDone! ✓ ${ok} subjects seeded, ✗ ${fail} failed`)

  // Verify count
  const { data } = await supabase.from('subjects').select('count')
  console.log('Total in DB:', data)
}

seed().catch(console.error)
