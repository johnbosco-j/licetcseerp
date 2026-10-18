// Internal assessment workbook in the department's format (e.g. "IV sem CSEA internal marks
// upload"): Namelist, one sheet per course laid out from its CIA scheme — raw marks as
// written, scaled columns, CIA totals, special test, total internal and internal, all as Excel
// formulas — and the CIA-I / CIA-II upload sheets (Format No. 16a) with the class analysis.
import type ExcelJS from 'exceljs'
import { band, put, formula, ref, newWorkbook, sheetName, roman, sectionParts } from './common'
import { computeInternal, examType, SP_KEY, SP_MAX, type Scheme, type Comp, type MarkRow } from '@/lib/cia-scheme'

export type IaStudent = { id: string; roll: string; reg: string; name: string }
export type IaCourse = {
  code: string; name: string; short: string; kindLabel: string; faculty: string
  scheme: Scheme
  marks: Map<string, MarkRow[]>          // student id → mark rows
}
export type IaClass = { section: string; semester: number; batch: string; advisor: string; termLabel: string; students: IaStudent[]; courses: IaCourse[] }

const YELLOW = 'FFFFF2CC', LILAC = 'FFD9D2E9', GREEN = 'FFB7E1CD'
const FIRST_ROW = 8                       // first student row of a course sheet
// the same tiny tolerance as the app's engine, so 56.4999… (floating point for 56.5) rounds like 56.5
const rnd = (x: string, mode?: 'round' | 'up') => mode === 'up' ? `ROUNDUP(${x}-0.000000001,0)` : mode === 'round' ? `ROUND(${x}+0.000000001,0)` : x

type Layout = {
  total: Record<string, Record<1 | 2, number>>    // part → CIA → column of its total
  weights: Record<string, Record<1 | 2, number>>
  sp: number | null
  partCols: Record<string, number>                // part → column of its internal
  internalCol: number
}

