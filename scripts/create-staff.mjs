#!/usr/bin/env node
// Creates faculty accounts from a JSON list: [{ "full_name": "Dr. Kavitha G", "email": "kavitha@licet.ac.in" }, …]
// Default password: licet@ + the person's name in lower case without titles or initials
// (Dr. Kavitha G -> licet@kavitha). Everyone must set their own password at first sign-in.
//
//   node scripts/create-staff.mjs <list.json>                      # dry run: shows what would happen
//   node scripts/create-staff.mjs <list.json> --apply --out <file.csv>   # create; the CSV of default
//                                                                   # passwords goes OUTSIDE the repo
//
// Accounts that already exist are left alone. Profiles are created inactive and switched on
// together at the end, so the course-linking trigger can see every name and skip ambiguous ones.
import fs from 'node:fs'
import path from 'node:path'
import { supabase } from './admin-client.mjs'

const DEPT = '00000000-0000-0000-0000-000000000001'
const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'rev', 'prof', 'sj'])
const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const apply = process.argv.includes('--apply')
const outIdx = process.argv.indexOf('--out')
const out = outIdx > 0 ? process.argv[outIdx + 1] : null
if (!file) { console.error('Usage: node scripts/create-staff.mjs <list.json> [--apply --out <file.csv>]'); process.exit(1) }
if (apply && (!out || path.resolve(out).startsWith(process.cwd()))) { console.error('--apply needs --out <file.csv> outside the project folder'); process.exit(1) }

export const defaultStaffPassword = name =>
  'licet@' + name.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !TITLES.has(w)).join('')

const people = JSON.parse(fs.readFileSync(file, 'utf8'))
const existing = new Set()
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  data.users.forEach(u => existing.add(u.email?.toLowerCase()))
  if (data.users.length < 1000) break
}

const created = [], skipped = []
for (const p of people) {
  const email = p.email.trim().toLowerCase(), full_name = p.full_name.trim()
  if (!/^[^\s@]+@licet\.ac\.in$/.test(email)) { skipped.push(`${email} (not a licet.ac.in address)`); continue }
  if (existing.has(email)) { skipped.push(`${email} (account exists)`); continue }
  const password = defaultStaffPassword(full_name)
  if (password.length < 10) { skipped.push(`${email} (name too short for a password)`); continue }
  if (!apply) { created.push({ email, full_name }); continue }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) { skipped.push(`${email} (${error.message})`); continue }
  const { error: pe } = await supabase.from('profiles').upsert({
    id: data.user.id, email, full_name, role: 'PROFESSOR', department_id: DEPT, is_active: false, must_change_password: true,
  })
  if (pe) { await supabase.auth.admin.deleteUser(data.user.id); skipped.push(`${email} (${pe.message})`); continue }
  created.push({ id: data.user.id, email, full_name, password })
}

if (apply) {
  for (const c of created) {
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', c.id)
    if (error) console.error('activate', c.email, error.message)
  }
  fs.writeFileSync(out, 'name,email,default password\n' + created.map(c => `"${c.full_name}",${c.email},${c.password}`).join('\n') + '\n', { mode: 0o600 })
}
console.log(`${apply ? 'Created' : 'Would create'} ${created.length} account(s); skipped ${skipped.length}.`)
skipped.forEach(s => console.log('  skipped', s))
if (apply) console.log(`Default passwords written to ${out}`)
