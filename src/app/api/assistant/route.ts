import { NextResponse } from 'next/server'
import { aiConfigured, aiChat, replyText, type Block, type Msg } from '@/lib/ai/llm'
import { toolsFor, runTool } from '@/lib/ai/tools'
import { actionsFor, isAction, prepareAction } from '@/lib/ai/actions'
import { fileBlocks, type Attachment } from '@/lib/ai/files'
import { askerFrom } from '@/lib/ai/session'

// LICET AI for every role. It looks things up with the asker's own session (lib/ai/tools.ts)
// and can DRAFT changes (lib/ai/actions.ts) that the person confirms in the panel; it never
// saves anything by itself. Staff can attach files (Excel, CSV, Word, PDF, pictures).
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type InMsg = { role: string; content: string; files?: Attachment[] }

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: 'The AI assistant is not set up yet (an Anthropic or Gemini API key is added on the server).' }, { status: 503 })
  const who = await askerFrom(req)
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status })
  const { me, db } = who
  const body = await req.json().catch(() => ({})) as { messages?: InMsg[] }
  const staff = me.role !== 'STUDENT'

  const history: Msg[] = []
  try {
    for (const m of (body.messages ?? []).slice(-14)) {
      if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue
      const text = m.content.slice(0, 6000)
      const files = m.role === 'user' && staff && Array.isArray(m.files) ? m.files.slice(0, 3) : []
      if (!text.trim() && !files.length) continue
      history.push(files.length
        ? { role: 'user', content: [...files.flatMap(fileBlocks), { type: 'text', text: text.trim() || 'Read the attached file.' }] }
        : { role: m.role, content: text })
    }
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the file' }, { status: 400 }) }
  if (!history.length || history[history.length - 1].role !== 'user') return NextResponse.json({ error: 'Ask a question' }, { status: 400 })

  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
  const system = [
    'You are LICET AI, the assistant of LICET Things, the Department Information System of Computer Science and Engineering, Loyola-ICAM College of Engineering and Technology (LICET), Chennai.',
    `You are talking to ${me.full_name}, ${me.role === 'STUDENT' ? `a student of ${me.section}` : me.tier1 ? 'the Head of Department (or tier-1 leadership)' : `a faculty member${me.advisor_section ? `, class advisor of ${me.advisor_section}` : ''}`}. Today is ${today} (India).`,
    'Answer from the tools, which show exactly what this person may see. If the tools do not have the answer, say so; never guess figures, names or register numbers.',
    'You can prepare changes with the draft_* tools. A draft is shown to the user with a Confirm button and nothing is saved until they press it — never say something is saved. If a draft tool says something is missing or ambiguous, ask the user.',
    'Use one draft per course and component (marks) or per class hour block (attendance). For attached sheets: read the columns carefully, map them to the right component, copy marks exactly, and state any rows you could not read.',
    'For changes no draft tool covers, explain the exact screen to use (e.g. Configuration → Timetable).',
    'Attendance rules (Regulation 7): ≥75% eligible, 65–74% only with medical/sports condonation, <65% shortage; on-duty counts as attended. Marks follow Regulations 2024 (theory internal 40, lab-integrated 50, lab 60).',
    'This is a department system only: no Controller of Examinations data. Keep answers short and practical; use simple tables or bullet lists for figures.',
  ].join('\n')
  const tools = [...toolsFor(me), ...actionsFor(me)].map(({ name, description, input_schema }) => ({ name, description, input_schema }))

  const proposals: unknown[] = []
  try {
    const messages: Msg[] = [...history]
    for (let round = 0; round < 6; round++) {
      const r = await aiChat({ system, messages, tools, max_tokens: 4000 })
      const uses = r.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
      if (r.stop_reason !== 'tool_use' || !uses.length) return NextResponse.json({ reply: replyText(r) || (proposals.length ? 'Check the draft below and press Confirm.' : 'No answer.'), proposals })
      messages.push({ role: 'assistant', content: r.content })
      const results: Block[] = []
      for (const u of uses) {
        try {
          if (isAction(u.name)) {
            const p = await prepareAction(db, me, u.name, u.input)
            if (p.proposal) proposals.push(p.proposal)
            results.push({ type: 'tool_result', tool_use_id: u.id, content: p.text })
          } else results.push({ type: 'tool_result', tool_use_id: u.id, content: String(await runTool(db, me, u.name, u.input)) })
        } catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: e instanceof Error ? e.message : 'failed', is_error: true }) }
      }
      messages.push({ role: 'user', content: results })
    }
    return NextResponse.json({ reply: proposals.length ? 'Check the drafts below and press Confirm.' : 'That needed too many look-ups; please ask a narrower question.', proposals })
  } catch {
    return NextResponse.json({ error: 'The AI service did not answer. Try again in a minute.' }, { status: 502 })
  }
}
