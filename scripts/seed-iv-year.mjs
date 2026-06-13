import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cvazyvdxnjmoenasavvq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2YXp5dmR4bmptb2VuYXNhdnZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5ODU3MywiZXhwIjoyMDg5NDc0NTczfQ.oeQFsIfGewelt77Jy66zy2tALex0EWtNBATMqWA6mZc'
)

const DEPT = '00000000-0000-0000-0000-000000000001'

const IV_CSA = [
  ['ABINAYA B','abinaya.26csa@licet.ac.in'],
  ['ABINITHI PANDIAN R','abinithipandian.26csa@licet.ac.in'],
  ['ABISHEK JADENVETHANAYAGAM','abishekjadenvethanayagam.26csa@licet.ac.in'],
  ['ABISHEK JOSHUA C','abishekjoshua.26csa@licet.ac.in'],
  ['ADAIKAL SUSAN BESCHI J I','adaikalsusanbeschi.26csa@licet.ac.in'],
  ['AFSHAAN FATHIMA S K','afshaanfathima.26csa@licet.ac.in'],
  ['AGIL FABIAN ROMANO R','agilfabianromano.26csa@licet.ac.in'],
  ['AGNES A','agnes.26csa@licet.ac.in'],
  ['AJAY KUMAR N','ajaykumar.26csa@licet.ac.in'],
  ['ALFRED REIJO PHILOMIN F','alfredreijophilomin.26csa@licet.ac.in'],
  ['ALTHIYA DIVYANESAM A','althiyadivyanesam.26csa@licet.ac.in'],
  ['ALVINA PHILOMIN S','alvinaphilomin.26csa@licet.ac.in'],
  ['ANJANATHRI S','anjanathri.26csa@licet.ac.in'],
  ['ANTO AROCKIA INFANT F','antoarockiainfant.26csa@licet.ac.in'],
  ['ANTO CRUZ SAFFIN S','antocruzsaffin.26csa@licet.ac.in'],
  ['ANTONY KRISTEN NIKHIL','antonykristennikhil.26csa@licet.ac.in'],
  ['ANUJA FERNANDO','anujafernando.26csa@licet.ac.in'],
  ['ARSHIYA FATHIMA A K','arshiyafathima.26csa@licet.ac.in'],
  ['ARUNRAJ T','arunraj.26csa@licet.ac.in'],
  ['ASHRAF MUZAMMIL J','ashrafmuzammil.26csa@licet.ac.in'],
  ['ASLIN LIJU A','aslinliju.26csa@licet.ac.in'],
  ['ATHIKA A','athika.26csa@licet.ac.in'],
  ['AVILABENIT M','avilabenit.26csa@licet.ac.in'],
  ['BABUVISWA B L','babuviswa.26csa@licet.ac.in'],
  ['BASKAR U','baskar.26csa@licet.ac.in'],
  ['BENITO F A RAYAR','benitofarayar.26csa@licet.ac.in'],
  ['BEULAH MIRACLIN B','beulahmiraclin.26csa@licet.ac.in'],
  ['BLASABARINATHAN S','blasabarinathan.26csa@licet.ac.in'],
  ['DAPHINE FEBI J','daphinefebi.26csa@licet.ac.in'],
  ['DEANNA NANCY E','deannanancy.26csa@licet.ac.in'],
  ['DEEPAK B','deepakb.26csa@licet.ac.in'],
  ['DEEPAK N','deepakn.26csa@licet.ac.in'],
  ['DEEPIKASHREE A S','deepikashree.26csa@licet.ac.in'],
  ['DENNYSON A','dennyson.26csa@licet.ac.in'],
  ['DHANASHREE J','dhanashree.26csa@licet.ac.in'],
  ['DHARSHINI S','dharshinis.26csa@licet.ac.in'],
  ['DHARSHINI S M','dharshinism.26csa@licet.ac.in'],
  ['DINESH KUMAR R','dineshkumar.26csa@licet.ac.in'],
  ['EILEEN PRINSLA P','eileenprinsla.26csa@licet.ac.in'],
  ['EKISHA MARIA W','ekishamaria.26csa@licet.ac.in'],
  ['ELAVENI G','elaveni.26csa@licet.ac.in'],
  ['ELAYA BHARATHI N','elayabharathi.26csa@licet.ac.in'],
  ['EVAN EUCHARIST ROHIT S','evaneucharistrohit.26csa@licet.ac.in'],
  ['EVANGELINE JOHANNA J','evangelinejohanna.26csa@licet.ac.in'],
  ['FATIMA NARSEL MARY A','fatimanarselmary.26csa@licet.ac.in'],
  ['GEETHA J','geetha.26csa@licet.ac.in'],
  ['GIFTINA BLESSY ANBU R','giftinablessyanbu.26csa@licet.ac.in'],
  ['GLADSON JEBAS R V','gladsonjebas.26csa@licet.ac.in'],
  ['GODSON AROCKIA RAJ A','godsonarockiaraj.26csa@licet.ac.in'],
  ['GOKUL SAMI P','gokulsami.26csa@licet.ac.in'],
  ['GOPIKA M','gopika.26csa@licet.ac.in'],
  ['HANNAH SUSAN J','hannahsusan.26csa@licet.ac.in'],
  ['HARIHARAN P','hariharan.26csa@licet.ac.in'],
  ['HELENEMARIYANA H','helenemariyana.26csa@licet.ac.in'],
  ['HERWIN JACOB L','herwinjacob.26csa@licet.ac.in'],
  ['IDHAYA AMALAN A','idhayaamalan.26csa@licet.ac.in'],
  ['IMMANUEL M','immanuel.26csa@licet.ac.in'],
  ['JACOB MARIO LEONARD P','jacobmarioleonard.26csa@licet.ac.in'],
  ['JAMIE THERESA J','jamietheresa.26csa@licet.ac.in'],
  ['JAYANTH K','jayanth.26csa@licet.ac.in'],
  ['JAYANTHI D G','jayanthi.26csa@licet.ac.in'],
  ['JENIFER CHRISTONY J','jeniferchristony.26csa@licet.ac.in'],
  ['JENSEN BENITO A N','jensenbenito.26csa@licet.ac.in'],
  ['JOEL A','joel.26csa@licet.ac.in'],
  ['JOHANA J','johana.26csa@licet.ac.in'],
  ['JOHN ALLAN MIRANDA A','johnallanmiranda.26csa@licet.ac.in'],
]