function courseSheet(wb: ExcelJS.Workbook, k: IaClass, c: IaCourse, used: Set<string>): { name: string; layout: Layout } {
  const name = sheetName(c.short || c.code, used)
  const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const s = c.scheme, multi = s.parts.length > 1
  ;[5.2, 11, 17.8, 29.4].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  band(ws, 1, 2, 1, 6, `Subject Name: ${c.name} (${c.kindLabel})`, { bold: true, border: null })
  band(ws, 2, 2, 2, 4, `Subject Code: ${c.code}`, { bold: true, border: null })
  put(ws, 2, 7, 'Note: Mark "AB" for absent in CT and CAT', { size: 14, bold: true, color: 'FFFF0000', border: null })
  band(ws, 3, 2, 3, 4, `Faculty: ${c.faculty}`, { bold: true, border: null })
  ;['Sl.No', 'Roll No', 'Register No', 'Name'].forEach((t, i) => put(ws, 7, i + 1, t, { bold: true, h: 'center' }))
  k.students.forEach((st, i) => {
    const r = FIRST_ROW + i
    put(ws, r, 1, i + 1, { h: 'center' }); put(ws, r, 2, st.roll, { h: 'center' })
    put(ws, r, 3, st.reg ? Number(st.reg) || st.reg : '', { h: 'center', fmt: '0' }); put(ws, r, 4, st.name)
  })
  let colNo = 5
  const head = (label: string, max: number | string, tint: string, w = 7.6) => {
    const cc = colNo++
    ws.getColumn(cc).width = w
    put(ws, 6, cc, label, { size: 9, bold: true, h: 'center', fill: tint }); put(ws, 7, cc, `[${max}]`, { size: 9, bold: true, h: 'center', fill: tint })
    return cc
  }
  const layout: Layout = { total: {}, weights: {}, sp: null, partCols: {}, internalCol: 0 }
  const spCol = s.sp !== false ? -1 : null     // placed after the CIAs; referenced by CAT formulas
  const catCells: { col: number; w: number; max: number; round?: 'round' | 'up'; target: number }[] = []
  const markOf = (st: IaStudent, t: string) => c.marks.get(st.id)?.find(m => m.exam_type === t)

  for (const cia of [1, 2] as const) {
    const comps = s.comps.filter(x => x.cia === cia)
    if (!comps.length) continue
    const g0 = colNo
    // raw marks as written
    const raw = new Map<Comp, number>()
    for (const x of comps) {
      const cc = head(`${x.label}${x.key === 'CT' || x.key === 'CAT' ? cia : ''}`, x.max, YELLOW)
      raw.set(x, cc)
      k.students.forEach((st, i) => {
        const m = markOf(st, examType(x))
        put(ws, FIRST_ROW + i, cc, m ? (m.absent ? 'AB' : Number(m.marks_obtained)) : null, { h: 'center', fill: cia === 2 ? GREEN : undefined })
      })
    }
    // scaled columns (weight ≠ out of), pooled groups, and the part totals
    for (const p of s.parts) {
      const pc = comps.filter(x => x.part === p.key && x.weight > 0)
      if (!pc.length) continue
      const contrib: number[] = []
      const pools = new Map<string, Comp[]>()
      for (const x of pc) pools.set(x.pool || x.key, [...(pools.get(x.pool || x.key) ?? []), x])
      for (const group of pools.values()) {
        const w = group.reduce((a, x) => a + x.weight, 0)
        if (group.length === 1 && group[0].weight === group[0].max && group[0].key !== 'CAT') { contrib.push(raw.get(group[0])!); continue }
        const label = group.map(x => x.label).join('+')
        const cc = head(label, w, LILAC)
        contrib.push(cc)
        k.students.forEach((_, i) => {
          const r = FIRST_ROW + i
          if (group.length === 1) {
            const x = group[0], src = ref(r, raw.get(x)!)
            const scaled = rnd(`${src}/${x.max}*${x.weight}`, x.round)
            if (x.key === 'CAT' && spCol !== null) catCells.push({ col: cc, w: x.weight, max: x.max, round: x.round, target: r })
            put(ws, r, cc, formula(`IF(${src}="AB",0,${scaled})`), { size: 10, h: 'center' })
          } else {
            const sum = group.map(x => `N(${ref(r, raw.get(x)!)})`).join('+'), max = group.reduce((a, x) => a + x.max, 0)
            put(ws, r, cc, formula(`(${sum})/${max}*${w}`), { size: 10, h: 'center' })
          }
        })
      }
      const tc = head(multi ? `Total-${p.key}` : 'Total', pc.reduce((a, x) => a + x.weight, 0), YELLOW)
      k.students.forEach((_, i) => put(ws, FIRST_ROW + i, tc, formula(`SUM(${contrib.map(x => ref(FIRST_ROW + i, x)).join(',')})`), { size: 10, h: 'center' }))
      ;(layout.total[p.key] ??= {} as Record<1 | 2, number>)[cia] = tc
      ;(layout.weights[p.key] ??= {} as Record<1 | 2, number>)[cia] = pc.reduce((a, x) => a + x.weight, 0)
    }
    band(ws, 5, g0, 5, colNo - 1, `Continuous Internal Assessment-${cia}`, { size: 9, bold: true, h: 'center', fill: YELLOW })
    colNo++                                         // gap column, as in the sheets
  }
  // special test: replaces an absent CAT (the scaled CAT columns read it)
  if (spCol !== null) {
    const sc = colNo++; ws.getColumn(sc).width = 8.9; colNo++
    band(ws, 5, sc, 6, sc, 'SP', { size: 9, bold: true, h: 'center', fill: YELLOW }); put(ws, 7, sc, `[${SP_MAX}]`, { size: 9, bold: true, h: 'center', fill: LILAC })
    layout.sp = sc
    k.students.forEach((st, i) => { const m = markOf(st, SP_KEY); put(ws, FIRST_ROW + i, sc, m ? Number(m.marks_obtained) : null, { size: 10, h: 'center', fill: GREEN }) })
    for (const x of catCells) {
      const r = x.target, cell = ws.getCell(r, x.col)
      const f = (cell.value as { formula: string }).formula
      cell.value = formula(f.replace(/^IF\(([A-Z]+\d+)="AB",0,/, `IF($1="AB",IF(${ref(r, sc)}="",0,${rnd(`${ref(r, sc)}/${SP_MAX}*${x.w}`, x.round)}),`))
    }
  }
  // CIA totals, total internal, internal
  const summary = (label: string, max: number | string) => { const cc = colNo++; ws.getColumn(cc).width = 9; band(ws, 5, cc, 6, cc, label, { size: 9, bold: true, h: 'center', fill: YELLOW }); put(ws, 7, cc, `[${max}]`, { size: 9, bold: true, h: 'center', fill: LILAC }); return cc }
  const partFormula = (p: Scheme['parts'][number], r: number) => {
    const t = layout.total[p.key] ?? {}, w = layout.weights[p.key] ?? {}
    const cells = ([1, 2] as const).filter(c2 => t[c2]).map(c2 => ref(r, t[c2]))
    const W = ([1, 2] as const).reduce((a, c2) => a + (w[c2] ?? 0), 0)
    const pct = `SUM(${cells.join(',')})/${W}*100`
    return rnd(`${p.steps ? rnd(pct, s.rounding ?? 'round') : pct}/100*${p.out_of}`, s.rounding ?? 'round')
  }
  for (const p of s.parts) {
    const t = layout.total[p.key] ?? {}
    for (const c2 of [1, 2] as const) if (t[c2]) {
      const cc = summary(`CIA-${'I'.repeat(c2)}${multi ? ` ${p.label}` : ''}`, layout.weights[p.key][c2])
      k.students.forEach((_, i) => put(ws, FIRST_ROW + i, cc, formula(`${ref(FIRST_ROW + i, t[c2])}`), { size: 10, h: 'center' }))
    }
    if (!multi) {
      const W = ([1, 2] as const).reduce((a, c2) => a + (layout.weights[p.key]?.[c2] ?? 0), 0)
      const cc = summary('Total Internal', 100)
      k.students.forEach((_, i) => put(ws, FIRST_ROW + i, cc, formula(`ROUND(SUM(${([1, 2] as const).filter(c2 => t[c2]).map(c2 => ref(FIRST_ROW + i, t[c2])).join(',')})/${W}*100,0)`), { size: 10, h: 'center' }))
    }
    const pcCol = summary(multi ? `${p.label}(${p.out_of})` : 'Internal', p.out_of)
    layout.partCols[p.key] = pcCol
    k.students.forEach((st, i) => {
      const r = FIRST_ROW + i, res = computeInternal(s, c.marks.get(st.id) ?? [])
      put(ws, r, pcCol, formula(partFormula(p, r), res.parts.find(x => x.key === p.key)?.value ?? null), { size: 10, h: 'center', bold: !multi })
    })
  }
  if (multi) {
    const cc = summary('Internal', s.parts.reduce((a, p) => a + p.out_of, 0))
    k.students.forEach((st, i) => put(ws, FIRST_ROW + i, cc, formula(`SUM(${s.parts.map(p => ref(FIRST_ROW + i, layout.partCols[p.key])).join(',')})`, computeInternal(s, c.marks.get(st.id) ?? []).internal), { size: 10, bold: true, h: 'center' }))
    layout.internalCol = cc
  } else layout.internalCol = layout.partCols[s.parts[0].key]
  ws.getRow(2).height = 29.25
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 7 }]
  return { name, layout }
}

