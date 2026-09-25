// Sync the public department content from licet.ac.in into the ERP.
//
//   npm run sync:site
//
// Fetches every page of https://licet.ac.in/computer-science-and-engineering/,
// extracts headings, text, tables, images, galleries, toggles and counters into
// src/data/cse-site.json, and the faculty page into structured people records.
// People (HOD, faculty, staff) go to src/data/cse-people.json and their photos
// to public/cse/people/.
// Re-run whenever the department website changes.

import { load } from 'cheerio'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import sharp from 'sharp'
import { createHash } from 'node:crypto'

const BASE = 'https://licet.ac.in/computer-science-and-engineering/'
const SECTIONS = [
  { id: 'overview',       title: 'About the Department',       path: '' },
  { id: 'obe',            title: 'Outcome Based Education',    path: 'obecse/' },
  { id: 'faculty',        title: 'Faculty & Staff',            path: 'computer-science-and-engineering-faculty/' },
  { id: 'infrastructure', title: 'Infrastructure',             path: 'infrastructure-cse/' },
  { id: 'research',       title: 'Research & Consultancy',     path: 'research-consultancy/' },
  { id: 'industry',       title: 'Industry Interaction',       path: 'industry-interaction/' },
  { id: 'international',  title: 'International Collaborations', path: 'international-collaborations-and-conferences/' },
  { id: 'placements',     title: 'Placements',                 path: 'duplicated-computer-science-and-engineering-placements/' },
  { id: 'students',       title: 'Student Achievements',       path: 'students/' },
  { id: 'alumni',         title: 'Alumni',                     path: 'alumni/' },
  { id: 'entrepreneurship', title: 'Entrepreneurship',         path: 'entrepreneurship/' },
  { id: 'eicon',          title: 'EICON Symposium',            path: 'eicon-cse/' },
  { id: 'events',         title: 'Events Organized',           path: 'events-organized/' },
  { id: 'best-practices', title: 'Best Practices',             path: 'best-practices/' },
  { id: 'news',           title: 'News & Events',              path: 'computer-science-and-engineering-news/' },
]

const UA = { 'User-Agent': 'Mozilla/5.0 (LICET Things content sync)' }
const fetchText = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text() }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ALLOWED = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'sup', 'sub'])

// Rebuilds a widget's HTML from a small allow-list: text is escaped, only
// http(s) links survive, and no attributes other than href / colspan / rowspan.
function clean($, el) {
  const walk = node => {
    if (node.type === 'text') return esc(node.data.replace(/ /g, ' ').replace(/\s+/g, ' '))
    if (node.type !== 'tag') return ''
    const tag = node.name
    const inner = (node.children || []).map(walk).join('')
    if (!ALLOWED.has(tag)) return inner
    if (tag === 'br') return '<br>'
    if (/^h[1-6]$/.test(tag)) return `<h4>${inner.trim()}</h4>`
    if (tag === 'b') return `<strong>${inner}</strong>`
    if (tag === 'i') return `<em>${inner}</em>`
    if (tag === 'a') {
      const h = $(node).attr('href') || ''
      return /^https?:\/\//.test(h) ? `<a href="${esc(h).replace(/"/g, '&quot;')}">${inner}</a>` : inner
    }
    if (tag === 'td' || tag === 'th') {
      const cs = Number($(node).attr('colspan')) || 0, rs = Number($(node).attr('rowspan')) || 0
      return `<${tag}${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}>${inner.trim()}</${tag}>`
    }
    return `<${tag}>${inner}</${tag}>`
  }
  return (el.children || []).map(walk).join('')
    .replace(/<p>\s*<\/p>/g, '').replace(/(<br>\s*){3,}/g, '<br><br>').replace(/\s+/g, ' ').trim()
}

