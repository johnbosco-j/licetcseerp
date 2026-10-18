// The AI model behind LICET AI (server only; keys never reach the browser).
// Either provider works — set ONE key on the server:
//   ANTHROPIC_API_KEY (Claude; model ANTHROPIC_MODEL, default claude-sonnet-5-5), or
//   GEMINI_API_KEY    (Google Gemini; model GEMINI_MODEL, default gemini-flash-latest; when it is busy,
//                      GEMINI_FALLBACK_MODELS, default gemini-flash-lite-latest).
// With both set, AI_PROVIDER=anthropic|gemini picks one (default: Claude). ANTHROPIC_BASE_URL /
// GEMINI_BASE_URL point at a proxy (or the local mock used in testing).
// Messages use one shape (Claude's content blocks); Gemini is translated in and out.

export type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
export type Msg = { role: 'user' | 'assistant'; content: string | Block[] }
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> }
export type Reply = { content: Block[]; stop_reason: string }

export type Provider = 'anthropic' | 'gemini'

/** A provider refused or failed; `hint` is safe to show (no key, no prompt). */
export class AiError extends Error {
  constructor(public status: number, detail: string) { super(`AI service error ${status}: ${detail.slice(0, 400)}`) }
  get hint() {
    if (this.status === 400) return 'The AI service refused the request (model name or request format).'
    if (this.status === 401 || this.status === 403) return 'The AI key on the server is not valid or not allowed for this model.'
    if (this.status === 404) return 'The AI model set on the server was not found.'
    if (this.status === 429) return 'The AI service quota is used up for now — try again later.'
    if (this.status === 503 || this.status === 500) return 'The AI service is busy right now — try again in a minute.'
    return 'The AI service did not answer. Try again in a minute.'
  }
}
export function aiProvider(): Provider | null {
  const a = !!process.env.ANTHROPIC_API_KEY, g = !!process.env.GEMINI_API_KEY
  const want = process.env.AI_PROVIDER?.toLowerCase()
  if (want === 'gemini' && g) return 'gemini'
  if (want === 'anthropic' && a) return 'anthropic'
  return a ? 'anthropic' : g ? 'gemini' : null
}
export const aiConfigured = () => aiProvider() !== null
export const aiModel = () => aiProvider() === 'gemini'
  ? process.env.GEMINI_MODEL || 'gemini-flash-latest'
  : process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export async function aiChat(body: { system: string; messages: Msg[]; tools?: ToolDef[]; max_tokens?: number }): Promise<Reply> {
  return aiProvider() === 'gemini' ? gemini(body) : anthropic(body)
}

async function anthropic(body: { system: string; messages: Msg[]; tools?: ToolDef[]; max_tokens?: number }): Promise<Reply> {
  // Claude takes the blocks as they are (minus our Gemini-only signature field)
  const messages = body.messages.map(m => typeof m.content === 'string' ? m : {
    role: m.role, content: m.content.map(b => b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: b.input } : b),
  })
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: aiModel(), max_tokens: body.max_tokens ?? 2000, system: body.system, messages, ...(body.tools?.length ? { tools: body.tools } : {}) }),
  })
  if (!res.ok) throw new AiError(res.status, await res.text().catch(() => ''))
  return await res.json() as Reply
}

type GPart = { text?: string; inline_data?: { mime_type: string; data: string }; functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }; thoughtSignature?: string; thought?: boolean }

/** Claude-shaped conversation → Gemini `contents` (exported for tests). */
export function toGemini(messages: Msg[]): { role: 'user' | 'model'; parts: GPart[] }[] {
  const names = new Map<string, string>()
  return messages.map(m => {
    const blocks: Block[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    const parts: GPart[] = []
    for (const b of blocks) {
      if (b.type === 'text') { if (b.text) parts.push({ text: b.text }) }
      else if (b.type === 'image' || b.type === 'document') parts.push({ inline_data: { mime_type: b.source.media_type, data: b.source.data } })
      else if (b.type === 'tool_use') { names.set(b.id, b.name); parts.push({ functionCall: { name: b.name, args: b.input }, ...(b.signature ? { thoughtSignature: b.signature } : {}) }) }
      else if (b.type === 'tool_result') parts.push({ functionResponse: { name: names.get(b.tool_use_id) ?? 'tool', response: b.is_error ? { error: b.content } : { content: b.content } } })
    }
    return { role: m.role === 'assistant' ? 'model' as const : 'user' as const, parts: parts.length ? parts : [{ text: ' ' }] }
  })
}

/** Gemini accepts an OpenAPI subset: no empty object schemas, no additionalProperties. */
export function geminiSchema(s: Record<string, unknown>): Record<string, unknown> | undefined {
  const props = s.properties as Record<string, Record<string, unknown>> | undefined
  if (s.type === 'object' && (!props || !Object.keys(props).length)) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue
    if (k === 'properties') out[k] = Object.fromEntries(Object.entries(v as Record<string, Record<string, unknown>>).map(([p, ps]) => [p, geminiSchema(ps) ?? { type: 'object', properties: { value: { type: 'string' } } }]))
    else if (k === 'items') out[k] = geminiSchema(v as Record<string, unknown>) ?? { type: 'string' }
    else out[k] = v
  }
  return out
}

// Gemini models are sometimes overloaded (503) or briefly rate-limited: retry once, then use the
// lighter fallback model(s) in GEMINI_FALLBACK_MODELS (default gemini-flash-lite-latest).
async function gemini(body: { system: string; messages: Msg[]; tools?: ToolDef[]; max_tokens?: number }): Promise<Reply> {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-lite-latest').split(',').map(x => x.trim()).filter(Boolean)
  const tries = [aiModel(), aiModel(), ...fallbacks]
  let last: unknown
  for (const [n, model] of tries.entries()) {
    try { return await geminiOnce(body, model) } catch (e) {
      last = e
      if (!(e instanceof AiError) || ![429, 500, 503].includes(e.status)) throw e
      if (n === 0) await new Promise(r => setTimeout(r, 1500))
    }
  }
  throw last
}

async function geminiOnce(body: { system: string; messages: Msg[]; tools?: ToolDef[]; max_tokens?: number }, model: string): Promise<Reply> {
  const res = await fetch(`${process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: body.system }] },
      contents: toGemini(body.messages),
      generationConfig: { maxOutputTokens: body.max_tokens ?? 2000 },
      ...(body.tools?.length ? { tools: [{ functionDeclarations: body.tools.map(t => {
        const parameters = geminiSchema(t.input_schema)
        return { name: t.name, description: t.description, ...(parameters ? { parameters } : {}) }
      }) }] } : {}),
    }),
  })
  if (!res.ok) throw new AiError(res.status, await res.text().catch(() => ''))
  const j = await res.json() as { candidates?: { content?: { parts?: GPart[] }; finishReason?: string }[] }
  const parts = j.candidates?.[0]?.content?.parts ?? []
  const content: Block[] = []
  parts.forEach((p, i) => {
    if (p.functionCall) content.push({ type: 'tool_use', id: `g${Date.now().toString(36)}${i}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}) })
    else if (p.text && !p.thought) content.push({ type: 'text', text: p.text })
  })
  return { content, stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : (j.candidates?.[0]?.finishReason ?? 'end_turn').toLowerCase() }
}

/** First JSON array in a reply (the model is asked for JSON only, but be forgiving). */
export function extractJsonArray(text: string): unknown[] | null {
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s < 0 || e <= s) return null
  try { const v = JSON.parse(text.slice(s, e + 1)); return Array.isArray(v) ? v : null } catch { return null }
}
export const replyText = (r: Reply) => r.content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n').trim()
