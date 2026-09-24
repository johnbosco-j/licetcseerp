// Undo repeated promotion runs for one academic year.
//
// The Promotion page used to allow running the same year more than once, which
// moved students up two or three years. Every run is recorded in
// student_promotion_history, so each student's FIRST record for the year holds
// the correct result. This script restores that state, removes the extra
// history rows and duplicate promotion_log entries.
//
//   node scripts/repair-promotion.mjs 2026-2027           # preview only
//   node scripts/repair-promotion.mjs 2026-2027 --apply   # write changes (saves a backup first)

import { mkdirSync, writeFileSync } from 'node:fs'
import { supabase } from './admin-client.mjs'

const year = process.argv[2]
const apply = process.argv.includes('--apply')
if (!/^\d{4}-\d{4}$/.test(year ?? '')) {
  console.error('Usage: node scripts/repair-promotion.mjs <academic-year e.g. 2026-2027> [--apply]')
  process.exit(1)
}

async function fetchAll(table, select, filter = q => q) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(select)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

const history = await fetchAll('student_promotion_history', '*',
  q => q.eq('academic_year', year).order('promoted_at', { ascending: true }).order('id', { ascending: true }))
const logs = await fetchAll('promotion_log', '*', q => q.eq('academic_year', year).order('promotion_date', { ascending: true }))
const profiles = await fetchAll('profiles', 'id, full_name, email, section, is_active', q => q.eq('role', 'STUDENT'))
const byId = new Map(profiles.map(p => [p.id, p]))

const firstByStudent = new Map()
const extraHistoryIds = []
for (const h of history) {
  if (!firstByStudent.has(h.student_id)) firstByStudent.set(h.student_id, h)
  else extraHistoryIds.push(h.id)
}

const fixes = []
for (const [studentId, first] of firstByStudent) {
  const p = byId.get(studentId)
  if (!p) continue
  const section = first.to_section
  const is_active = section !== 'GRADUATED'
  if (p.section !== section || p.is_active !== is_active) {
    fixes.push({ id: p.id, email: p.email, from: `${p.section} (active=${p.is_active})`, section, is_active, before: p })
  }
}
const extraLogs = logs.slice(1)

console.log(`\nAcademic year ${year}: ${logs.length} promotion run(s) logged, ${history.length} history rows for ${firstByStudent.size} students.\n`)
const summary = {}
for (const f of fixes) {
  const k = `${f.from}  →  ${f.section} (active=${f.is_active})`
  summary[k] = (summary[k] ?? 0) + 1
}
console.log(`Students to correct: ${fixes.length}`)
for (const [k, n] of Object.entries(summary).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`)
console.log(`Extra history rows to remove: ${extraHistoryIds.length}`)
console.log(`Duplicate promotion_log entries to remove: ${extraLogs.length}`)

if (!apply) {
  console.log('\nPreview only — nothing was changed. Re-run with --apply to write these changes.')
  process.exit(0)
}

mkdirSync('scripts/backups', { recursive: true })
const backupFile = `scripts/backups/promotion-repair-${year}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(backupFile, JSON.stringify({
  year, createdAt: new Date().toISOString(),
  profiles: fixes.map(f => f.before),
  history: history.filter(h => extraHistoryIds.includes(h.id)),
  logs: extraLogs,
}, null, 2))
console.log(`\nBackup written to ${backupFile}`)

let ok = 0
for (const f of fixes) {
  const { error } = await supabase.from('profiles').update({ section: f.section, is_active: f.is_active }).eq('id', f.id)
  if (error) console.log(`✗ ${f.email}: ${error.message}`)
  else ok++
}
console.log(`✓ Corrected ${ok}/${fixes.length} students`)

for (let i = 0; i < extraHistoryIds.length; i += 200) {
  const { error } = await supabase.from('student_promotion_history').delete().in('id', extraHistoryIds.slice(i, i + 200))
  if (error) console.log(`✗ history cleanup: ${error.message}`)
}
if (extraLogs.length) {
  const { error } = await supabase.from('promotion_log').delete().in('id', extraLogs.map(l => l.id))
  if (error) console.log(`✗ log cleanup: ${error.message}`)
}
console.log('✓ Removed duplicate history and log entries')
