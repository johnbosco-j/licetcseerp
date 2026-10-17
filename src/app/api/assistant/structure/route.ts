import { NextResponse } from 'next/server'
import { aiConfigured, claude, extractJsonArray } from '@/lib/ai/claude'
import { askerFrom } from '@/lib/ai/session'

// Bulk entry helper (staff): turns pasted text (a mail, a PDF copy, a messy sheet) into rows
// with the given columns. Nothing is saved here — the screen shows the rows for review first.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: 'The AI assistant is not set up yet.' }, { status: 503 })
  const who = await askerFrom(req)
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status })
  if (who.me.role === 'STUDENT') return NextResponse.json({ error: 'For staff only' }, { status: 403 })
  const { columns, text, hint } = await req.json().catch(() => ({})) as { columns?: string[]; text?: string; hint?: string }
  if (!Array.isArray(columns) || !columns.length || columns.length > 40 || typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'Give the columns and the text' }, { status: 400 })
  if (text.length > 60000) return NextResponse.json({ error: 'Too long — paste at most about 60,000 characters at a time' }, { status: 413 })
  try {
    const r = await claude({
      max_tokens: 8000,
      system: 'You convert pasted text into table rows for a college ERP. Output ONLY a JSON array of objects, nothing else. Use exactly the given keys. Copy values exactly as written; do not invent, guess, correct or compute anything. Use "" when a value is missing. Keep register numbers and emails exactly. One object per person/record, in the order they appear.',
      messages: [{ role: 'user', content: `Columns: ${JSON.stringify(columns.map(c => String(c).slice(0, 60)))}\n${hint ? `Note: ${String(hint).slice(0, 300)}\n` : ''}Text:\n${text}` }],
    })
    const rows = extractJsonArray(r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(''))
    if (!rows) return NextResponse.json({ error: 'Could not read a table from that text' }, { status: 422 })
    const clean = rows.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map(x => Object.fromEntries(columns.map(c => [c, String(x[c] ?? '').trim()])))
    return NextResponse.json({ rows: clean.slice(0, 2000) })
  } catch {
    return NextResponse.json({ error: 'The AI service did not answer. Try again in a minute.' }, { status: 502 })
  }
}
