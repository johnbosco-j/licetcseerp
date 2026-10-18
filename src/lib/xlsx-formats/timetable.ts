// Class timetable in the college format (Format No. 8a, e.g. "FY CLASS TT"): header, the week
// grid with the break and lunch columns, the course–faculty list, and the signature line.
import type ExcelJS from 'exceljs'
import { band, put, newWorkbook, sheetName, roman, sectionParts } from './common'

export type TtSlot = { period_no: number; starts_at: string; ends_at: string }
export type TtClass = {
  section: string; semester: number; academicYear: string; parity: 'ODD' | 'EVEN'
  venue?: string | null; advisors?: string | null; wef?: string | null
  slots: TtSlot[]                                   // period timings
  /** text of each day × period ("PIS [PH24201]", "CP Lab [CS24221]") */
  grid: Record<number, Record<number, string>>      // day order (1 = MON) → period → text
  courses: { code: string; name: string; faculty: string }[]
  chairperson?: string | null
}

const DAY = ['', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT']
const t12 = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}` }

function addSheet(wb: ExcelJS.Workbook, k: TtClass, used: Set<string>) {
  const ws = wb.addWorksheet(sheetName(k.section.replace(/\s/g, ''), used), { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } })
  const slots = [...k.slots].sort((a, b) => a.period_no - b.period_no).filter(s => s.period_no <= 9)
  // break / lunch: a gap of 10+ minutes between consecutive periods gets its own column
  type ColDef = { kind: 'period'; slot: TtSlot } | { kind: 'gap'; label: string; from: string; to: string }
  const defs: ColDef[] = []
  slots.forEach((s, i) => {
    if (i > 0) {
      const prev = slots[i - 1]
      const gap = (Date.parse(`1970-01-01T${s.starts_at}`) - Date.parse(`1970-01-01T${prev.ends_at}`)) / 60000
      if (gap >= 10) defs.push({ kind: 'gap', label: gap >= 40 ? 'L U N C H' : 'B R E A K', from: prev.ends_at, to: s.starts_at })
    }
    defs.push({ kind: 'period', slot: s })
  })
  const C0 = 2, last = C0 + defs.length - 1
  ws.getColumn(1).width = 11
  defs.forEach((d, i) => { ws.getColumn(C0 + i).width = d.kind === 'gap' ? 7.5 : 15 })
  const { year, letter } = sectionParts(k.section)
  const [y1, y2] = k.academicYear.split('-')
  band(ws, 2, 2, 5, last - 2, `Loyola-ICAM\nCOLLEGE OF ENGINEERING AND TECHNOLOGY (LICET) (Autonomous)\nLoyola Campus, Nungambakkam, Chennai-600034\nCLASS TIME TABLE ACADEMIC YEAR: ${y1} – ${(y2 ?? '').slice(-2)} (${k.parity} SEMESTER)`,
    { size: 10, bold: true, h: 'center', wrap: true })
  band(ws, 2, last - 1, 5, last, 'Format No. : 8a\nRevision No.: 0', { size: 12, h: 'center', wrap: true })
  for (let r = 2; r <= 5; r++) ws.getRow(r).height = 18
  put(ws, 7, 1, `Year: ${roman(year)}`, { size: 9, bold: true }); put(ws, 7, 2, `Sem: ${roman(k.semester)}`, { size: 9, bold: true })
  put(ws, 7, 3, `Dept: CSE ${letter}`, { size: 9, bold: true }); put(ws, 7, 4, 'Venue:', { size: 9, bold: true }); put(ws, 7, 5, k.venue ?? '', { size: 10, bold: true })
  put(ws, 7, 6, 'Class Advisor', { size: 9, bold: true })
  band(ws, 7, 7, 8, Math.max(7, last - 2), k.advisors ?? '', { size: 9, bold: true, wrap: true })
  band(ws, 7, last - 1, 8, last, `WEF: ${k.wef ?? ''}`, { size: 9, bold: true })
  band(ws, 9, 1, 10, 1, 'HOUR /\nDAY', { size: 9, h: 'center', wrap: true })
  defs.forEach((d, i) => {
    const c = C0 + i
    if (d.kind === 'gap') band(ws, 9, c, 10, c, `${t12(d.from)}\n– ${t12(d.to)}`, { size: 9, h: 'center', wrap: true })
    else { put(ws, 9, c, d.slot.period_no, { size: 9, h: 'center' }); put(ws, 10, c, `${t12(d.slot.starts_at)}-${t12(d.slot.ends_at)}`, { size: 9, h: 'center', wrap: true }) }
  })
  ws.getRow(10).height = 31.5
  const days = [1, 2, 3, 4, 5, 6].filter(d => d <= 5 || Object.keys(k.grid[d] ?? {}).length)
  const R0 = 11
  days.forEach((d, i) => {
    const r = R0 + i
    put(ws, r, 1, DAY[d], { size: 10, bold: true, h: 'center' })
    ws.getRow(r).height = 30
    // consecutive periods with the same text are merged (a lab block)
    let i2 = 0
    while (i2 < defs.length) {
      const def = defs[i2]
      if (def.kind === 'gap') { i2++; continue }
      const text = k.grid[d]?.[def.slot.period_no] ?? ''
      let j = i2
      while (j + 1 < defs.length && defs[j + 1].kind === 'period' && text && (k.grid[d]?.[(defs[j + 1] as { slot: TtSlot }).slot.period_no] ?? '') === text) j++
      band(ws, r, C0 + i2, r, C0 + j, text, { size: 9, h: 'center', wrap: true })
      i2 = j + 1
    }
  })
  defs.forEach((d, i) => { if (d.kind === 'gap') band(ws, R0, C0 + i, R0 + days.length - 1, C0 + i, d.label, { size: 10, h: 'center', wrap: true, fill: 'FFFFFFFF' }) })
  // course list, two per row
  let r = R0 + days.length + 1
  const half = Math.ceil(defs.length / 2)
  const L = [1, 2, 4], R = [C0 + half - 1, C0 + half, C0 + half + 2]
  const headRow = (cols: number[]) => { put(ws, r, cols[0], 'Course Code', { size: 10, bold: true }); band(ws, r, cols[1], r, cols[2] - 1, 'Course', { size: 10, bold: true }); band(ws, r, cols[2], r, cols[2] + 1, 'Faculty', { size: 10, bold: true }) }
  headRow(L); headRow(R); r++
  for (let i = 0; i < k.courses.length; i += 2) {
    ;[k.courses[i], k.courses[i + 1]].forEach((c, j) => {
      if (!c) return
      const cols = j ? R : L
      put(ws, r, cols[0], c.code, { size: 11 }); band(ws, r, cols[1], r, cols[2] - 1, c.name, { size: 11, wrap: true }); band(ws, r, cols[2], r, cols[2] + 1, c.faculty, { size: 11, wrap: true })
    })
    ws.getRow(r).height = 30; r++
  }
  band(ws, r, 1, r, 3, 'Class Committee Chairperson', { size: 11 }); band(ws, r, 4, r, 5, k.chairperson ?? '', { size: 11 })
  r += 3
  const sigs = ['FACULTY IN CHARGE', 'TIME TABLE COORDINATOR', 'HOD', 'VICE PRINCIPAL', 'PRINCIPAL']
  const step = Math.max(2, Math.floor((last) / sigs.length))
  sigs.forEach((s, i) => put(ws, r, 1 + i * step, s, { size: 12, bold: true, border: null }))
}

export async function timetableWorkbook(classes: TtClass[]) {
  const wb = await newWorkbook()
  const used = new Set<string>()
  for (const k of classes) addSheet(wb, k, used)
  return wb
}
