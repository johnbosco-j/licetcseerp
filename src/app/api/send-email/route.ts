// /app/api/send-email/route.ts
// Server-side proxy — keeps RESEND_API_KEY off the browser.
// Client components POST here; this calls sendEmail() with the server key.

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to, subject, html } = body

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Missing fields: to, subject, html' }, { status: 400 })
    }

    const result = await sendEmail({ to, subject, html })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
