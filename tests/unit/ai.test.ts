import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extractJsonArray, toGemini, geminiSchema } from '@/lib/ai/llm'
import { fileBlocks, sheetText } from '@/lib/ai/files'

describe('extractJsonArray', () => {
  it('reads the array even with text around it', () => {
    expect(extractJsonArray('Here you go:\n[{"Name":"A","Email":"a@licet.ac.in"}]\nDone')).toEqual([{ Name: 'A', Email: 'a@licet.ac.in' }])
  })
  it('returns null for no / broken JSON', () => {
    expect(extractJsonArray('no table here')).toBeNull()
    expect(extractJsonArray('[{"a":1},')).toBeNull()
  })
})

describe('Gemini translation', () => {
  it('maps text, files, tool calls and results; keeps the call signature', () => {
    const c = toGemini([
      { role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }, { type: 'text', text: 'Read it' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'timetable', input: { section: 'II CSE-A' }, signature: 'sig' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"hours":[]}' }] },
    ])
    expect(c[0]).toEqual({ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: 'QUJD' } }, { text: 'Read it' }] })
    expect(c[1]).toEqual({ role: 'model', parts: [{ functionCall: { name: 'timetable', args: { section: 'II CSE-A' } }, thoughtSignature: 'sig' }] })
    expect(c[2].parts[0]).toEqual({ functionResponse: { name: 'timetable', response: { content: '{"hours":[]}' } } })
  })
  it('drops empty object schemas (Gemini refuses them)', () => {
    expect(geminiSchema({ type: 'object', properties: {} })).toBeUndefined()
    expect(geminiSchema({ type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } } }, additionalProperties: false }))
      .toEqual({ type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } } } })
  })
})

describe('attached files', () => {
  const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64')
  it('turns a workbook into CSV per sheet, without empty rows', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Roll No', 'CT1'], [], ['24CS001', 25]]), 'OS')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    expect(sheetText(buf)).toBe('### Sheet "OS"\nRoll No,CT1\n24CS001,25')
    const [blk] = fileBlocks({ name: 'IA.xlsx', type: '', data: b64(buf) })
    expect(blk).toMatchObject({ type: 'text' })
    expect((blk as { text: string }).text).toContain('24CS001,25')
  })
  it('sends PDFs and pictures as they are', () => {
    expect(fileBlocks({ name: 'circular.pdf', type: '', data: b64('%PDF-1.4') })[1]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } })
    expect(fileBlocks({ name: 'sheet.JPG', type: '', data: b64('jpg') })[1]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
  })
  it('refuses unknown or oversized files with a clear message', () => {
    expect(() => fileBlocks({ name: 'run.exe', type: '', data: b64('MZ') })).toThrow(/cannot be read/)
    expect(() => fileBlocks({ name: 'big.csv', type: '', data: b64(Buffer.alloc(2_600_000, 65)) })).toThrow(/larger than 2.5 MB/)
  })
})