function namelist(wb: ExcelJS.Workbook, k: IaClass) {
  const ws = wb.addWorksheet('Namelist')
  ;[6, 11, 15, 32].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const { year } = sectionParts(k.section)
  band(ws, 2, 1, 2, 7, 'Loyola-ICAM College of Engineering and Technology (LICET)', { size: 10, bold: true, h: 'center', border: null })
  band(ws, 4, 1, 4, 7, 'Department of Computer Science and Engineering', { size: 12, bold: true, color: 'FF980000', h: 'center', border: null })
  band(ws, 6, 1, 6, 7, `(YEAR/SEMESTER/BATCH) ${roman(year)} Yr / ${roman(k.semester)} Sem / ${k.batch} — ${k.section} — ${k.termLabel}`, { size: 12, bold: true, h: 'center', border: null })
  put(ws, 8, 1, `ClassAdvisor: ${k.advisor}`, { size: 12, bold: true, color: 'FF9900FF', border: null })
  ;['S.No', 'Roll No', 'Register No', 'Name'].forEach((t, i) => put(ws, 9, i + 1, t, { bold: true, h: 'center' }))
  k.students.forEach((s, i) => { put(ws, 10 + i, 1, i + 1, { h: 'center' }); put(ws, 10 + i, 2, s.roll, { h: 'center' }); put(ws, 10 + i, 3, s.reg ? Number(s.reg) || s.reg : '', { fmt: '0', h: 'center' }); put(ws, 10 + i, 4, s.name) })
}

