// How a course's continuous internal assessment (CIA) is made up — the same segmentation the
// department's IA workbooks use: per CIA a concept test (CT), a CAT, an activity and/or
// assignment, lab performance (LP) and practical test (PT) …, each written out of its own
// maximum and counted with a weight. Every offering may have its own scheme
// (subjects.cia_scheme); without one the default for its course type applies.
//
//   part internal = Σ(weighted marks of the part, both CIAs) / Σ(weights) × part.out_of
//   internal      = Σ parts            (e.g. lab-integrated: theory 25 + lab 25)
//
// Marks are stored as written (CAT 2 out of 100, ABA out of 40, "AB" = absent); a component's
// weight scales them. Components with the same `pool` are added before scaling (e.g. two
// activities, or CT + CAT together). A special test (SP) replaces an absent CAT.
import { courseType, labIntegratedWeights } from './regulations'

export type Comp = { cia: 1 | 2; key: string; label: string; max: number; weight: number; part: string; pool?: string
  /** round the scaled mark, as a sheet's ROUND(CAT/60*40) or ROUNDUP(CT/30*20) column does */
  round?: 'round' | 'up' }
/** steps: round the part's average over the CIAs (out of 100) before scaling it, as a sheet's
 *  "Total internal = ROUND(avg)", then "Internal = ROUND(Total × 25 / 100)" does */
export type Part = { key: string; label: string; out_of: number; steps?: boolean }
export type Scheme = { parts: Part[]; comps: Comp[]; sp?: boolean; rounding?: 'round' | 'up' }
export type MarkRow = { exam_type: string; marks_obtained: number | string | null; max_marks?: number | string | null; absent?: boolean | null }

export const examType = (c: Pick<Comp, 'cia' | 'key'>) => `CIA${c.cia}_${c.key}`
export const SP_KEY = 'SP'
export const SP_MAX = 100

const both = (list: Omit<Comp, 'cia'>[]): Comp[] => ([1, 2] as const).flatMap(cia => list.map(c => ({ ...c, cia })))

/** Regulation default for a course (Tables 5–9), laid out like the IA workbooks. */
export function defaultScheme(code: string | null | undefined): Scheme {
  const type = courseType(code)
  if (type === 'THEORY') return { parts: [{ key: 'T', label: 'Theory', out_of: 40 }], sp: true, comps: both([
    { key: 'CT', label: 'CT', max: 30, weight: 20, part: 'T' },
    { key: 'CAT', label: 'CAT', max: 60, weight: 40, part: 'T', round: 'round' },
    { key: 'ACTIVITY', label: 'ABA / assignment', max: 40, weight: 40, part: 'T' },
  ]) }
  if (type === 'LAB_INTEGRATED') {
    const w = labIntegratedWeights(code)
    return { parts: [{ key: 'T', label: 'Theory', out_of: w.theory, steps: true }, { key: 'P', label: 'Lab', out_of: w.lab }], sp: true, comps: both([
      { key: 'CT', label: 'CT', max: 30, weight: 30, part: 'T' },
      { key: 'CAT', label: 'CAT', max: 60, weight: 60, part: 'T', round: 'round' },
      { key: 'ACTIVITY', label: 'Assignment / ABA', max: 10, weight: 10, part: 'T' },
      { key: 'LP', label: 'Lab performance', max: 75, weight: 75, part: 'P' },
      { key: 'PT', label: 'Practical test', max: 25, weight: 25, part: 'P' },
    ]) }
  }
  if (type === 'FORMATION') return { parts: [{ key: 'F', label: 'Internal', out_of: 100 }], comps: [{ cia: 1, key: 'INT', label: 'Internal assessment', max: 100, weight: 100, part: 'F' }] }
  return { parts: [{ key: 'P', label: 'Lab', out_of: 60, steps: true }], comps: both([
    { key: 'LP', label: 'Lab performance', max: 75, weight: 75, part: 'P' },
    { key: 'PT', label: 'Test', max: 25, weight: 25, part: 'P' },
  ]) }
}

/** The scheme an offering uses: its own, if valid, else the default. */
export function schemeOf(s: { code: string; cia_scheme?: unknown }): Scheme {
  return validScheme(s.cia_scheme) ? s.cia_scheme : defaultScheme(s.code)
}

/** Problems with a scheme ([] = fine). */
export function schemeProblems(x: unknown): string[] {
  const s = x as Scheme
  const out: string[] = []
  if (!s || typeof s !== 'object' || !Array.isArray(s.parts) || !Array.isArray(s.comps)) return ['Not a scheme']
  if (!s.parts.length || s.parts.length > 4) out.push('Give 1 to 4 parts')
  if (!s.comps.length || s.comps.length > 40) out.push('Give 1 to 40 components')
  const parts = new Set(s.parts.map(p => p.key))
  for (const p of s.parts) if (!/^[A-Z]{1,4}$/.test(p.key) || !(p.out_of > 0 && p.out_of <= 100)) out.push(`Part ${p.label || p.key}: needs a short code and marks out of 1–100`)
  const seen = new Set<string>()
  for (const c of s.comps) {
    const name = `CIA ${c.cia} ${c.label || c.key}`
    if (c.cia !== 1 && c.cia !== 2) out.push(`${name}: CIA must be 1 or 2`)
    if (!/^[A-Z][A-Z0-9]{0,11}$/.test(c.key) || c.key === SP_KEY) out.push(`${name}: code must be letters/digits, e.g. CT, CAT, ABA2`)
    if (!(c.max > 0 && c.max <= 1000)) out.push(`${name}: "out of" must be more than 0`)
    if (!(c.weight >= 0 && c.weight <= 100)) out.push(`${name}: weight must be 0–100`)
    if (!parts.has(c.part)) out.push(`${name}: unknown part ${c.part}`)
    if (c.round !== undefined && c.round !== 'round' && c.round !== 'up') out.push(`${name}: rounding must be "round" or "up"`)
    if (seen.has(examType(c))) out.push(`${name}: repeated`)
    seen.add(examType(c))
  }
  for (const p of s.parts) if (!s.comps.some(c => c.part === p.key && c.weight > 0)) out.push(`Part ${p.label || p.key} has no weighted component`)
  return out
}
export const validScheme = (x: unknown): x is Scheme => schemeProblems(x).length === 0

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const rnd = (v: number, mode: Scheme['rounding']) => mode === 'up' ? Math.ceil(v - 1e-9) : Math.round(v + 1e-9)

