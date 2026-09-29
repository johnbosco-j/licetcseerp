import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/server-auth'

// Keeps the Supabase project awake. Free-plan projects are paused after 7 days
// without database activity (for example over the holidays), so a daily Vercel
// cron (vercel.json) and a GitHub Actions backup (.github/workflows/keepalive.yml)
// call this route, which runs one small real query. It returns no data.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { error } = await adminClient().from('departments').select('id', { count: 'exact', head: true })
    if (error) return NextResponse.json({ ok: false }, { status: 503 })
    return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
