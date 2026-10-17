import { NextResponse } from 'next/server'
import { aiConfigured, claude, type Block, type Msg } from '@/lib/ai/claude'
import { toolsFor, runTool } from '@/lib/ai/tools'
import { askerFrom } from '@/lib/ai/session'

// In-app assistant for every role. It reads ERP data only through the asker's own session
// (tools in lib/ai/tools.ts), never writes, and points people to the right screen for changes.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: 'The AI assistant is not set up yet (the HOD adds an Anthropic API key on the server).' }, { status: 503 })
  const who = await askerFrom(req)
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status })
  const { me, db } = who
  const body = await req.json().catch(() => ({})) as { messages?: { role: string; content: string }[] }
  const history: Msg[] = (body.messages ?? []).slice(-12)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }))
  if (!history.length || history[history.length - 1].role !== 'user') return NextResponse.json({ error: 'Ask a question' }, { status: 400 })

  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
  const system = [
    'You are the LICET Things assistant for the Department of Computer Science and Engineering, Loyola-ICAM College of Engineering and Technology (LICET), Chennai.',
    `You are talking to ${me.full_name}, ${me.role === 'STUDENT' ? `a student of ${me.section}` : me.tier1 ? 'the Head of Department (or tier-1 leadership)' : `a faculty member${me.advisor_section ? `, class advisor of ${me.advisor_section}` : ''}`}. Today is ${today} (India).`,
    'Answer from the tools, which show exactly what this person may see. If the tools do not have the answer, say so; never guess figures.',
    'You cannot change anything. For any change, say which screen to use (e.g. Attendance → Take attendance, Configuration → Courses).',
    'Attendance rules (Regulation 7): ≥75% eligible, 65–74% only with medical/sports condonation, <65% shortage (SA); on-duty counts as attended.',
    'This is a department system only: no Controller of Examinations data. Keep answers short and practical; use tables or bullet lists for figures.',
  ].join('\n')
  const tools = toolsFor(me).map(({ name, description, input_schema }) => ({ name, description, input_schema }))

  try {
    const messages: Msg[] = [...history]
    for (let round = 0; round < 5; round++) {
      const r = await claude({ system, messages, tools })
      const uses = r.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
      if (r.stop_reason !== 'tool_use' || !uses.length) {
        return NextResponse.json({ reply: r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim() || 'No answer.' })
      }
      messages.push({ role: 'assistant', content: r.content })
      const results: Block[] = []
      for (const u of uses) {
        try { results.push({ type: 'tool_result', tool_use_id: u.id, content: String(await runTool(db, me, u.name, u.input)) }) }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: e instanceof Error ? e.message : 'failed', is_error: true }) }
      }
      messages.push({ role: 'user', content: results })
    }
    return NextResponse.json({ reply: 'That needed too many look-ups; please ask a narrower question.' })
  } catch {
    return NextResponse.json({ error: 'The AI service did not answer. Try again in a minute.' }, { status: 502 })
  }
}
