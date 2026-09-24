import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { requireRole, AuthError } from '@/lib/server-auth'

const MAX_RECIPIENTS = 50

// Only signed-in staff may send, so this can't be used as an open mail relay.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    await requireRole(token, ['HOD', 'PROFESSOR'])

    const { to, subject, html } = await req.json()
    const recipients = (Array.isArray(to) ? to : [to]).filter((r): r is string => typeof r === 'string' && r.includes('@'))
    if (!recipients.length || typeof subject !== 'string' || typeof html !== 'string') {
      return NextResponse.json({ error: 'Missing fields: to, subject, html' }, { status: 400 })
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients per request` }, { status: 400 })
    }

    const result = await sendEmail({ to: recipients, subject: subject.slice(0, 200), html })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 })
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
