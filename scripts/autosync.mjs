// Safe, unattended sync of the department pages from licet.ac.in.
//
//   npm run autosync              sync, and commit + push when the content changed
//   node scripts/autosync.mjs     sync and report only (no git commit)
//
// Runs scripts/sync-cse-site.mjs, then refuses to keep the result unless it
// passes sanity checks (so a website outage or redesign can never wipe the
// homepage), and ignores runs where only the "last synced" time changed.
// The GitHub Actions workflow .github/workflows/sync-site.yml runs this every
// two days; Vercel redeploys automatically when it pushes a change.

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

const COMMIT = process.argv.includes('--commit')
const PUSH = process.argv.includes('--push')
const OUTPUTS = ['src/data/cse-site.json', 'src/data/cse-people.json', 'public/cse/people']

// Minimums the synced content must meet before it replaces what is live.
const MIN_SECTIONS = 12
const MIN_FACULTY = 5
const EXCLUDED = [/justine\s+yasappan/i]

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const log = msg => console.log(`[autosync] ${msg}`)

function restore(reason) {
  log(`${reason} — keeping the current content.`)
  git('checkout', 'HEAD', '--', ...OUTPUTS)
  git('clean', '-fdq', '--', 'public/cse/people')
}

if (git('status', '--porcelain', '--', ...OUTPUTS)) {
  console.error('[autosync] The synced files have uncommitted edits. Commit or discard them first.')
  process.exit(1)
}

// 1. Sync
const run = spawnSync(process.execPath, ['scripts/sync-cse-site.mjs'], { stdio: 'inherit' })
if (run.status !== 0) { restore('Sync failed'); process.exit(1) }

// 2. Sanity checks
try {
  const site = JSON.parse(readFileSync('src/data/cse-site.json', 'utf8'))
  const people = JSON.parse(readFileSync('src/data/cse-people.json', 'utf8'))
  const problems = []
  const filled = site.sections.filter(s => s.blocks.length > 0).length
  if (filled < MIN_SECTIONS) problems.push(`only ${filled} sections have content (expected ${MIN_SECTIONS}+)`)
  if (!people.hod?.name) problems.push('no Head of Department found')
  if ((people.faculty?.length ?? 0) < MIN_FACULTY) problems.push(`only ${people.faculty?.length ?? 0} faculty found`)
  const text = JSON.stringify(site) + JSON.stringify(people)
  if (EXCLUDED.some(re => re.test(text))) problems.push('an excluded person appears in the content')
  const photos = existsSync('public/cse/people') ? readdirSync('public/cse/people').length : 0
  if (photos < MIN_FACULTY) problems.push(`only ${photos} staff photos saved`)
  if (problems.length) { restore(`Sanity check failed: ${problems.join('; ')}`); process.exit(1) }
} catch (e) {
  restore(`Could not read the synced files (${e.message})`)
  process.exit(1)
}

// 3. Did anything besides the sync time change?
const withoutTime = file => {
  const strip = s => s.replace(/"syncedAt":\s*"[^"]*"/g, '')
  const before = (() => { try { return git('show', `HEAD:${file}`) } catch { return '' } })()
  return strip(before) !== strip(readFileSync(file, 'utf8'))
}
const photosChanged = git('status', '--porcelain', '--', 'public/cse/people') !== ''
const changed = withoutTime('src/data/cse-site.json') || withoutTime('src/data/cse-people.json') || photosChanged

if (!changed) {
  restore('No changes on licet.ac.in since the last sync')
  process.exit(0)
}

log('Department content changed:')
console.log(git('status', '--short', '--', ...OUTPUTS))

// 4. Commit and push
if (COMMIT) {
  git('add', '-A', '--', ...OUTPUTS)
  git('commit', '-q', '-m', `Sync department content from licet.ac.in (${new Date().toISOString().slice(0, 10)})`)
  log(`Committed ${git('rev-parse', '--short', 'HEAD')}.`)
  if (PUSH) {
    git('push', '-q', 'origin', 'HEAD')
    log('Pushed. Vercel will redeploy the site.')
  }
} else {
  log('Not committing (run with --commit to save the update).')
}
