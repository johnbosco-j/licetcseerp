// Minimal Anthropic Messages API client (server only). The key stays on the server.
export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
export type Msg = { role: 'user' | 'assistant'; content: string | Block[] }
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> }

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY

export async function claude(body: { system: string; messages: Msg[]; tools?: ToolDef[]; max_tokens?: number }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: body.max_tokens ?? 1500, system: body.system, messages: body.messages, ...(body.tools?.length ? { tools: body.tools } : {}) }),
  })
  if (!res.ok) throw new Error(`AI service error ${res.status}`)
  return await res.json() as { content: Block[]; stop_reason: string }
}

/** First JSON array in a reply (the model is asked for JSON only, but be forgiving). */
export function extractJsonArray(text: string): unknown[] | null {
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s < 0 || e <= s) return null
  try { const v = JSON.parse(text.slice(s, e + 1)); return Array.isArray(v) ? v : null } catch { return null }
}
