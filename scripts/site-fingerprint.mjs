// Prints a short fingerprint of the CSE pages on licet.ac.in: the "last modified" time of the
// department page, every page under it and the latest CSE news posts, read from the site's
// WordPress API (a few small requests, no page downloads). The fingerprint changes whenever
// someone edits one of those pages, so the sync workflow runs the full sync only then.
//
//   node scripts/site-fingerprint.mjs      → e.g. 3f9a1c27b0d4
//
// Prints "unavailable" if the API cannot be reached (the workflow then tries again later).

import { createHash } from 'node:crypto'

const API = 'https://licet.ac.in/wp-json/wp/v2'
const CSE_PAGE = 654        // /computer-science-and-engineering/
const CSE_NEWS = 31         // the "cse" post category
const UA = { 'User-Agent': 'Mozilla/5.0 (LICET Things content sync)' }

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json()
}

try {
  const [main, children, news] = await Promise.all([
    get(`pages/${CSE_PAGE}?_fields=id,modified`),
    get(`pages?parent=${CSE_PAGE}&per_page=100&_fields=id,modified`),
    get(`posts?categories=${CSE_NEWS}&per_page=20&_fields=id,modified`),
  ])
  const stamps = [main, ...children, ...news].map(p => `${p.id}:${p.modified}`).sort()
  if (stamps.length < 10) throw new Error(`only ${stamps.length} items listed`)
  console.log(createHash('sha1').update(stamps.join('\n')).digest('hex').slice(0, 12))
} catch (e) {
  console.error(`[fingerprint] ${e.message}`)
  console.log('unavailable')
}
