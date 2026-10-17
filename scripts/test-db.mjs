#!/usr/bin/env node
// Runs tests/db/*.sql. Each file builds its own fake data inside a transaction,
// rolls back, and ends with `select ok, test, info` rows.
//   On the college server:  DATABASE_URL=postgres://... npm run test:db   (uses psql)
//   On Supabase cloud:      SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run test:db
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'tests', 'db')
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
const only = process.argv[2]

async function run(sql) {
  if (process.env.DATABASE_URL) {
    const out = execFileSync('psql', [process.env.DATABASE_URL, '-X', '-q', '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
    // only result rows (ok, test, info); other output such as set_config() echoes is ignored
    return out.trim().split('\n').map(l => l.split('\t')).filter(p => p.length === 3 && (p[0] === 't' || p[0] === 'f'))
      .map(([ok, test, info]) => ({ ok: ok === 't', test, info }))
  }
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref } = process.env
  if (!token || !ref) throw new Error('Set DATABASE_URL, or SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF')
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error(body.message ?? JSON.stringify(body))
  return body
}

let failed = 0, total = 0
for (const f of files) {
  if (only && !f.includes(only)) continue
  process.stdout.write(`\n${f}\n`)
  try {
    const rows = await run(fs.readFileSync(path.join(dir, f), 'utf8'))
    for (const r of rows) {
      total++; if (!r.ok) failed++
      process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.test}${r.ok ? '' : `  — ${r.info}`}\n`)
    }
  } catch (e) { failed++; total++; process.stdout.write(`  ERROR ${e.message}\n`) }
}
process.stdout.write(`\n${total - failed}/${total} passed\n`)
process.exit(failed ? 1 : 0)
