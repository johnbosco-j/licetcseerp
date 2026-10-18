// Attendance register in the department's format (CSE.xlsx): one sheet per class, a block per
// week (Monday–Saturday), each day a merged date and day order over its period columns; 1 =
// present, 0 = absent, 2 = on duty; running totals and the absentee count per hour.
import type ExcelJS from 'exceljs'
import { band, put, newWorkbook, sheetName, medium } from './common'

export type RegisterStudent = { id: string; roll: string; reg: string; name: string }
export type RegisterClass = {
  section: string                 // "II CSE-A"
  batch: string                   // "2025 - 2029"
  room?: string | null
  advisors?: string | null
  students: RegisterStudent[]
  /** working days in the range, with the timetable day they follow ("MON") */
  days: { date: string; dayOrder: string }[]
  periods: number                 // 8 (IV year 9)
  /** 1 present, 0 absent, 2 on duty, null = no class that hour */
  mark: (studentId: string, date: string, period: number) => 0 | 1 | 2 | null
}

// day colours of the department register (header, cells)
const DAY_COLOURS: Record<string, [string, string | null]> = {
  MON: ['FF00FFFF', 'FF66FFCC'], TUE: ['FF7B7B7B', 'FFC8C8C8'], WED: ['FFFFFFFF', null],
  THU: ['FFF4B183', 'FFF7CAAC'], FRI: ['FF5B9BD5', 'FF9CC2E5'], SAT: ['FF00FFFF', 'FF66FFCC'],
}
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const dmy = (iso: string) => `${+iso.slice(8, 10)}.${+iso.slice(5, 7)}.${iso.slice(2, 4)}`
const monday = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10) }
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

