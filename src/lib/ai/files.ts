// Files attached to LICET AI (staff only). Spreadsheets and Word files become text here;
// PDFs and pictures (e.g. a photo of a marks sheet) go to the model as they are.
import * as XLSX from 'xlsx'
import type { Block } from './llm'

export type Attachment = { name: string; type: string; data: string /* base64 */ }
export const MAX_FILE_BYTES = 2_500_000
const MAX_TEXT = 60_000

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? ''
const IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

const cut = (s: string) => s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + `\n…(cut: the file is longer than ${MAX_TEXT} characters; attach one sheet or a smaller part)` : s
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Text of a .docx: paragraphs on their own lines, table rows as "cell | cell". */
export function docxText(buf: Buffer): string {
  const zip = XLSX.CFB.read(buf, { type: 'buffer' })
  const i = zip.FullPaths.findIndex((p: string) => /word\/document\.xml$/.test(p))
  if (i < 0) throw new Error('Not a Word document')
  const xml = Buffer.from(zip.FileIndex[i].content as Uint8Array).toString('utf8')
  return decode(xml
    .replace(/<w:tc[ >][\s\S]*?<\/w:tc>/g, cell => cell.replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + ' | ')
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')).trim()
}

/** Text of a workbook: each sheet as CSV, empty rows dropped. */
export function sheetText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, sheetRows: 3000 })
  return wb.SheetNames.map(n => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false, strip: true })
    return `### Sheet "${n}"\n${csv.split('\n').filter(l => l.replace(/,/g, '').trim()).join('\n')}`
  }).join('\n\n')
}

/** One attachment → the blocks the model reads. Throws a message the user can act on. */
export function fileBlocks(f: Attachment): Block[] {
  const name = String(f.name ?? 'file').slice(0, 120)
  const buf = Buffer.from(String(f.data ?? ''), 'base64')
  if (!buf.length) throw new Error(`${name} is empty`)
  if (buf.length > MAX_FILE_BYTES) throw new Error(`${name} is larger than 2.5 MB — attach a smaller file or one sheet`)
  const e = ext(name)
  const head = { type: 'text' as const, text: `[Attached file: ${name}]` }
  if (e === 'pdf') return [head, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }]
  if (IMAGE[e]) return [head, { type: 'image', source: { type: 'base64', media_type: IMAGE[e], data: buf.toString('base64') } }]
  let text: string
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(e)) text = sheetText(buf)
  else if (e === 'docx') text = docxText(buf)
  else if (['csv', 'tsv', 'txt', 'md', 'json'].includes(e)) text = buf.toString('utf8')
  else throw new Error(`${name}: this kind of file cannot be read (use Excel, CSV, Word .docx, PDF or a picture)`)
  return [{ type: 'text', text: `[Attached file: ${name}]\n${cut(text)}` }]
}
