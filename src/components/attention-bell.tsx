"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, CalendarMinus, Scale, AlertCircle, Megaphone, CheckCircle2, type LucideIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"

// "Needs your attention": the things waiting on this person, by role. Counts are
// read through the user's own session, so RLS decides what is visible (an
// advisor's pending leaves are their section's, the HOD's are everyone's).

export interface BellUser { id: string; role: string; tier1: boolean; advisorSection: string | null; section: string | null }
type Item = { icon: LucideIcon; label: string; count: number; href: string; tone: "red" | "amber" | "indigo" }

const TONE = { red: "bg-red-50 text-red-800", amber: "bg-amber-50 text-amber-800", indigo: "bg-licet-cream text-licet-indigo" }
const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0

export function AttentionBell({ user }: { user: BellUser }) {
  const pathname = usePathname()
  const [items, setItems] = useState<Item[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const head = { count: "exact" as const, head: true }
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const list: Item[] = []
    if (user.role === "STUDENT") {
      const [alerts, decided, notices] = await Promise.all([
        count(supabase.from("attendance_alerts").select("id", head).eq("student_id", user.id).is("cleared_at", null).eq("met_hod", false)),
        count(supabase.from("leaves").select("id", head).eq("applicant_id", user.id).neq("status", "PENDING").gte("reviewed_at", since)),
        count(supabase.from("announcements").select("id", head).in("audience", ["ALL", "STUDENTS", user.section ?? ""]).gte("created_at", since)),
      ])
      list.push({ icon: AlertCircle, label: "Attendance alerts: meet the HOD", count: alerts, href: "/dashboard/alerts", tone: "red" })
      list.push({ icon: CalendarMinus, label: "Leave decisions this week", count: decided, href: "/dashboard/leaves", tone: "indigo" })
      list.push({ icon: Megaphone, label: "New notices this week", count: notices, href: "/dashboard/notices", tone: "amber" })
    } else {
      if (user.tier1 || user.advisorSection) {
        const leaves = await count(supabase.from("leaves").select("id", head).eq("status", "PENDING").neq("applicant_id", user.id))
        list.push({ icon: CalendarMinus, label: user.tier1 ? "Leave applications to review" : `Leave requests from ${user.advisorSection}`, count: leaves, href: "/dashboard/leaves", tone: "amber" })
      }
      if (user.tier1) {
        const [grievances, alertsMet, alertsOpen] = await Promise.all([
          count(supabase.from("grievances").select("id", head).in("status", ["OPEN", "IN_PROGRESS"])),
          count(supabase.from("attendance_alerts").select("id", head).is("cleared_at", null).eq("met_hod", true)),
          count(supabase.from("attendance_alerts").select("id", head).is("cleared_at", null).eq("met_hod", false)),
        ])
        list.push({ icon: Scale, label: "Open grievances", count: grievances, href: "/dashboard/grievances", tone: "red" })
        list.push({ icon: CheckCircle2, label: "Students who met you: clear alert", count: alertsMet, href: "/dashboard/alerts", tone: "indigo" })
        list.push({ icon: AlertCircle, label: "Attendance alerts pending", count: alertsOpen, href: "/dashboard/alerts", tone: "amber" })
      } else {
        const decided = await count(supabase.from("leaves").select("id", head).eq("applicant_id", user.id).neq("status", "PENDING").gte("reviewed_at", since))
        list.push({ icon: CalendarMinus, label: "Your leave decisions this week", count: decided, href: "/dashboard/leaves", tone: "indigo" })
      }
    }
    setItems(list)
  }, [user.id, user.role, user.tier1, user.advisorSection, user.section])

  useEffect(() => { load().catch(() => setItems([])) }, [load, pathname])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === "visible") load().catch(() => {}) }, 120_000)
    return () => clearInterval(iv)
  }, [load])
  useEffect(() => { setOpen(false) }, [pathname])

  const total = (items ?? []).reduce((s, i) => s + i.count, 0)
  const pending = (items ?? []).filter(i => i.count > 0)

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={total ? `${total} item${total === 1 ? " needs" : "s need"} your attention` : "Nothing needs your attention"}
        className="relative w-10 h-10 flex items-center justify-center rounded-full text-licet-cream hover:bg-white/10 transition-colors">
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-licet-gold text-licet-indigo text-[10.5px] font-bold flex items-center justify-center ring-2 ring-licet-indigo">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-3 w-80 z-50 rounded-xl bg-white text-foreground shadow-2xl shadow-licet-indigo/25 border border-border overflow-hidden font-nav">
            <div className="px-4 py-3 bg-gradient-to-br from-licet-indigo to-licet-violet text-white">
              <p className="text-[13.5px] font-semibold">Needs your attention</p>
              <p className="text-[11px] text-licet-cream/80">{total ? `${total} item${total === 1 ? "" : "s"} waiting` : "You're all caught up"}</p>
            </div>
            {items === null ? (
              <p className="px-4 py-5 text-[13px] text-muted-foreground">Checking…</p>
            ) : pending.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-muted-foreground flex items-center gap-2"><CheckCircle2 size={15} className="text-green-700" />Nothing is waiting on you right now.</p>
            ) : (
              <ul className="py-1">
                {pending.map(i => (
                  <li key={i.label}>
                    <Link href={i.href} role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-licet-cream/50">
                      <i.icon size={15} className="text-licet-violet shrink-0" />
                      <span className="flex-1">{i.label}</span>
                      <span className={`min-w-[26px] text-center rounded-full px-2 py-0.5 text-[11.5px] font-bold ${TONE[i.tone]}`}>{i.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