function upload(wb: ExcelJS.Workbook, k: IaClass, cia: 1 | 2, sheets: { short: string; sheet: string; layout: Layout; scheme: Scheme }[]) {
  const ws = wb.addWorksheet(`Upload ${cia}`, { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const cols = sheets.filter(x => x.layout.total[x.scheme.parts[0].key]?.[cia])
  const n = cols.length, failCol = 4 + n
  ;[8.1, 13.1, 27.4].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let c = 4; c < failCol; c++) ws.getColumn(c).width = 8
  ws.getColumn(failCol).width = 9
  const right = Math.max(failCol, 6)
  band(ws, 1, 1, 5, 2, '', {})
  band(ws, 1, 3, 1, right - 2, 'LOYOLA-ICAM', { bold: true, h: 'center' })
  band(ws, 2, 3, 2, right - 2, 'College of Engineering and Technology (LICET)', { size: 12, bold: true, h: 'center', border: null })
  band(ws, 3, 3, 3, right - 2, '(Autonomous)', { size: 12, h: 'center', border: null })
  band(ws, 4, 3, 4, right - 2, 'Loyola Campus, Chennai - 600 034', { size: 12, h: 'center', border: null })
  band(ws, 5, 3, 5, right - 2, 'DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING', { size: 10, bold: true, h: 'center', border: null })
  band(ws, 2, right - 1, 2, right, 'Format No.: 16a', { size: 10, bold: true, h: 'center', border: null })
  band(ws, 4, right - 1, 4, right, 'Revision No.: 01', { size: 10, bold: true, h: 'center', border: null })
  band(ws, 6, 1, 6, right, `CIA - ${'I'.repeat(cia)} MARK SHEET`, { size: 12, bold: true, h: 'center', border: null })
  const { year, letter } = sectionParts(k.section)
  band(ws, 7, 1, 7, 2, `Year/Sem: ${roman(year)} - ${roman(k.semester)}/${letter}`, { size: 12, bold: true, border: null })
  band(ws, 8, 1, 8, 2, `Batch: ${k.batch}`, { size: 12, bold: true, border: null })
  band(ws, 8, 4, 8, right, `Class Advisor : ${k.advisor}`, { size: 12, bold: true, h: 'right', border: null })
  ;['S.No.', 'Register No.', 'NAMES'].forEach((t, i) => put(ws, 9, i + 1, t, { bold: true, h: 'center', wrap: true }))
  cols.forEach((x, j) => put(ws, 9, 4 + j, `${x.short} (100)`, { size: 9, bold: true, h: 'center', wrap: true }))
  put(ws, 9, failCol, 'No. of Sub. Failed', { size: 9, bold: true, h: 'center', wrap: true })
  ws.getRow(9).height = 30
  const first = 10, last = first + k.students.length - 1
  k.students.forEach((s, i) => {
    const r = first + i, src = FIRST_ROW + i
    put(ws, r, 1, i + 1, { h: 'center' }); put(ws, r, 2, s.reg ? Number(s.reg) || s.reg : '', { fmt: '0', h: 'center' }); put(ws, r, 3, s.name)
    cols.forEach((x, j) => {
      const p = x.scheme.parts[0].key, W = x.layout.weights[p][cia]
      put(ws, r, 4 + j, formula(`ROUND('${x.sheet}'!${ref(src, x.layout.total[p][cia])}/${W}*100,0)`), { h: 'center' })
    })
    if (n) put(ws, r, failCol, formula(`COUNTIF(${ref(r, 4)}:${ref(r, failCol - 1)},"<50")`), { h: 'center' })
  })
  const rows: [string, (c: string) => string][] = [
    ['No. of Students', () => String(k.students.length)],
    ['No. of Students Absent', c => `COUNTIF(${c}${first}:${c}${last},"AB")`],
    ['No. of Students Present', c => `${c}${last + 2}-${c}${last + 3}`],
    ['No. of Students Passed', c => `COUNTIF(${c}${first}:${c}${last},">=50")`],
    ['No. of Students Failed', c => `COUNTIF(${c}${first}:${c}${last},"<50")`],
    ['Pass Percentage', c => `IF(${c}${last + 4}=0,0,ROUND(${c}${last + 5}/${c}${last + 4}*100,1))`],
    ['Highest Mark', c => `MAX(${c}${first}:${c}${last})`],
  ]
  rows.forEach(([label, f], i) => {
    const r = last + 2 + i
    band(ws, r, 2, r, 3, label, { bold: true })
    cols.forEach((_, j) => { const cl = String.fromCharCode(68 + j); put(ws, r, 4 + j, label === 'No. of Students' ? k.students.length : formula(f(cl)), { h: 'center' }) })
  })
  const sig = last + 2 + rows.length
  band(ws, sig, 2, sig, 3, 'Staff Signature', { bold: true })
  cols.forEach((_, j) => put(ws, sig, 4 + j, null, {}))
  const fc = String.fromCharCode(67 + n + 1)
  band(ws, sig + 2, 2, sig + 2, 3, 'No. of All Clear Students :', { bold: true, border: null })
  put(ws, sig + 2, 4, formula(`COUNTIF(${fc}${first}:${fc}${last},"=0")`), { border: null })
  band(ws, sig + 3, 2, sig + 3, 3, 'Class Pass Percentage :', { bold: true, border: null })
  put(ws, sig + 3, 4, formula(`IF(COUNT(${fc}${first}:${fc}${last})=0,0,ROUND(${ref(sig + 2, 4)}/COUNT(${fc}${first}:${fc}${last})*100,1))`), { border: null })
  band(ws, sig + 5, 3, sig + 6, 3, 'No.of failures in subjects', { bold: true })
  for (let f = 1; f <= Math.max(1, Math.min(n, 8)); f++) {
    put(ws, sig + 5, 3 + f, f, { bold: true, h: 'center' })
    put(ws, sig + 6, 3 + f, formula(`COUNTIF($${fc}$${first}:$${fc}$${last},"=${f}")`), { h: 'center' })
  }
}

/** One class's IA workbook (or a single course: pass one course). */
export async function iaWorkbook(k: IaClass) {
  const wb = await newWorkbook()
  const used = new Set<string>(['namelist', 'upload 1', 'upload 2'])
  namelist(wb, k)
  const sheets = k.courses.map(c => { const { name, layout } = courseSheet(wb, k, c, used); return { short: c.short || c.code, sheet: name, layout, scheme: c.scheme } })
  upload(wb, k, 1, sheets)
  if (sheets.some(x => x.layout.total[x.scheme.parts[0].key]?.[2])) upload(wb, k, 2, sheets)
  return wb
}