const imgSrc = ($, img) => {
  if (!img) return ''
  const s = $(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('src') || ''
  return /^https?:/.test(s) ? s : ''
}
const text = ($, el) => $(el).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
const SKIP_HEADINGS = new Set(['Computer Science and Engineering', 'About us', 'Now Playing'])
// Obvious typos on the source pages, corrected for display.
const FIX_TEXT = [[/\bSymosium\b/g, 'Symposium']]
const fixText = t => FIX_TEXT.reduce((s, [re, to]) => s.replace(re, to), t)

// People listed on the website who are not part of the department's staff.
const EXCLUDE_PEOPLE = [/justine\s+yasappan/i]
const excluded = name => EXCLUDE_PEOPLE.some(re => re.test(name))

// Removes every mention of an excluded person: their paragraph in text blocks,
// their card or accordion entry, and fixes "We have N recognized research supervisors".
function dropExcluded(blocks) {
  const scrub = html => {
    let out = html.replace(/<(p|li|tr)\b[^>]*>(?:(?!<\/\1>)[\s\S])*<\/\1>/gi, m => (excluded(m.replace(/<[^>]+>/g, ' ')) ? '' : m))
    const n = (out.match(/Research Supervisor:/gi) || []).length
    if (n) out = out.replace(/We have \d+ recognized research supervisors/i, `We have ${n} recognized research supervisors`)
    return out
  }
  return blocks.map(b => {
    if (b.t === 'html') return { ...b, html: scrub(b.html) }
    if (b.t === 'toggle') return { ...b, items: b.items.filter(i => !excluded(i.title)).map(i => ({ ...i, html: scrub(i.html) })) }
    if (b.t === 'cards') return { ...b, items: b.items.filter(c => !excluded(c.title) && !excluded(c.html.replace(/<[^>]+>/g, ' '))) }
    return b
  }).filter(b => !(b.t === 'cards' && !b.items.length) && !(b.t === 'html' && !b.html.replace(/<[^>]+>/g, '').trim()))
}

function widgetBlock($, w) {
  const $w = $(w), type = $w.attr('data-widget_type').split('.')[0]
  if (type === 'heading' || type === 'animated-headline') {
    const t = fixText(text($, type === 'heading' ? $w.find('.elementor-heading-title') : $w.find('.elementor-headline')))
    return t && !SKIP_HEADINGS.has(t) && ![...SKIP_HEADINGS].some(k => k.toLowerCase() === t.toLowerCase()) ? { t: 'h', text: t } : null
  }
  if (type === 'text-editor') {
    const html = fixText(clean($, $w.find('.elementor-widget-container').get(0) ?? w))
    return html.replace(/<[^>]+>/g, '').trim() ? { t: 'html', html } : null
  }
  if (type === 'image') {
    const src = imgSrc($, $w.find('img').get(0))
    return src ? { t: 'img', src, alt: ($w.find('img').attr('alt') || '').trim(), caption: text($, $w.find('figcaption')) } : null
  }
  if (['gallery', 'image-carousel', 'media-carousel'].includes(type)) {
    const imgs = []
    $w.find('a[href]').each((_, a) => { const h = $(a).attr('href'); if (/\.(jpe?g|png|webp)$/i.test(h)) imgs.push(h) })
    $w.find('img').each((_, i) => imgs.push(imgSrc($, i)))
    $w.find('[style*="background-image"]').each((_, e) => { const m = ($(e).attr('style') || '').match(/url\(['"]?([^'")]+)/); if (m) imgs.push(m[1]) })
    const images = [...new Set(imgs.filter(u => /^https?:/.test(u)))]
    return images.length ? { t: 'gallery', images } : null
  }
  if (type === 'toggle' || type === 'accordion') {
    const items = []
    $w.find('.elementor-toggle-item, .elementor-accordion-item').each((_, it) => {
      const c = $(it).find('.elementor-tab-content').get(0)
      const html = c ? fixText(clean($, c)) : ''
      if (html.replace(/<[^>]+>/g, '').trim()) items.push({ title: text($, $(it).find('.elementor-toggle-title, .elementor-accordion-title')), html })
    })
    return items.length ? { t: 'toggle', items } : null
  }
  if (type === 'counter') {
    const n = $w.find('.elementor-counter-number')
    return { t: 'counter', label: text($, $w.find('.elementor-counter-title')), value: `${$w.find('.elementor-counter-number-prefix').text().trim()}${n.attr('data-to-value') || text($, n)}${$w.find('.elementor-counter-number-suffix').text().trim()}` }
  }
  if (type === 'video') {
    try { const st = JSON.parse($w.attr('data-settings') || '{}'); const url = st.youtube_url || st.vimeo_url; return url ? { t: 'video', url } : null } catch { return null }
  }
  if (type === 'posts') {
    const items = []
    $w.find('article').each((_, a) => {
      const link = $(a).find('.elementor-post__title a').attr('href') || $(a).find('a').attr('href')
      items.push({ title: text($, $(a).find('.elementor-post__title')), href: /^https?:/.test(link || '') ? link : null, img: imgSrc($, $(a).find('img').get(0)), date: text($, $(a).find('.elementor-post-date')), excerpt: text($, $(a).find('.elementor-post__excerpt')) })
    })
    return items.length ? { t: 'posts', items } : null
  }
  return null
}

const isContainer = el => /\b(e-con|elementor-section|elementor-column)\b/.test(el.attribs?.class || '')
const ownWidgets = ($, el) => $(el).find('[data-widget_type]').toArray().filter(w => !$(w).parents('[data-widget_type]').length)
  .filter(w => !/^(divider|spacer|nav-menu)\./.test($(w).attr('data-widget_type')))

// Walks the page layout. A layout block holding exactly one photo and a little
// text (a person, a lab, an achievement) becomes a card, so the photo stays with
// its own text even when the website alternates photo/text sides.
function extractBlocks($, main) {
  const blocks = []
  const walk = el => {
    if (el.type !== 'tag') return
    if ($(el).attr('data-widget_type')) { const b = widgetBlock($, el); if (b) blocks.push(b); return }
    if (isContainer(el)) {
      const ws = ownWidgets($, el)
      const types = ws.map(w => $(w).attr('data-widget_type').split('.')[0])
      const images = types.filter(t => t === 'image').length
      const textual = types.filter(t => t === 'text-editor' || t === 'heading' || t === 'animated-headline').length
      const other = types.length - images - textual
      const textLen = ws.reduce((a, w) => a + ($(w).attr('data-widget_type').startsWith('image') ? 0 : text($, w).length), 0)
      if (images === 1 && textual >= 1 && textual <= 4 && other === 0 && textLen <= 1200) {
        const parts = ws.map(w => widgetBlock($, w)).filter(Boolean)
        const img = parts.find(p => p.t === 'img')
        // Icon + figure + label ("16 · Well Qualified Faculty") is a statistic, not a card.
        const heads = parts.filter(p => p.t === 'h')
        if (img && /-150x150\./.test(img.src) && heads.length >= 2 && FIGURE.test(heads[0].text)) {
          blocks.push({ t: 'counter', value: heads[0].text, label: heads[1].text }); return
        }
        const title = parts.find(p => p.t === 'h')?.text ?? ''
        const html = parts.filter(p => p.t === 'html').map(p => p.html).join('')
        if (img && (title || html)) { blocks.push({ t: 'card', img: img.src, title, html }); return }
      }
    }
    for (const c of el.children || []) walk(c)
  }
  walk(main.get(0))
  // Consecutive cards form one grid; runs of single photos form one gallery.
  const grouped = []
  for (const b of blocks) {
    const last = grouped[grouped.length - 1]
    if (b.t === 'card' && last?.t === 'cards') last.items.push({ img: b.img, title: b.title, html: b.html })
    else if (b.t === 'card') grouped.push({ t: 'cards', items: [{ img: b.img, title: b.title, html: b.html }] })
    else if (b.t === 'img' && !b.caption && last?.t === 'img' && !last.caption) grouped[grouped.length - 1] = { t: 'gallery', images: [last.src, b.src] }
    else if (b.t === 'img' && !b.caption && last?.t === 'gallery' && last.fromImages) last.images.push(b.src)
    else grouped.push(b)
    const now = grouped[grouped.length - 1]
    if (now.t === 'gallery' && b.t === 'img') now.fromImages = true
  }
  for (const g of grouped) delete g.fromImages
  // A gallery right after an MoU / recruiters / partners heading is a set of logos.
  grouped.forEach((g, i) => {
    const prev = grouped[i - 1]
    if (g.t === 'gallery' && prev?.t === 'h' && /\b(mou|recruiters?|partners?|collaborat)/i.test(prev.text)) g.variant = 'logos'
  })
  return toStats(grouped)
}

// Figures on the site come as counters or as "icon + number heading + label
// heading"; turn both into stats rows (consecutive figures share one row).
const FIGURE = /^[₹\d][\d.,]*\s*(\+|%|LPA|L)?$/i
function toStats(blocks) {
  const out = []
  const stat = (value, label) => {
    const last = out[out.length - 1]
    if (last?.t === 'stats') last.items.push({ value, label }); else out.push({ t: 'stats', items: [{ value, label }] })
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], n = blocks[i + 1], n2 = blocks[i + 2]
    if (b.t === 'counter') {
      if (!b.label && n?.t === 'h') { stat(b.value.trim(), n.text); i++ } else stat(b.value.trim(), b.label)
    } else if (b.t === 'img' && /-150x150\./.test(b.src) && n?.t === 'h' && FIGURE.test(n.text) && n2?.t === 'h') {
      stat(n.text, n2.text); i += 2
    } else if (b.t === 'h' && FIGURE.test(b.text) && n?.t === 'h') {
      stat(b.text, n.text); i++
    } else out.push(b)
  }
  return out
}

// ── People (faculty page) ──────────────────────────────────────────────────
function extractPeople($, main) {
  const widgets = c => $(c).find('[data-widget_type]').toArray()
    .map(w => ({ type: $(w).attr('data-widget_type').split('.')[0], el: w }))
    .filter(w => !['divider', 'spacer', 'nav-menu'].includes(w.type))
  let category = '', hod = null
  const faculty = [], staff = []
  for (const c of main.find('.e-con.e-parent, .elementor-top-section').toArray()) {
    const ws = widgets(c)
    const heads = ws.filter(w => w.type === 'heading' || w.type === 'animated-headline').map(w => text($, w.el))
    const cat = heads.find(h => /^(Professors|Associate Professors|Assistant Professors|Non-? ?Teaching Staff)$/i.test(h))
    if (cat) { category = /non/i.test(cat) ? 'Non-Teaching Staff' : cat; continue }
    const texts = ws.filter(w => w.type === 'text-editor').map(w => text($, w.el))
    const photo = imgSrc($, $(ws.find(w => w.type === 'image')?.el).find('img').get(0))
    if (heads.some(h => /^Head of the department$/i.test(h))) {
      const all = texts.join(' ')
      if (excluded(heads[0])) continue
      hod = { name: heads[0], role: 'Head of the Department', designation: (all.match(/Associate Professor|Assistant Professor|Professor/) || ['Professor'])[0], email: (all.match(/[\w.]+@licet\.ac\.in/) || [''])[0], bio: texts.filter(t => !/^Email/i.test(t)).join('\n\n'), photo }
      continue
    }
    if (category === 'Non-Teaching Staff') {
      const cols = $(c).children().children().toArray().filter(x => /e-con|elementor-column/.test(x.attribs?.class || ''))
      for (const col of cols.length ? cols : [c]) {
        const cw = widgets(col); const h = cw.filter(w => w.type === 'heading').map(w => text($, w.el))
        if (h.length >= 2 && !excluded(h[0])) staff.push({ name: h[0], role: h[1].charAt(0) + h[1].slice(1).toLowerCase(), photo: imgSrc($, $(cw.find(w => w.type === 'image')?.el).find('img').get(0)) })
      }
      continue
    }
    const at = heads.findIndex(h => /@licet\.ac\.in/.test(h))
    if (at > 0 && category && !excluded(heads[at - 1])) {
      const emails = heads[at].split(',').map(s => s.trim())
      faculty.push({ name: heads[at - 1], designation: category.replace(/s$/, ''), email: emails[0], otherEmails: emails.slice(1), bio: texts.join('\n\n'), photo })
    }
  }
  return { hod, faculty, staff }
}

const slug = s => s.toLowerCase().replace(/^(dr|mr|ms|mrs|rev)\.?\s+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Portraits are resized to 480 px squares (JPEG) so the pages stay light;
// cropped from the top so faces are never cut off. The person record keeps a
// hash of the original image: re-encoding can differ by a few bytes between
// machines, so change detection (scripts/autosync.mjs) relies on this hash.
async function savePhoto(person) {
  const url = person.photo, name = person.name
  if (!url || /NoPhoto/i.test(url)) return null
  const file = `public/cse/people/${slug(name)}.jpg`
  const r = await fetch(url, { headers: UA })
  if (!r.ok) return url                       // fall back to the website copy
  const original = Buffer.from(await r.arrayBuffer())
  person.photoHash = createHash('sha1').update(original).digest('hex').slice(0, 12)
  await sharp(original)
    .resize(480, 480, { fit: 'cover', position: 'north' })   // keep the head in frame
    .flatten({ background: '#F3E5C4' })       // transparent PNG cut-outs get the LICET cream
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(file)
  return file.replace(/^public/, '')
}

rmSync('public/cse/people', { recursive: true, force: true })
mkdirSync('public/cse/people', { recursive: true })
mkdirSync('src/data', { recursive: true })

const out = { syncedAt: new Date().toISOString(), source: BASE, people: null, sections: [] }
for (const s of SECTIONS) {
  const url = BASE + s.path
  process.stdout.write(`${s.title.padEnd(32)} `)
  const $ = load(await fetchText(url))
  const main = $('[data-elementor-type="wp-page"]').first()
  let blocks = extractBlocks($, main)
  if (s.id === 'faculty') {
    out.people = extractPeople($, main)
    // The people are shown from out.people; keep only the intro and accomplishments.
    const acc = blocks.findIndex(b => b.t === 'h' && /accomplishments/i.test(b.text))
    const end = acc >= 0 ? blocks.findIndex((b, i) => i > acc && b.t === 'toggle') : -1
    blocks = end > 0 ? blocks.slice(0, end + 1) : blocks.filter(b => b.t === 'h' || b.t === 'html').slice(0, 3)
  }
  blocks = dropExcluded(blocks)
  out.sections.push({ id: s.id, title: s.title, url, blocks })
  console.log(`${blocks.length} blocks`)
}

const p = out.people
if (!p?.hod || !p.faculty.length) throw new Error('Faculty page layout changed: no HOD / faculty found. Nothing written.')
p.hod.photo = await savePhoto(p.hod)
for (const f of p.faculty) f.photo = await savePhoto(f)
for (const s of p.staff) s.photo = await savePhoto(s)

// People go in their own small file: the dashboards load only that.
writeFileSync('src/data/cse-people.json', JSON.stringify({ syncedAt: out.syncedAt, source: BASE + 'computer-science-and-engineering-faculty/', ...p }, null, 1))
delete out.people
writeFileSync('src/data/cse-site.json', JSON.stringify(out, null, 1))
console.log(`\nHOD: ${p.hod.name} · ${p.faculty.length} faculty · ${p.staff.length} staff`)
console.log(`Wrote src/data/cse-site.json, src/data/cse-people.json${existsSync('public/cse/people') ? ' and public/cse/people/' : ''}`)
