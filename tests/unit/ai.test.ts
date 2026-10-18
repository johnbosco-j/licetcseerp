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

describe('Gemini model chain', () => {
  it('starts with GEMINI_MODEL and then mixes in the other Gemini models', async () => {
    const { geminiChain, GEMINI_MODELS } = await import('@/lib/ai/llm')
    const keep = { ...process.env }
    process.env.GEMINI_API_KEY = 'x'; delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_FALLBACK_MODELS
    process.env.GEMINI_MODEL = 'gemini-2.5-flash'
    const chain = geminiChain()
    expect(chain[0]).toBe('gemini-2.5-flash')
    expect(new Set(chain)).toEqual(new Set(GEMINI_MODELS))
    process.env.GEMINI_FALLBACK_MODELS = 'gemini-flash-lite-latest, gemini-pro-latest'
    expect(geminiChain()).toEqual(['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-pro-latest'])
    process.env = keep
  })
})

describe('Gemini under demand', () => {
  it('moves to the next model on 503 / 404 and keeps the one that answered', async () => {
    const { vi } = await import('vitest')
    const { aiChat } = await import('@/lib/ai/llm')
    const keep = { ...process.env }
    process.env.GEMINI_API_KEY = 'x'; delete process.env.ANTHROPIC_API_KEY; process.env.AI_PROVIDER = 'gemini'
    process.env.GEMINI_MODEL = 'm-busy'; process.env.GEMINI_FALLBACK_MODELS = 'm-missing,m-ok,m-never'
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      const model = decodeURIComponent(url.split('/models/')[1].split(':')[0]); asked.push(model)
      if (model === 'm-busy') return new Response('{"error":{"code":503}}', { status: 503 })
      if (model === 'm-missing') return new Response('{"error":{"code":404}}', { status: 404 })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }), { status: 200 })
    })
    const state: { model?: string } = {}
    const r = await aiChat({ system: 's', messages: [{ role: 'user', content: 'q' }], state })
    expect(r.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(asked).toEqual(['m-busy', 'm-missing', 'm-ok'])
    expect(state.model).toBe('m-ok')
    asked.length = 0
    await aiChat({ system: 's', messages: [{ role: 'user', content: 'q' }], state })
    expect(asked).toEqual(['m-ok'])                       // the follow-up step stays on the model that answered
    vi.unstubAllGlobals(); process.env = keep
  })
})

describe('Gemini thinking setting', () => {
  it('turns thinking down for quick answers, leaves Pro alone', async () => {
    const { thinkingFor } = await import('@/lib/ai/llm')
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 })
    expect(thinkingFor('gemini-flash-latest')).toEqual({ thinkingLevel: 'low' })
    expect(thinkingFor('gemini-2.5-pro')).toBeNull()
    expect(thinkingFor('gemini-2.0-flash')).toBeNull()
  })
  it('asks again without it when a model refuses the setting', async () => {
    const { vi } = await import('vitest')
    const { aiChat } = await import('@/lib/ai/llm')
    const keep = { ...process.env }
    process.env.GEMINI_API_KEY = 'x'; delete process.env.ANTHROPIC_API_KEY; process.env.AI_PROVIDER = 'gemini'; process.env.GEMINI_MODEL = 'm-x'; process.env.GEMINI_FALLBACK_MODELS = 'm-x'
    const bodies: { generationConfig: { thinkingConfig?: unknown } }[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body); bodies.push(b)
      if (b.generationConfig.thinkingConfig) return new Response('{"error":{"message":"thinking level is not supported"}}', { status: 400 })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 })
    })
    const r = await aiChat({ system: 's', messages: [{ role: 'user', content: 'q' }] })
    expect(r.content).toEqual([{ type: 'text', text: 'ok' }])
    expect(bodies.length).toBe(2); expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined()
    vi.unstubAllGlobals(); process.env = keep
  })
})
