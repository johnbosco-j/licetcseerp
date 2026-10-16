import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { adminClient } from '@/lib/server-auth'
import { sendEmail } from '@/lib/email'

// Weekly attendance-shortage alerts (Monday morning). Called by Vercel Cron
// (Authorization: Bearer CRON_SECRET) or the college server's crontab
// (x-cron-secret: CRON_SECRET). Each student below the alert threshold gets one
// email a week, copied to their class advisor and — if the HOD allows it and an
// address is on file — their parents. Every alert is logged.
export const dynamic = 'force-dynamic'

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function mondayOf(d = new Date()) {
  const x = new Date(d.getTime() + 5.5 * 3600 * 1000)          // India date
  const wd = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() - (wd - 1))
  return x.toISOString().slice(0, 10)
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const given = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !same(given, secret)) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })

  const db = adminClient()
  const { data: settings } = await db.from('app_settings').select('key, value').in('key', ['alerts.weekly_enabled', 'alerts.parents', 'alerts.threshold_percent', 'attendance.min_percent'])
  const get = (k: string) => (settings ?? []).find(s => s.key === k)?.value
  if (String(get('alerts.weekly_enabled')) === 'false') return NextResponse.json({ ok: true, skipped: 'disabled by the HOD' })
  const threshold = Number(get('alerts.threshold_percent') ?? 80)
  const minPct = Number(get('attendance.min_percent') ?? 75)
  const toParents = String(get('alerts.parents')) !== 'false'

  const { data: term } = await db.from('academic_terms').select('id, label').eq('is_current', true).maybeSingle()
  const { data: rows, error } = await db.rpc('att_alert_candidates', { p_threshold: threshold })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const week = mondayOf()
  const { data: done } = await db.from('attendance_alert_log').select('student_id').eq('week_of', week)
  const already = new Set((done ?? []).map(d => d.student_id))

  let sent = 0, failed = 0
  for (const r of (rows ?? []) as { student_id: string; full_name: string; email: string; parent_email: string | null; section: string; advisor_email: string | null; hours: number; attended: number; pct: number }[]) {
    if (already.has(r.student_id)) continue
    const to = [r.email, ...(toParents && r.parent_email ? [r.parent_email] : []), ...(r.advisor_email ? [r.advisor_email] : [])]
    const below = Number(r.pct) < minPct
    const need = below ? Math.ceil((minPct / 100 * Number(r.hours) - Number(r.attended)) / (1 - minPct / 100)) : 0
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e8e0cc">
  <div style="background:#1A0C4E;color:#fff;padding:16px 22px;border-bottom:3px solid #DCCAA0"><b>LICET — Department of CSE</b><br><span style="color:#DCCAA0;font-size:11px;letter-spacing:2px">ATTENDANCE ALERT</span></div>
  <div style="padding:22px;font-size:14px;line-height:1.6;color:#2b2540">
    <p>Dear ${esc(r.full_name)} (${esc(r.section)}),</p>
    <p>Your overall attendance for ${esc(term?.label ?? 'this semester')} is <b>${esc(r.pct)}%</b> (${esc(r.attended)} of ${esc(r.hours)} hours).</p>
    <p>${below
      ? `This is below the ${minPct}% required to write the semester-end examination (Regulation 7.1). Attend the next <b>${need}</b> hours without a break to reach ${minPct}%. Condonation (65–74%) is possible only for medical reasons or sports with documents.`
      : `You are still eligible, but close to the ${minPct}% minimum. Please do not miss classes.`}</p>
    <p>Please meet your class advisor this week.</p>
  </div>
  <div style="background:#EFE6D1;padding:10px 22px;color:#6b6480;font-size:11px">Automated weekly message from LICET Things. Please do not reply.</div>
</div>`
    const res = await sendEmail({ to, subject: `Attendance ${r.pct}% — ${r.full_name}`, html })
    if (!res.success) { failed++; continue }
    await db.from('attendance_alert_log').insert({ student_id: r.student_id, term_id: term?.id ?? null, pct: r.pct, sent_to: to, week_of: week })
    sent++
  }
  return NextResponse.json({ ok: true, week, threshold, candidates: rows?.length ?? 0, sent, failed })
}

export const GET = run
export const POST = run
