// Reads LICET's academic-calendar workbook (one sheet per month) into calendar days.
//
// Layout of each month sheet (as issued by the college):
//   row 1  : a date in that month (e.g. 2026-07-01)
//   rows 2–3: headings — DATE | DAY | COMMON EVENTS | ACADEMIC EVENTS (FY | HS) | NO. OF WORKING DAYS (FY | HS)
//   then one row per date: day number | weekday | common | FY events | HS events | FY count | HS count
// A working day has a number in the count column. The HS column may read "16/1"
// (II–III year day 16 / IV year day 1) and IV year may have codes like "TT15"
// (training days, not regular classes). "Day Order: Monday" means that date follows
// Monday's timetable.

import * as XLSX from "xlsx"

export interface ImportedDay { date: string; scope: 'FY' | 'HS' | 'IV'; is_working: boolean; day_order: number | null; label: string | null }

const ORDER: Record<string, number> = { mon: 1, tues: 2, wednes: 3, thurs: 4, fri: 5, satur: 6 }
const dayOrderIn = (text: string) => {
  const m = text.match(/Day\s*Order\s*:?\s*(Mon|Tues|Wednes|Thurs|Fri|Satur)/i)
  return m ? ORDER[m[1].toLowerCase()] : null
}
const isNum = (v: string) => /^\d+(\.0)?$/.test(v.trim())
const pad = (n: number) => String(n).padStart(2, '0')

export function parseCalendarWorkbook(buf: ArrayBuffer): { days: ImportedDay[]; months: string[] } {
  const wb = XLSX.read(buf, { cellDates: true })
  const days: ImportedDay[] = []
  const months: string[] = []
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
    // The sheet name ("Jan 2026") is exact. The date in A1 is midnight India time, which
    // is the previous day in UTC — so if the name is unusual, read A1 shifted by 12 hours.
    const first = rows[0]?.[0]
    let year = 0, month = 0
    const m = name.match(/([A-Za-z]{3})\w*\s+(\d{4})/)
    if (m) {
      month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1
      year = Number(m[2])
    }
    if (!month && first instanceof Date) {
      const d = new Date(first.getTime() + 12 * 3600 * 1000)
      year = d.getUTCFullYear(); month = d.getUTCMonth() + 1
    }
    if (!month) continue
    months.push(`${year}-${pad(month)}`)
    for (const r of rows.slice(3)) {
      const dn = r?.[0]
      if (typeof dn !== 'number' || dn < 1 || dn > 31) continue
      const date = `${year}-${pad(month)}-${pad(dn)}`
      const wd = new Date(date + 'T00:00:00').getDay() || 7
      const [common, fy, hs, cfy, chs] = [2, 3, 4, 5, 6].map(i => (r[i] === null || r[i] === undefined ? '' : String(r[i]).trim()))
      const hsParts = chs.includes('/') ? chs.split('/').map(x => x.trim()) : [chs, chs]
      const scopes: [ImportedDay['scope'], string, string][] = [['FY', cfy, fy], ['HS', hsParts[0], hs], ['IV', hsParts[1], hs]]
      for (const [scope, count, text] of scopes) {
        const working = isNum(count)
        const order = dayOrderIn(text) ?? dayOrderIn(common) ?? (wd <= 6 ? wd : null)
        let label = [common, text].filter(Boolean).join(' / ')
        if (count && !working) label = label ? `${label} / ${count}` : count
        days.push({ date, scope, is_working: working, day_order: working ? order : null, label: label.slice(0, 300) || null })
      }
    }
  }
  return { days, months }
}
