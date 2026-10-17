import { NextResponse } from 'next/server'
import { executeAction } from '@/lib/ai/actions'
import { askerFrom } from '@/lib/ai/session'

// Runs a change LICET AI drafted, after the person pressed Confirm. The draft is signed and
// tied to this person; it runs with their own session, so their permissions still apply.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const who = await askerFrom(req, { quota: false })
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status })
  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (!token) return NextResponse.json({ error: 'Nothing to confirm' }, { status: 400 })
  try {
    return NextResponse.json(await executeAction(who.db, who.me, token, who.token))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save' }, { status: 400 })
  }
}