const IV_CSB = [
  ['JOSETINA TREASLIN S','josetinatreaslin.26csb@licet.ac.in'],
  ['JOVIN J','jovin.26csb@licet.ac.in'],
  ['JUANITA GRACE SINGH','juanitagracesingh.26csb@licet.ac.in'],
  ['KABILAN S','kabilans.26csb@licet.ac.in'],
  ['KABILAN T M','kabilantm.26csb@licet.ac.in'],
  ['KAMESH GUNAL S','kameshgunal.26csb@licet.ac.in'],
  ['LANCEY A','lancey.26csb@licet.ac.in'],
  ['LAUREAN A','laurean.26csb@licet.ac.in'],
  ['LEVON RAJ D','levonraj.26csb@licet.ac.in'],
  ['LISIYA PREETHI S','lisiyapreethi.26csb@licet.ac.in'],
  ['LOGASHREE M','logashree.26csb@licet.ac.in'],
  ['LOKESH S','lokesh.26csb@licet.ac.in'],
  ['LYDIA ANGELINA D','lydiaangelina.26cseb@licet.ac.in'],
  ['MADHAN MOHAN R','madhanmohan.26csb@licet.ac.in'],
  ['MANIMARAN M','manimaran.26csb@licet.ac.in'],
  ['MARIA JOANNA C M','mariajoanna.26csb@licet.ac.in'],
  ['MARIA NILOUFER JENNICA M','marianilouferjennica.26csb@licet.ac.in'],
  ['MARY MARGARET T','marymargaret.26csb@licet.ac.in'],
  ['MEEKA SIMSON S','meekasimson.26csb@licet.ac.in'],
  ['MEGHA MARY VINU','meghamaryvinu.26csb@licet.ac.in'],
  ['MELVIN SALVIUS I','melvinsalvius.26csb@licet.ac.in'],
  ['MERLYN NATASHA MICHELLE','merlynnatashamichelle.26csb@licet.ac.in'],
  ['MITHRA S J','mithra.26csb@licet.ac.in'],
  ['MITHUN SAVIO A','mithunsavio.26csb@licet.ac.in'],
  ['MOHAMMED FAAZ K','mohammedfaaz.26csb@licet.ac.in'],
  ['MOULIESWARI N K','moulieswari.26csb@licet.ac.in'],
  ['NAMITTA EVANGELIN A','namittaevangelin.26csb@licet.ac.in'],
  ['NAVEETH SALMAN A','naveethsalman.26csb@licet.ac.in'],
  ['NAVIN NAZERINE A V','navinnazerine.26csb@licet.ac.in'],
  ['NAZIYA HASEENA A','naziyahaseena.26csb@licet.ac.in'],
  ['NEELAM SARATH S B','neelamsarath.26csb@licet.ac.in'],
  ['NIRMAL S','nirmal.26csb@licet.ac.in'],
  ['NIVIYA T','niviya.26csb@licet.ac.in'],
  ['PEGGY PRISCILLA MARIE J','peggypriscillamarie.26csb@licet.ac.in'],
  ['PEMIN SARA','peminsara.26csb@licet.ac.in'],
  ['PHILANA P C','philana.26csb@licet.ac.in'],
  ['PHILO SANJAY CHAMBERLINE P','philosanjaychamberline.26csb@licet.ac.in'],
  ['PRAVIN EMMANUEL BALASAMPATH','pravinemmanuelbalasampath.26csb@licet.ac.in'],
  ['PREETHA P','preetha.26csb@licet.ac.in'],
  ['PRIYA K','priya.26csb@licet.ac.in'],
  ['PRIYANKA S','priyanka.26csb@licet.ac.in'],
  ['RAKSHNA R','rakshna.26csb@licet.ac.in'],
  ['REBECCA CATHERINE DEVAKIRUBAI','rebeccacatherinedevakirubai.26csb@licet.ac.in'],
  ['RENI JOVITHA R','renijovitha.26csb@licet.ac.in'],
  ['RENSTON L','renston.26csb@licet.ac.in'],
  ['RICHELLE ALBINA C','richellealbina.26csb@licet.ac.in'],
  ['RIHANA FATHIMA A','rihanafathima.26csb@licet.ac.in'],
  ['RITHIK VALERIAN J','rithikvalerian.26csb@licet.ac.in'],
  ['ROHIT RAI A','rohitrai.26csb@licet.ac.in'],
  ['ROSHNI A','roshni.26csb@licet.ac.in'],
  ['SAI ARVIND ARUN','saiarvindarun.26csb@licet.ac.in'],
  ['SAIRAM M R','sairam.26csb@licet.ac.in'],
  ['SAM RICHARD S','samrichard.26csb@licet.ac.in'],
  ['SANJAY G','sanjay.26csb@licet.ac.in'],
  ['SANTHOSH KUMAR K','santhoshkumar.26csb@licet.ac.in'],
  ['SARAVANAN R','saravanan.26csb@licet.ac.in'],
  ['SASIDHARAN A','sasidharan.26csb@licet.ac.in'],
  ['SATHISH E','sathish.26csb@licet.ac.in'],
  ['SIVA BALAN M','sivabalan.26csb@licet.ac.in'],
  ['SNEKA M','sneka.26csb@licet.ac.in'],
  ['SOLAIMUTHU A','solaimuthu.26csb@licet.ac.in'],
  ['STEPHANAS A','stephanas.26csb@licet.ac.in'],
  ['SUMITHRA S','sumithra.26csb@licet.ac.in'],
  ['SURUTHI S','suruthi.26csb@licet.ac.in'],
  ['TAMILARASAN S','tamilarasan.26csb@licet.ac.in'],
  ['VALAN AMAL R M','valanamal.26csb@licet.ac.in'],
  ['VISHAL RAJENDRAN','vishalrajendran.26csb@licet.ac.in'],
]

