// Import parent / guardian mobile numbers from the college export
// (columns: register_no, roll_no, name, mobile, dept, year, sem, batch).
// Numbers are stored as 10 digits: a leading "91" country code is removed.
// Students are matched by roll number, then by name. Register numbers are NOT
// used for matching: in 2026 many ERP register numbers were found shifted by one.
// With --fix-ids the register and roll numbers are also corrected from the file
// (a backup of the old values is written to scripts/backups/ first).
//
//   node scripts/import-parent-mobiles.mjs scripts/data/parent-mobiles.csv                      # preview
//   node scripts/import-parent-mobiles.mjs scripts/data/parent-mobiles.csv --apply              # parent numbers
//   node scripts/import-parent-mobiles.mjs scripts/data/parent-mobiles.csv --apply --fix-ids    # + register/roll numbers
//
// The CSV holds personal data: keep it in scripts/data/ (git-ignored).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { supabase } from './admin-client.mjs'

const file = process.argv[2]
const apply = process.argv.includes('--apply')
const fixIds = process.argv.includes('--fix-ids')
if (!file || file.startsWith('--')) {
  console.error('Usage: node scripts/import-parent-mobiles.mjs <file.csv> [--apply]')
  process.exit(1)
}

// Minimal CSV parser: quoted or bare fields, no embedded newlines.
const parseLine = line => [...line.matchAll(/(?:"([^"]*)"|([^,]*))(?:,|$)/g)].map(m => (m[1] ?? m[2] ?? '').trim()).slice(0, -1)
const [header, ...lines] = readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n')
const cols = parseLine(header)
const col = name => cols.indexOf(name)
for (const c of ['register_no', 'roll_no', 'name', 'mobile', 'dept', 'year']) {
  if (col(c) < 0) { console.error(`Missing column "${c}"`); process.exit(1) }
}

const YEAR = ['', 'I', 'II', 'III', 'IV']
const tenDigits = raw => {
  const d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  if (d.length === 10) return d
  return null
}
const norm = s => (s ?? '').toUpperCase().replace(/[^A-Z]/g, '')

const records = lines.map(parseLine).map(r => ({
  reg: r[col('register_no')], roll: r[col('roll_no')], name: r[col('name')],
  mobile: tenDigits(r[col('mobile')]), raw: r[col('mobile')],
  section: `${YEAR[Number(r[col('year')])] ?? '?'} CSE-${r[col('dept')].slice(-1)}`,
}))

const { data: students, error } = await supabase.from('profiles')
  .select('id, full_name, register_number, roll_number, section, parent_mobile').eq('role', 'STUDENT').range(0, 9999)
if (error) { console.error(error.message); process.exit(1) }

// Name match within the same year, tolerating a missing trailing initial ("Dany Brooks" = "DANY BROOKS S").
const sameYear = (a, b) => (a ?? '').split(' ')[0] === (b ?? '').split(' ')[0]
const byName = r => {
  const exact = students.filter(s => norm(s.full_name) === norm(r.name) && sameYear(s.section, r.section))
  if (exact.length === 1) return exact[0]
  const words = r.name.toUpperCase().split(/\s+/).filter(Boolean)
  const loose = students.filter(s => sameYear(s.section, r.section) && !s.roll_number && norm(s.full_name) === norm(words.slice(0, -1).join(' ')))
  return loose.length === 1 ? loose[0] : null
}

const updates = [], unmatched = [], invalid = [], changed = [], sectionDiffers = [], idFixes = []
const claimed = new Set()
for (const r of records) {
  if (!r.mobile) { invalid.push(`${r.name} (${r.raw})`); continue }
  const p = students.find(s => r.roll && s.roll_number === r.roll) ?? byName(r)
  if (!p || claimed.has(p.id)) { unmatched.push(`${r.reg} ${r.name} (${r.section})`); continue }
  claimed.add(p.id)
  if (norm(p.full_name) !== norm(r.name)) console.log(`  matched "${r.name}" to ERP "${p.full_name}"`)
  if (p.register_number !== r.reg || (r.roll && p.roll_number !== r.roll)) {
    idFixes.push({ id: p.id, name: p.full_name, old: { register_number: p.register_number, roll_number: p.roll_number }, new: { register_number: r.reg, roll_number: r.roll || p.roll_number } })
  }
  if (p.section !== r.section) sectionDiffers.push(`${p.full_name}: file says ${r.section}, ERP has ${p.section}`)
  if (p.parent_mobile && p.parent_mobile !== r.mobile) changed.push(`${p.full_name}: ${p.parent_mobile} → ${r.mobile}`)
  if (p.parent_mobile !== r.mobile) updates.push({ id: p.id, parent_mobile: r.mobile })
}

console.log(`Rows in file:        ${records.length}`)
console.log(`To update:           ${updates.length}`)
console.log(`Already up to date:  ${records.length - updates.length - unmatched.length - invalid.length}`)
if (changed.length) console.log(`Numbers that change: ${changed.length}\n  ${changed.join('\n  ')}`)
if (unmatched.length) console.log(`No ERP account:      ${unmatched.length}\n  ${unmatched.join('\n  ')}`)
if (invalid.length) console.log(`Invalid numbers:     ${invalid.length}\n  ${invalid.join('\n  ')}`)
if (sectionDiffers.length) console.log(`Section differs (not changed):\n  ${sectionDiffers.join('\n  ')}`)
console.log(`Register/roll numbers that differ from the file: ${idFixes.length}${fixIds ? ' (will be corrected)' : ' (use --fix-ids to correct)'}`)

if (!apply) { console.log('\nPreview only. Re-run with --apply to write.'); process.exit(0) }

let done = 0
for (const u of updates) {
  const { error: e } = await supabase.from('profiles').update({ parent_mobile: u.parent_mobile }).eq('id', u.id)
  if (e) console.error('failed', u.id, e.message); else done++
}
console.log(`\nUpdated ${done} of ${updates.length} students.`)

if (fixIds && idFixes.length) {
  mkdirSync('scripts/backups', { recursive: true })
  const backup = `scripts/backups/student-ids-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
  writeFileSync(backup, JSON.stringify(idFixes, null, 2), { mode: 0o600 })
  let fixed = 0
  for (const f of idFixes) {
    const { error: e } = await supabase.from('profiles').update(f.new).eq('id', f.id)
    if (e) console.error('failed', f.name, e.message); else fixed++
  }
  console.log(`Corrected register/roll numbers for ${fixed} of ${idFixes.length} students (old values in ${backup}).`)
}
