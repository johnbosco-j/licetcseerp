"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { loadDepartmentTotals } from "@/lib/cgpa"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import type { LucideIcon } from "lucide-react"
import {
  Users, ClipboardCheck, Award, BookOpen,
  AlertTriangle, Bell, CalendarDays, Heart, ArrowRight
} from "lucide-react"

type Profile = Database['public']['Tables']['profiles']['Row']

interface StatData {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
}

interface FeedItem {
  id: string
  title: string
  body: string
  time: string
  kind: "notice" | "event" | "alert"
}

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
const quoted = (xs: string[]) => xs.map(x => `"${x}"`).join(',')

// Semester helper — June–Dec = odd (1,3,5,7), Jan–May = even (2,4,6,8)
// Matches subjects/timetable/marks pages for consistency
const currentSem = (s: string): number => {
  const m = new Date().getMonth() + 1
  const odd = m >= 6
  const map: Record<string, [number, number]> = {
    'I CSE-A': [1, 2], 'I CSE-B': [1, 2],
    'II CSE-A': [3, 4], 'II CSE-B': [3, 4],
    'III CSE-A': [5, 6], 'III CSE-B': [5, 6],
    'IV CSE-A': [7, 8], 'IV CSE-B': [7, 8],
  }
  const [o, e] = map[s] ?? [1, 2]
  return odd ? o : e
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export default function DashboardPage() {
  const router = useRouter()
  const [greeting, setGreeting] = useState("")
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState<StatData[]>([])
  const [feed, setFeed]         = useState<FeedItem[]>([])
  const [subtitle, setSubtitle] = useState("")
  const [actions, setActions]   = useState<{ label: string; count: number; href: string; tone: 'warn' | 'info' }[]>([])
  const [strength, setStrength] = useState<{ section: string; count: number }[]>([])

  useEffect(() => {
    const stored = localStorage.getItem("licet_user") || localStorage.getItem("excelsior_user")
    if (!stored) { router.push("/login"); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)

    const h = new Date().getHours()
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening")

    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => {
        if (data) setProfile(data)
        loadOverview(au, data)
      })
  }, [router])

  const loadOverview = async (au: AuthUser, prof: Profile | null) => {
    setLoading(true)
    const role = au.type === 'staff' ? au.data.role : 'STUDENT'

    if (role === 'HOD') {
      await loadHOD()
    } else if (role === 'PROFESSOR') {
      await loadFaculty(prof)
    } else {
      await loadStudent(prof)
    }

    await loadFeed(au, prof)
    setLoading(false)
  }

  // ── HOD overview ──────────────────────────────────────────
  const loadHOD = async () => {
    setSubtitle("Department of Computer Science & Engineering · Overview")

    const SECTION_LIST = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
    const head = { count: 'exact' as const, head: true }
    const [alertsRes, grievRes, leaveRes, unassignedRes, advisorsRes, ...sectionRes] = await Promise.all([
      supabase.from('attendance_alerts').select('id', head).is('cleared_at', null),
      supabase.from('grievances').select('id', head).in('status', ['OPEN', 'IN_PROGRESS']),
      supabase.from('leaves').select('id', head).eq('status', 'PENDING'),
      supabase.from('subjects').select('id', head).is('faculty_id', null),
      supabase.from('profiles').select('advisor_section').not('advisor_section', 'is', null),
      ...SECTION_LIST.map(sec => supabase.from('profiles').select('id', head).eq('role', 'STUDENT').eq('section', sec)),
    ])
    const advisorCount = new Set((advisorsRes.data ?? []).map(a => a.advisor_section)).size
    setActions([
      { label: 'Attendance alerts to clear', count: alertsRes.count ?? 0, href: '/dashboard/alerts', tone: 'warn' },
      { label: 'Open grievances', count: grievRes.count ?? 0, href: '/dashboard/grievances', tone: 'warn' },
      { label: 'Leave applications awaiting you', count: leaveRes.count ?? 0, href: '/dashboard/leaves', tone: 'warn' },
      { label: 'Subjects without a faculty member', count: unassignedRes.count ?? 0, href: '/dashboard/curriculum', tone: 'info' },
      { label: 'Sections without a class advisor', count: SECTION_LIST.length - advisorCount, href: '/dashboard/accounts', tone: 'info' },
    ])
    setStrength(SECTION_LIST.map((section, i) => ({ section, count: sectionRes[i].count ?? 0 })))

    const [studentsRes, totals, leavesRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT'),
      loadDepartmentTotals(),
      supabase.from('leaves').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    ])

    const totalStudents = studentsRes.count ?? 0
    const pendingLeaves = leavesRes.count ?? 0

    setStats([
      { label: "Total Students",  value: String(totalStudents), sub: "Across 8 sections", icon: Users },
      { label: "Avg. Attendance", value: totals.attendancePct !== null ? `${totals.attendancePct}%` : "—", sub: totals.attendanceRecords ? `${totals.attendanceRecords} session records` : "No attendance yet", icon: ClipboardCheck },
      { label: "Pass Rate",       value: totals.passRate !== null ? `${totals.passRate}%` : "—", sub: totals.markEntries ? "Assessments scoring ≥ 45%" : "No marks entered yet", icon: Award },
      { label: "Pending Leaves",  value: String(pendingLeaves), sub: "Awaiting your approval", icon: Heart },
    ])
  }

  // ── Faculty overview ──────────────────────────────────────
  const loadFaculty = async (prof: Profile | null) => {
    setSubtitle("Department of Computer Science & Engineering · Faculty Overview")
    if (!prof) { setStats([]); return }

    const [subjectsRes, leavesRes, gradedRes] = await Promise.all([
      supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('faculty_id', prof.id),
      supabase.from('leaves').select('id', { count: 'exact', head: true }).eq('applicant_id', prof.id).eq('status', 'PENDING'),
      supabase.from('marks').select('student_id, marks_obtained, max_marks').eq('faculty_id', prof.id),
    ])

    const graded = gradedRes.data ?? []
    const studentIds = new Set(graded.map(m => m.student_id))
    const passCount = graded.filter(m => Number(m.marks_obtained) >= Number(m.max_marks) * 0.45).length
    const passRate = graded.length > 0 ? Math.round((passCount / graded.length) * 100) : 0

    setStats([
      { label: "My Subjects",     value: String(subjectsRes.count ?? 0), sub: "Assigned to you", icon: BookOpen },
      { label: "Students Graded", value: String(studentIds.size), sub: "Across your subjects", icon: Users },
      { label: "Pass Rate",       value: `${passRate}%`, sub: "Your evaluated marks", icon: Award },
      { label: "Pending Leaves",  value: String(leavesRes.count ?? 0), sub: "Your applications", icon: Heart },
    ])
  }

  // ── Student overview ──────────────────────────────────────
  const loadStudent = async (prof: Profile | null) => {
    setSubtitle("Your Academic Snapshot")
    if (!prof) { setStats([]); return }

    const section = prof.section ?? ''
    const sem = currentSem(section)

    const [attRes, marksRes, subjectsRes, leavesRes] = await Promise.all([
      supabase.from('day_attendance').select('status').eq('student_id', prof.id),
      supabase.from('marks').select('marks_obtained, max_marks').eq('student_id', prof.id),
      supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('section', section).eq('semester', sem),
      supabase.from('leaves').select('id', { count: 'exact', head: true }).eq('applicant_id', prof.id).eq('status', 'PENDING'),
    ])

    const att = attRes.data ?? []
    const attTotal = att.length
    const attPresent = att.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length
    const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0

    const marks = marksRes.data ?? []
    const totalObtained = marks.reduce((s, m) => s + Number(m.marks_obtained), 0)
    const totalMax = marks.reduce((s, m) => s + Number(m.max_marks), 0)
    const avgMarksPct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0

    setStats([
      { label: "My Attendance",  value: attTotal ? `${attendancePct}%` : "—", sub: attTotal ? `${attPresent}/${attTotal} sessions` : "No records yet", icon: ClipboardCheck },
      { label: "Avg. Marks",     value: totalMax ? `${avgMarksPct}%` : "—",   sub: marks.length ? "All subjects" : "No marks yet", icon: Award },
      { label: "Subjects",       value: String(subjectsRes.count ?? 0), sub: `Semester ${sem} · ${section}`, icon: BookOpen },
      { label: "Pending Leaves", value: String(leavesRes.count ?? 0),  sub: "Your applications", icon: Heart },
    ])
  }

  // ── Shared activity feed (notices + events) ───────────────
  const loadFeed = async (au: AuthUser, prof: Profile | null) => {
    const role = au.type === 'staff' ? au.data.role : 'STUDENT'
    const isStudent = role === 'STUDENT'
    const isFaculty = role === 'PROFESSOR'

    let query = supabase.from('announcements').select('*')
      .order('created_at', { ascending: false })
      .limit(8)

    query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

    // Only notices and events belong in the feed; other audience prefixes hold
    // stored documents, timetables and feedback.
    const noticeAudiences = isStudent
      ? ['ALL', 'STUDENTS', prof?.section ?? '']
      : isFaculty ? ['ALL', 'PROFESSOR', 'FACULTY', ...SECTIONS]
      : ['ALL', 'STUDENTS', 'PROFESSOR', 'FACULTY', ...SECTIONS]
    query = query.or(`audience.in.(${quoted(noticeAudiences)}),audience.like.EVENT:*`)

    const { data } = await query
    if (!data) { setFeed([]); return }

    const items: FeedItem[] = data.slice(0, 6).map(a => {
      const isEvent = a.audience?.startsWith('EVENT:')
      let title = a.title
      let body = a.body
      if (isEvent) {
        try {
          const parsed = JSON.parse(a.body)
          title = parsed.title ?? a.title
          body = parsed.date ? `Scheduled for ${new Date(parsed.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""
        } catch { /* keep raw */ }
      }
      return {
        id: a.id,
        title,
        body,
        time: timeAgo(a.created_at),
        kind: isEvent ? "event" : (a.is_urgent ? "alert" : "notice"),
      }
    })
    setFeed(items)
  }

  const name = authUser?.data.name?.replace(/^(Dr|Mr|Ms|Mrs|Rev)\.?\s+/i, "").split(" ")[0] || ""
  const roleLabel = authUser?.type === 'staff' ? authUser.data.role : 'STUDENT'
  const heading = roleLabel === 'HOD' ? 'Department Overview' : roleLabel === 'PROFESSOR' ? 'Faculty Dashboard' : 'My Dashboard'
  const quickLinks = roleLabel === 'STUDENT'
    ? [['attendance', 'My attendance'], ['marks', 'My marks'], ['timetable', 'Timetable'], ['leaves', 'Apply for leave']]
    : roleLabel === 'PROFESSOR'
      ? [['attendance', 'Mark attendance'], ['marks', 'Enter marks'], ['timetable', 'Timetable'], ['notices', 'Post a notice']]
      : [['attendance', 'Attendance'], ['leaves', 'Review leaves'], ['alerts', 'Attendance alerts'], ['reports', 'Reports']]

  return (
    <div className="p-5 md:p-8 max-w-[1200px] space-y-8">
      {/* Welcome banner */}
      <section className="relative overflow-hidden bg-licet-indigo text-white px-6 py-7 md:px-8 border-b-[3px] border-licet-gold">
        <img src="/images.png" alt="" aria-hidden className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-[0.07] pointer-events-none" />
        <p className="text-[12px] font-bold tracking-[3px] uppercase text-licet-gold">{greeting}{name ? `, ${name}` : ""}</p>
        <h1 className="font-serif italic font-medium text-[38px] md:text-[46px] leading-tight mt-1 !text-white">{heading}</h1>
        <p className="text-[14px] text-licet-cream/80 mt-1">
          {subtitle || "Loading…"}{profile?.section ? ` · ${profile.section}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          {quickLinks.map(([id, label]) => (
            <button key={id} onClick={() => router.push(`/dashboard/${id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium border border-licet-gold/50 text-licet-cream hover:bg-licet-gold hover:text-licet-indigo transition-colors">
              {label} <ArrowRight size={13} />
            </button>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border border-t-[3px] border-t-licet-gold p-5 h-[120px] animate-pulse">
              <div className="w-3/5 h-2.5 bg-muted mb-5" />
              <div className="w-2/5 h-6 bg-muted" />
            </div>
          ))
        ) : stats.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-card border border-border border-t-[3px] border-t-licet-gold p-5 hover:shadow-md hover:shadow-licet-indigo/5 transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10.5px] font-bold tracking-[2px] uppercase text-muted-foreground">{label}</span>
              <span className="w-8 h-8 flex items-center justify-center bg-licet-cream text-licet-indigo shrink-0">
                <Icon size={15} />
              </span>
            </div>
            <p className="font-serif text-[34px] font-semibold leading-none text-licet-indigo mt-3">{value}</p>
            {sub && <p className="text-[12px] text-muted-foreground mt-1.5">{sub}</p>}
          </div>
        ))}
      </section>

      {roleLabel === 'HOD' && !loading && (
        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-licet-paper/70">
              <h2 className="font-serif text-[22px] font-semibold">Needs your attention</h2>
            </div>
            <ul className="divide-y divide-border">
              {actions.map(a => (
                <li key={a.label}>
                  <button onClick={() => router.push(a.href)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-licet-cream/40 transition-colors">
                    <span className={`min-w-9 h-7 px-2 rounded-full flex items-center justify-center text-[13px] font-bold ${a.count === 0 ? 'bg-green-50 text-green-800' : a.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-licet-cream text-licet-indigo'}`}>{a.count}</span>
                    <span className="flex-1 text-[14px] text-licet-indigo">{a.label}</span>
                    <ArrowRight size={15} className="text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-licet-paper/70">
              <h2 className="font-serif text-[22px] font-semibold">Section strength</h2>
            </div>
            <div className="p-5 space-y-2.5">
              {strength.map(({ section, count }) => {
                const max = Math.max(1, ...strength.map(x => x.count))
                return (
                  <div key={section} className="flex items-center gap-3">
                    <span className="w-20 text-[12.5px] font-semibold text-licet-indigo">{section}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-licet-violet" style={{ width: `${count / max * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-[12.5px] tabular-nums text-muted-foreground">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Recent news / events — styled like the news panel on licet.ac.in */}
      <section className="bg-licet-cream p-6 md:p-7">
        <h2 className="font-serif text-[26px] font-semibold">Recent News / Events</h2>
        <div className="h-[2px] w-14 bg-licet-indigo/50 mt-2 mb-4" />

        {loading ? (
          <p className="text-[13px] text-muted-foreground py-6 text-center">Loading…</p>
        ) : feed.length === 0 ? (
          <div className="py-8 text-center">
            <Bell size={22} className="mx-auto mb-2 text-licet-indigo/30" />
            <p className="text-[13px] text-muted-foreground">No recent notices or events.</p>
          </div>
        ) : (
          <ul className="bg-white divide-y divide-border border border-border">
            {feed.map(item => {
              const Icon = item.kind === "event" ? CalendarDays : item.kind === "alert" ? AlertTriangle : Bell
              return (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className={`w-8 h-8 flex items-center justify-center shrink-0 ${item.kind === "alert" ? "bg-amber-100 text-amber-700" : "bg-licet-parchment text-licet-indigo"}`}>
                    <Icon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-licet-indigo">{item.title}</p>
                    {item.body && <p className="text-[12.5px] text-muted-foreground truncate">{item.body}</p>}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{item.time}</span>
                </li>
              )
            })}
          </ul>
        )}
        <button onClick={() => router.push('/dashboard/notices')}
          className="mt-4 inline-flex items-center gap-1.5 font-serif italic text-[18px] text-licet-indigo underline decoration-licet-gold decoration-2 underline-offset-4 hover:text-licet-violet">
          More news &amp; notices <ArrowRight size={15} />
        </button>
      </section>
    </div>
  )
}
