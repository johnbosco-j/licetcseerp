"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, CalendarRange, Library, Users, Layers, ShieldCheck, Menu as MenuIcon, Database, Clock } from "lucide-react"
import { isTier1, NAV_LABELS } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { loadGroups, loadSettings, loadTerms, loadVerticals, type StudentGroup, type Term, type Vertical } from "@/lib/academic"
import { TermsTab } from "@/components/config/terms-tab"
import { CoursesTab } from "@/components/config/courses-tab"
import { StudentsTab } from "@/components/config/students-tab"
import { GroupsTab, RulesTab, MenusTab, DataEditorTab } from "@/components/config/misc-tabs"

const TABS = [
  { id: 'terms', label: 'Terms, calendar & periods', icon: CalendarRange },
  { id: 'courses', label: 'Courses & faculty', icon: Library },
  { id: 'timetable', label: 'Timetable', icon: Clock },
  { id: 'students', label: 'Students, batches & advisors', icon: Users },
  { id: 'groups', label: 'Verticals & groups', icon: Layers },
  { id: 'rules', label: 'Attendance rules', icon: ShieldCheck },
  { id: 'menus', label: 'Menus', icon: MenuIcon },
  { id: 'data', label: 'Data editor', icon: Database },
] as const
type TabId = typeof TABS[number]['id']

export default function ConfigPage() {
  const router = useRouter()
  const [ok, setOk] = useState(false)
  const [tab, setTab] = useState<TabId>('terms')
  const [terms, setTerms] = useState<Term[]>([])
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  const reload = useCallback(() => {
    loadTerms().then(setTerms); loadVerticals().then(setVerticals); loadGroups().then(setGroups); loadSettings().then(setSettings)
  }, [])
  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    const au = stored ? JSON.parse(stored) as AuthUser : null
    if (!au || au.type !== 'staff' || !isTier1(au.data)) { router.replace('/dashboard'); return }
    setOk(true)
    try { const t = new URLSearchParams(window.location.search).get('tab'); if (t && TABS.some(x => x.id === t)) setTab(t as TabId) } catch { /* ignore */ }
    reload()
  }, [router, reload])

  if (!ok || !terms.length) return <div className="p-10 flex items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <div>
        <span className="eyebrow">HOD</span>
        <h1 className="font-display text-3xl font-bold text-licet-indigo mt-1">Configuration</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1 max-w-3xl">Everything the ERP runs on — terms, calendar, period timings, courses and faculty, timetables, batches and verticals, attendance rules and menus — can be changed here. Every change is recorded in the audit trail.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-md border ${tab === t.id ? 'bg-licet-indigo text-white border-licet-indigo' : 'bg-white border-border hover:bg-muted'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'terms' && <TermsTab terms={terms} reload={reload} />}
      {tab === 'courses' && <CoursesTab terms={terms} verticals={verticals} groups={groups} />}
      {tab === 'timetable' && (
        <div className="rounded-lg border border-border bg-white p-5 text-[13.5px] space-y-2">
          <p>Timetables are edited on the timetable page itself: pick a class, press <b>Edit</b>, then click any hour to change it, split it between batches or verticals, set the room and faculty, or mark it as an hour without attendance.</p>
          <Link href="/dashboard/timetable" className="inline-flex h-9 px-4 items-center rounded-md bg-licet-indigo text-white font-semibold">Open the timetable editor</Link>
        </div>
      )}
      {tab === 'students' && <StudentsTab verticals={verticals} groups={groups} />}
      {tab === 'groups' && <GroupsTab verticals={verticals} groups={groups} reload={reload} />}
      {tab === 'rules' && <RulesTab settings={settings} reload={reload} />}
      {tab === 'menus' && <MenusTab settings={settings} labels={NAV_LABELS} reload={reload} />}
      {tab === 'data' && <DataEditorTab />}
    </div>
  )
}
