// Shared pieces of the department's Excel formats (built with ExcelJS so fonts, fills,
// borders and merged headers match the workbooks the department already uses).
import type ExcelJS from 'exceljs'

export type Cell = ExcelJS.Cell
export const thin: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
export const medium: Partial<ExcelJS.Borders> = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }
export const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

export type Style = {
  size?: number; bold?: boolean; color?: string; fill?: string; border?: Partial<ExcelJS.Borders> | null; h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle'; wrap?: boolean; fmt?: string
}
/** Write one cell: value (or formula with its computed result) and style. */
export function put(ws: ExcelJS.Worksheet, row: number, col: number, value: unknown, style: Style = {}) {
  const c = ws.getCell(row, col)
  if (value !== undefined && value !== null && value !== '') c.value = value as ExcelJS.CellValue
  c.font = { name: 'Calibri', size: style.size ?? 11, bold: !!style.bold, ...(style.color ? { color: { argb: style.color } } : {}) }
  if (style.fill) c.fill = fill(style.fill)
  if (style.border !== null) c.border = style.border ?? thin
  c.alignment = { horizontal: style.h, vertical: style.v ?? 'middle', wrapText: style.wrap ?? false }
  if (style.fmt) c.numFmt = style.fmt
  return c
}
/** Merge a range and style its first cell (borders on every cell of the range). */
export function band(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, value: unknown, style: Style = {}) {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(ws, r, c, null, { ...style })
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2)
  return put(ws, r1, c1, value, style)
}
export const formula = (f: string, result?: number | string | null) => ({ formula: f.replace(/^=/, ''), ...(result !== undefined && result !== null ? { result } : {}) })

/** Column letters (1 → A). */
export const col = (n: number): string => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
export const ref = (r: number, c: number) => `${col(c)}${r}`

/** Excel sheet names: ≤31 characters, none of []:*?/\ */
export const sheetName = (s: string, used: Set<string>) => {
  const base = s.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let n = 2, name = base
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${n++}`
  used.add(name.toLowerCase()); return name
}

export async function newWorkbook() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'LICET Things'; wb.created = new Date()
  return wb
}
export async function download(wb: ExcelJS.Workbook, file: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = file; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
export const roman = (n: number) => ROMAN[n] ?? String(n)
/** "II CSE-A" → { year: 2, letter: 'A' } */
export const sectionParts = (s: string) => ({ year: ({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[s.split(' ')[0]] ?? 0, letter: s.slice(-1) })