function getEmailPrefix(email) {
  return email.split('.')[0]
}

async function seedSection(students, section, batch) {
  let ok = 0, skip = 0, fail = 0
  for (const [name, email] of students) {
    const prefix = getEmailPrefix(email)
    const password = `${prefix}26${batch}@licet`

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError && !authError.message.includes('already been registered')) {
      console.log(`✗ Auth [${name}]: ${authError.message}`)
      fail++
      continue
    }

    const userId = authData?.user?.id ?? null

    // Get existing user id if already exists
    let finalId = userId
    if (!finalId) {
      const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const found = existing?.users?.find(u => u.email === email)
      finalId = found?.id ?? null
      if (finalId) skip++
    }

    if (!finalId) { fail++; continue }

    // Upsert profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: finalId,
      email,
      full_name: name,
      role: 'STUDENT',
      department_id: DEPT,
      section,
      batch_year: 2022,
    }, { onConflict: 'id' })

    if (profileError) {
      console.log(`✗ Profile [${name}]: ${profileError.message}`)
      fail++
    } else {
      if (!userId) console.log(`↺ Existing: ${name} (${email})`)
      else { console.log(`✓ ${name} (${email}) → ${password}`); ok++ }
    }
  }
  console.log(`\n${section}: ✓${ok} new, ↺${skip} existing, ✗${fail} failed`)
}

// Also seed Sem 8 subject for IV year sections
async function seedSem8Subjects() {
  const AY = '2025-2026'
  for (const section of ['IV CSE-A', 'IV CSE-B']) {
    const { error } = await supabase.from('subjects').upsert({
      code: 'CS24821',
      name: 'Professional Project II',
      semester: 8,
      section,
      credits: 10,
      department_id: DEPT,
      academic_year: AY
    }, { onConflict: 'code,section,semester' })
    if (error) {
      // Insert if upsert fails due to missing unique constraint
      const { error: insertError } = await supabase.from('subjects').insert({
        code: 'CS24821',
        name: 'Professional Project II',
        semester: 8,
        section,
        credits: 10,
        department_id: DEPT,
        academic_year: AY
      })
      if (insertError && !insertError.message.includes('duplicate'))
        console.log(`✗ Subject [${section}]: ${insertError.message}`)
      else console.log(`✓ Sem 8 subject seeded for ${section}`)
    } else {
      console.log(`✓ Sem 8 subject seeded for ${section}`)
    }
  }
}

async function main() {
  console.log('=== Seeding IV CSE-A (66 students) ===')
  await seedSection(IV_CSA, 'IV CSE-A', 'csa')

  console.log('\n=== Seeding IV CSE-B (67 students) ===')
  await seedSection(IV_CSB, 'IV CSE-B', 'csb')

  console.log('\n=== Seeding Sem 8 subjects ===')
  await seedSem8Subjects()

  console.log('\n=== Done! ===')
}

main().catch(console.error)