function addClassSheet(wb: ExcelJS.Workbook, k: RegisterClass, used: Set<string>) {
  const ws = wb.addWorksheet(sheetName(k.section, used), { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const P = k.periods, FIRST = 6, DAYS = 6
  const totCol = FIRST + DAYS * P                      // present, on duty, worked, %
  ws.getColumn(1).width = 2; ws.getColumn(2).width = 5.1; ws.getColumn(3).width = 9.1; ws.getColumn(4).width = 13.7; ws.getColumn(5).width = 29.1
  for (let c = FIRST; c < totCol; c++) ws.getColumn(c).width = 3.2
  ;[6.4, 6.4, 6.4, 7.4].forEach((w, i) => { ws.getColumn(totCol + i).width = w })
  const yearName = k.section.split(' ')[0]
  const classLine = `${yearName} - CSE ${k.section.slice(-1)} ( ${k.batch} Batch )`

  // weeks covering the days
  const weeks = [...new Set(k.days.map(d => monday(d.date)))].sort()
  const byDate = new Map(k.days.map(d => [d.date, d.dayOrder]))
  const tot = new Map(k.students.map(s => [s.id, { p: 0, od: 0, w: 0 }]))
  let r = 1
  for (const wk of weeks) {
    const start = r + 1
    band(ws, start, 2, start, totCol + 3, 'DEPARTMENT OF CSE', { size: 18, bold: true, color: 'FFFFFFFF', fill: 'FF548135', h: 'center', border: medium })
    band(ws, start + 1, 2, start + 1, totCol + 3, classLine, { size: 14, bold: true, fill: 'FFA8D08D', h: 'center', border: medium })
    band(ws, start + 2, 2, start + 2, totCol + 3, `Class Room : ${k.room ?? ''}`, { size: 12, bold: true, border: medium })
    band(ws, start + 3, 2, start + 3, totCol + 3, `Class Advisors: ${k.advisors ?? ''}`, { size: 12, bold: true, border: medium })
    for (let i = 0; i < 4; i++) ws.getRow(start + i).height = 24.75
    const h1 = start + 4, h2 = start + 5, h3 = start + 6
    band(ws, h1, 2, h1, 4, 'STUDENTS ATTENDANCE', { bold: true, h: 'center' })
    put(ws, h1, 5, 'DATE', { size: 12, bold: true, h: 'center' })
    const firstDay = k.days.find(d => monday(d.date) === wk)?.date ?? wk
    band(ws, h2, 2, h2, 4, `${MONTHS[+firstDay.slice(5, 7) - 1]} ' ${firstDay.slice(0, 4)}`, { size: 12, bold: true, h: 'center' })
    put(ws, h2, 5, 'DAY ORDER', { bold: true, h: 'center' })
    ;['S.NO', 'ROLL NO', 'REG NO', 'NAME'].forEach((t, i) => put(ws, h3, 2 + i, t, { size: 10, bold: true, h: 'center', fill: i ? 'FFFFFFFF' : undefined }))
    const absentees = new Array(DAYS * P).fill(0)
    for (let d = 0; d < DAYS; d++) {
      const date = addDays(wk, d), c0 = FIRST + d * P
      const order = byDate.get(date)
      const [hd, cell] = DAY_COLOURS[order ?? ''] ?? ['FFFFFFFF', null]
      band(ws, h1, c0, h1, c0 + P - 1, order ? dmy(date) : '', { bold: true, h: 'center' })
      band(ws, h2, c0, h2, c0 + P - 1, order ?? (date >= (k.days[0]?.date ?? '') && date <= (k.days.at(-1)?.date ?? '') && d < 5 ? 'HOLIDAY' : ''), { size: 12, bold: true, h: 'center', fill: order ? hd : undefined })
      for (let p = 1; p <= P; p++) {
        put(ws, h3, c0 + p - 1, p, { size: 10, bold: true, h: 'center' })
        k.students.forEach((s, i) => {
          const v = order ? k.mark(s.id, date, p) : null
          const t = tot.get(s.id)!
          if (v !== null) { t.w++; if (v === 1) t.p++; if (v === 2) t.od++; if (v === 0) absentees[d * P + p - 1]++ }
          put(ws, h3 + 1 + i, c0 + p - 1, v, { size: 9, bold: true, h: 'center', fill: cell ?? undefined, color: v === 0 ? 'FFC00000' : undefined })
        })
      }
    }
    ;[['Total No', 'of Hours', 'Present'], ['Total No', 'of Hours', 'On duty'], ['Total No', 'of Hours', 'Worked']].forEach((t, i) => {
      put(ws, h1, totCol + i, t[0], { size: 7, h: 'center' }); put(ws, h2, totCol + i, t[1], { size: 7, h: 'center' }); put(ws, h3, totCol + i, t[2], { size: 7, h: 'center' })
    })
    band(ws, h1, totCol + 3, h3, totCol + 3, '%', { size: 14, bold: true, h: 'center' })
    k.students.forEach((s, i) => {
      const row = h3 + 1 + i, t = tot.get(s.id)!
      put(ws, row, 2, i + 1, { h: 'center' }); put(ws, row, 3, s.roll, { h: 'center' }); put(ws, row, 4, s.reg ? Number(s.reg) || s.reg : '', { fmt: '0' }); put(ws, row, 5, s.name)
      put(ws, row, totCol, t.p, { size: 9, h: 'center' }); put(ws, row, totCol + 1, t.od, { size: 9, h: 'center' }); put(ws, row, totCol + 2, t.w, { size: 9, h: 'center' })
      put(ws, row, totCol + 3, t.w ? Math.round((t.p + t.od) / t.w * 100) : '', { size: 9, h: 'center' })
      ws.getRow(row).height = 15
    })
    const totalRow = h3 + 1 + k.students.length + 1
    band(ws, totalRow, 2, totalRow, 5, 'TOTAL NO OF ABSENTEES', { bold: true })
    absentees.forEach((n, i) => put(ws, totalRow, FIRST + i, n, { size: 9, bold: true, h: 'center' }))
    for (const row of [h1, h2, h3]) ws.getRow(row).height = 24.75
    r = totalRow + 2
  }
  if (!weeks.length) put(ws, 2, 2, `No class hours recorded for ${k.section} in this period.`, { border: null })
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 0 }]
}

export async function registerWorkbook(classes: RegisterClass[]) {
  const wb = await newWorkbook()
  const used = new Set<string>()
  for (const k of classes) addClassSheet(wb, k, used)
  return wb
}
