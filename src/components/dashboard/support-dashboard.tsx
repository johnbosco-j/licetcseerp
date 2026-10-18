"use client"

// Dashboards of the support tiers: administrators (accounts, students, courses — no marks or
// attendance) and lab instructors (today's lab hours of every class, to take attendance).

import { useEffect, useState } from "react"
import Link from "next/link"
import { Users, BookOpen, UserPlus, FlaskConical, ClipboardCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { currentTermId } from "@/lib/academic"

const card = "bg-card border border-border rounded-xl p-5"

export function AdminDashboard({ name, greeting }: { name: string; greeting: string }) {
  const [n, setN] = useState<{ students: number; staff: number; courses: number } | null>(null)
  useEffect(() => {
    (async () => {
      const term = await currentTermId()
      const [s, f, c] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT').eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['HOD', 'PROFESSOR']).eq('is_active', true),
        term ? supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('term_id', term) : Promise.resolve({ count: 0 }),
      ])
      setN({ students: s.count ?? 0, staff: f.count ?? 0, courses: c.count ?? 0 })
    })()
  }, [])
  const tiles = [
    { label: 'Active students', value: n?.students, href: '/dashboard/students', icon: Users },
    { label: 'Staff accounts', value: n?.staff, href: '/dashboard/accounts', icon: UserPlus },
    { label: 'Courses this term', value: n?.courses, href: '/dashboard/subjects', icon: BookOpen },
  ]
  return (
    <div className="space-y-6">
      <div><span className="eyebrow">ADMINISTRATOR</span><h1 className="text-2xl font-semibold tracking-tight mt-2">{greeting}, {name}</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-2xl">Add and correct students, courses and staff accounts. Marks, attendance and the timetable stay with the teaching staff.</p></div>
      <div className="grid sm:grid-cols-3 gap-4">
        {tiles.map(t => (
          <Link key={t.label} href={t.href} className={`${card} hover:border-licet-gold flex items-center gap-4`}>
            <t.icon className="w-10 h-10 p-2.5 rounded-lg bg-licet-cream text-licet-indigo" />
            <div><p className="text-2xl font-semibold tabular-nums">{t.value ?? '…'}</p><p className="text-[13px] text-muted-foreground">{t.label}</p></div>
          </Link>
        ))}
      </div>
    </div>
  )
}

type Hour = { id: string; section: string; period_no: number; label: string | null; room: string | null; subjects: { code: string; short_name: string | null; name: string } | null; audience: string; audience_value: string | null }

export function LabDashboard({ name, greeting }: { name: string; greeting: string }) {
  const [hours, setHours] = useState<Hour[] | null>(null)
  const [slots, setSlots] = useState<Record<number, { starts_at: string; ends_at: string }>>({})
  useEffect(() => {
    (async () => {
      const term = await currentTermId()
      if (!term) { setHours([]); return }
      const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
      const { data: days } = await supabase.from('calendar_days').select('scope, is_working, day_order').eq('date', today)
      const order = new Map(((days ?? []) as { scope: string; is_working: boolean; day_order: number | null }[]).filter(d => d.is_working && d.day_order).map(d => [d.scope, d.day_order as number]))
      const fallback = new Date(today + 'T00:00:00Z').getUTCDay() || 7
      const { data } = await supabase.from('timetable_entries').select('id, section, day_order, period_no, label, room, audience, audience_value, subjects(code, short_name, name)')
        .eq('term_id', term).eq('is_lab', true).order('section').order('period_no')
      const scope = (sec: string) => sec.startsWith('I ') ? 'FY' : sec.startsWith('IV') ? 'IV' : 'HS'
      setHours(((data ?? []) as unknown as (Hour & { day_order: number })[]).filter(e => (order.get(scope(e.section)) ?? (days?.length ? 0 : fallback)) === e.day_order))
      const { data: ps } = await supabase.from('period_slots').select('period_no, starts_at, ends_at').eq('term_id', term)
      setSlots(Object.fromEntries(((ps ?? []) as { period_no: number; starts_at: string; ends_at: string }[]).map(p => [p.period_no, p])))
    })()
  }, [])
  const t = (s?: string) => s ? s.slice(0, 5) : ''
  return (
    <div className="space-y-6">
      <div><span className="eyebrow">LAB INSTRUCTOR</span><h1 className="text-2xl font-semibold tracking-tight mt-2">{greeting}, {name}</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-2xl">Today&apos;s lab hours in every class. You can take attendance of a lab hour on the day, from a few minutes before it starts until 15 minutes after it ends.</p></div>
      <div className={card}>
        <div className="flex items-center gap-2 mb-3"><FlaskConical className="w-5 h-5 text-licet-violet" /><h2 className="font-semibold text-licet-indigo">Lab hours today</h2></div>
        {hours === null ? <p className="text-muted-foreground text-[13px]">Loading…</p> : !hours.length ? <p className="text-muted-foreground text-[13px]">No lab hours today.</p> : (
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1.5">Period</th><th>Time</th><th>Class</th><th>Lab</th><th>Room</th><th /></tr></thead>
            <tbody>{hours.map(h => (
              <tr key={h.id} className="border-t border-border">
                <td className="py-2">P{h.period_no}</td><td>{t(slots[h.period_no]?.starts_at)}–{t(slots[h.period_no]?.ends_at)}</td>
                <td>{h.section}{h.audience === 'BATCH' ? ` · batch ${h.audience_value}` : ''}</td>
                <td>{h.subjects?.short_name || h.subjects?.code || h.label}</td><td>{h.room ?? ''}</td>
                <td className="text-right"><Link href="/dashboard/attendance" className="inline-flex items-center gap-1 text-licet-indigo font-semibold"><ClipboardCheck className="w-4 h-4" /> Take attendance</Link></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
