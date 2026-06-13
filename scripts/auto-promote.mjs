import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

// Section → next section mapping
const PROMOTION_MAP = {
  'I CSE-A':   'II CSE-A',
  'I CSE-B':   'II CSE-B',
  'II CSE-A':  'III CSE-A',
  'II CSE-B':  'III CSE-B',
  'III CSE-A': 'IV CSE-A',
  'III CSE-B': 'IV CSE-B',
  'IV CSE-A':  'GRADUATED',
  'IV CSE-B':  'GRADUATED',
}

// Year → next year
const YEAR_MAP = { 1: 2, 2: 3, 3: 4, 4: null }

// Semester map per promotion type
// July: odd semesters start (1,3,5,7)
// December: even semesters start (2,4,6,8)
const SECTION_CURRENT_SEM = (section) => {
  if (section.startsWith('IV'))  return 8
  if (section.startsWith('III')) return 6
  if (section.startsWith('II'))  return 4
  return 2
}

async function runPromotion(dryRun = true) {
  console.log(`\n=== AUTO PROMOTION ${dryRun ? '(DRY RUN)' : '(LIVE)'} ===`)
  console.log(`Date: ${new Date().toISOString()}\n`)

  // Load all student profiles
  const { data: students, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'STUDENT')
    .not('section', 'is', null)

  if (error) { console.error('Error:', error.message); return }
  console.log(`Total students: ${students.length}`)

  const promotions = []
  const graduations = []

  for (const student of students) {
    const currentSection = student.section
    const nextSection = PROMOTION_MAP[currentSection]
    
    if (!nextSection) {
      console.log(`✗ Unknown section: ${currentSection} for ${student.full_name}`)
      continue
    }

    if (nextSection === 'GRADUATED') {
      graduations.push(student)
    } else {
      promotions.push({ student, from: currentSection, to: nextSection })
    }
  }

  console.log(`\nPromotions: ${promotions.length}`)
  console.log(`Graduations: ${graduations.length}`)

  if (!dryRun) {
    // Promote students
    for (const { student, from, to } of promotions) {
      const currentYear = parseInt(from.split(' ')[0] === 'I' ? 1 : from.split(' ')[0] === 'II' ? 2 : from.split(' ')[0] === 'III' ? 3 : 4)
      const nextYear = YEAR_MAP[currentYear] ?? currentYear
      
      const { error } = await supabase.from('profiles').update({
        section: to,
        batch_year: student.batch_year, // keep original batch year
      }).eq('id', student.id)

      if (error) console.log(`✗ Failed ${student.full_name}: ${error.message}`)
      else console.log(`✓ ${student.full_name}: ${from} → ${to}`)
    }

    // Graduate students — mark section as GRADUATED
    for (const student of graduations) {
      const { error } = await supabase.from('profiles').update({
        section: 'GRADUATED',
        is_active: false
      }).eq('id', student.id)

      if (error) console.log(`✗ Failed graduation ${student.full_name}: ${error.message}`)
      else console.log(`🎓 GRADUATED: ${student.full_name}`)
    }

    // Update subjects for new academic year
    console.log('\n=== Updating subject sections ===')
    const AY = new Date().getMonth() >= 6 ? 
      `${new Date().getFullYear()}-${new Date().getFullYear()+1}` :
      `${new Date().getFullYear()-1}-${new Date().getFullYear()}`
    
    // Seed new semester subjects for promoted sections
    const SEM_MAP = {
      'I CSE-A': 1, 'I CSE-B': 1,
      'II CSE-A': 3, 'II CSE-B': 3,
      'III CSE-A': 5, 'III CSE-B': 5,
      'IV CSE-A': 7, 'IV CSE-B': 7,
    }
    
    console.log(`New academic year: ${AY}`)
    console.log('Subjects will need re-seeding for new sections')
  }

  // Summary
  console.log('\n=== PROMOTION SUMMARY ===')
  for (const { student, from, to } of promotions.slice(0, 5)) {
    console.log(`  ${student.full_name}: ${from} → ${to}`)
  }
  if (promotions.length > 5) console.log(`  ... and ${promotions.length - 5} more`)
  console.log(`\n  🎓 Graduating: ${graduations.length} students`)
  console.log(`  ${dryRun ? 'DRY RUN COMPLETE — run with --live to apply' : 'PROMOTION COMPLETE'}`)
}

const isLive = process.argv.includes('--live')
runPromotion(!isLive).catch(console.error)