/** Old lab rows (experiments + record + viva = lab performance /75, lab test = practical /25). */
function withAliases(rows: MarkRow[]): Map<string, MarkRow> {
  const m = new Map(rows.map(r => [r.exam_type, r]))
  for (const c of [1, 2]) {
    const old = ['EXP', 'RECORD', 'VIVA'].map(k => m.get(`CIA${c}_${k}`)).filter(Boolean) as MarkRow[]
    if (!m.has(`CIA${c}_LP`) && old.length) m.set(`CIA${c}_LP`, { exam_type: `CIA${c}_LP`, marks_obtained: old.reduce((s, r) => s + num(r.marks_obtained), 0), max_marks: old.reduce((s, r) => s + num(r.max_marks || 25), 0) })
    const lab = m.get(`CIA${c}_LAB`)
    if (!m.has(`CIA${c}_PT`) && lab) m.set(`CIA${c}_PT`, { ...lab, exam_type: `CIA${c}_PT` })
  }
  return m
}

export type Internal = {
  internal: number; max: number
  parts: { key: string; label: string; value: number; out_of: number }[]
  /** per CIA and part: weighted marks out of the part's weights in that CIA (e.g. 85.7 of 100) */
  cia: Record<1 | 2, Record<string, { got: number; of: number }>>
  complete: boolean; entered: boolean; spUsed: 1 | 2 | null
}

export function computeInternal(scheme: Scheme, rows: MarkRow[]): Internal {
  const m = withAliases(rows)
  let spUsed: 1 | 2 | null = null
  const sp = m.get(SP_KEY)
  if (scheme.sp !== false && sp && sp.marks_obtained !== null) {
    for (const c of [1, 2] as const) if (m.get(`CIA${c}_CAT`)?.absent) { spUsed = c; break }
  }
  const frac = (c: Comp): { got: number; max: number } | null => {
    if (spUsed === c.cia && c.key === 'CAT' && sp) return { got: num(sp.marks_obtained) / num(sp.max_marks || SP_MAX) * c.max, max: c.max }
    const r = m.get(examType(c))
    if (!r || r.marks_obtained === null) return null
    const max = num(r.max_marks) || c.max
    return { got: r.absent ? 0 : Math.min(max, Math.max(0, num(r.marks_obtained))), max }
  }
  const cia: Internal['cia'] = { 1: {}, 2: {} }
  const parts = scheme.parts.map(p => {
    let got = 0, of = 0
    for (const c of [1, 2] as const) {
      const comps = scheme.comps.filter(x => x.part === p.key && x.cia === c)
      const pools = new Map<string, Comp[]>()
      for (const x of comps) pools.set(x.pool || x.key, [...(pools.get(x.pool || x.key) ?? []), x])
      let g = 0, o = 0
      for (const group of pools.values()) {
        const w = group.reduce((s, x) => s + x.weight, 0)
        const fs = group.map(frac)
        const max = fs.reduce((s, f, i) => s + (f?.max ?? group[i].max), 0)
        const v = max ? fs.reduce((s, f) => s + (f?.got ?? 0), 0) / max * w : 0
        const r = group.length === 1 ? group[0].round : undefined
        g += r ? rnd(v, r) : v
        o += w
      }
      if (o) cia[c][p.key] = { got: Math.round(g * 100) / 100, of: o }
      got += g; of += o
    }
    const pct = of ? got / of * 100 : 0
    return { key: p.key, label: p.label, value: of ? rnd((p.steps ? rnd(pct, scheme.rounding) : pct) / 100 * p.out_of, scheme.rounding) : 0, out_of: p.out_of }
  })
  const keys = scheme.comps.filter(c => c.weight > 0)
  return {
    internal: parts.reduce((s, p) => s + p.value, 0), max: parts.reduce((s, p) => s + p.out_of, 0), parts, cia, spUsed,
    complete: keys.every(c => frac(c) !== null), entered: keys.some(c => frac(c) !== null),
  }
}

/** Old callers pass {exam_type: marks}; the scheme supplies each component's maximum. */
export function rowsFromMap(scheme: Scheme, map: Record<string, number | undefined | null>): MarkRow[] {
  return Object.entries(map).filter(([, v]) => v !== undefined && v !== null).map(([exam_type, v]) => ({
    exam_type, marks_obtained: Number(v), max_marks: scheme.comps.find(c => examType(c) === exam_type)?.max ?? (exam_type === SP_KEY ? SP_MAX : null),
  }))
}
