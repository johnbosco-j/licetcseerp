"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import type { LucideIcon } from "lucide-react"
import {
  Users, ClipboardCheck, Award, BookOpen, TrendingUp, TrendingDown,
  AlertTriangle, Bell, CalendarDays, ArrowUpRight, ArrowDownRight,
  Minus, Heart, FileCheck
} from "lucide-react"
import { Inter, Crimson_Text } from "next/font/google"

const serif = Crimson_Text({ subsets: ["latin"], weight: ["400", "600"] })
const sans  = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] })

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

    const [studentsRes, subjectsRes, attRes, marksRes, leavesRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT'),
      supabase.from('subjects').select('id', { count: 'exact', head: true }),
      supabase.from('attendance').select('status'),
      supabase.from('marks').select('marks_obtained, max_marks'),
      supabase.from('leaves').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    ])

    const totalStudents = studentsRes.count ?? 0
    const totalSubjects = subjectsRes.count ?? 0
    const pendingLeaves = leavesRes.count ?? 0

    const att = attRes.data ?? []
    const attTotal = att.length
    const attPresent = att.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length
    const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0

    const marks = marksRes.data ?? []
    const passCount = marks.filter(m => Number(m.marks_obtained) >= Number(m.max_marks) * 0.4).length
    const passRate = marks.length > 0 ? Math.round((passCount / marks.length) * 100) : 0

    setStats([
      { label: "Total Students",  value: String(totalStudents), sub: "Across 8 sections", icon: Users },
      { label: "Avg. Attendance", value: `${attendancePct}%`,   sub: "All recorded sessions", icon: ClipboardCheck },
      { label: "Pass Rate",       value: `${passRate}%`,        sub: "All internal assessments", icon: Award },
      { label: "Pending Leaves",  value: String(pendingLeaves), sub: "Awaiting your approval", icon: Heart },
    ])
  }

  // ── Faculty overview ──────────────────────────────────────
  const loadFaculty = async (prof: Profile | null) => {
    setSubtitle("Department of Computer Science & Engineering · Faculty Overview")
    if (!prof) { setStats([]); return }

    const marksRes = await supabase.from('marks').select('subject_id, student_id').eq('faculty_id', prof.id)
    const marks = marksRes.data ?? []
    const subjectIds = Array.from(new Set(marks.map(m => m.subject_id)))
    const studentIds = Array.from(new Set(marks.map(m => m.student_id)))

    const [subjectsRes, leavesRes, gradedRes] = await Promise.all([
      subjectIds.length
        ? supabase.from('subjects').select('id', { count: 'exact', head: true }).in('id', subjectIds)
        : Promise.resolve({ count: 0 } as { count: number }),
      supabase.from('leaves').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('marks').select('marks_obtained, max_marks').eq('faculty_id', prof.id),
    ])

    const graded = gradedRes.data ?? []
    const passCount = graded.filter(m => Number(m.marks_obtained) >= Number(m.max_marks) * 0.4).length
    const passRate = graded.length > 0 ? Math.round((passCount / graded.length) * 100) : 0

    setStats([
      { label: "My Subjects",     value: String(subjectsRes.count ?? subjectIds.length), sub: "Assigned this semester", icon: BookOpen },
      { label: "Students Taught", value: String(studentIds.length), sub: "Across your subjects", icon: Users },
      { label: "Pass Rate",       value: `${passRate}%`, sub: "Your evaluated marks", icon: Award },
      { label: "Pending Leaves",  value: String(leavesRes.count ?? 0), sub: "Department-wide", icon: Heart },
    ])
  }

  // ── Student overview ──────────────────────────────────────
  const loadStudent = async (prof: Profile | null) => {
    setSubtitle("Your Academic Snapshot")
    if (!prof) { setStats([]); return }

    const section = prof.section ?? ''
    const sem = currentSem(section)

    const [attRes, marksRes, subjectsRes, leavesRes] = await Promise.all([
      supabase.from('attendance').select('status').eq('student_id', prof.id),
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
      { label: "My Attendance",  value: `${attendancePct}%`, sub: attTotal ? `${attPresent}/${attTotal} sessions` : "No records yet", icon: ClipboardCheck },
      { label: "Avg. Marks",     value: `${avgMarksPct}%`,   sub: marks.length ? "All subjects" : "No marks yet", icon: Award },
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

    if (isStudent) {
      const section = prof?.section ?? ''
      query = query.in('audience', ['ALL', 'STUDENTS', section])
    } else if (isFaculty) {
      query = query.in('audience', ['ALL', 'PROFESSOR'])
    }

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

  const name = authUser?.data.name?.split(" ")[0] || ""
  const roleLabel = authUser?.type === 'staff' ? authUser.data.role : 'STUDENT'

  return (
    <div className={sans.className} style={{ padding: "28px 32px", maxWidth: "1200px" }}>
      {/* Welcome section */}
      <section style={{ marginBottom: "28px" }}>
        <p style={{
          fontSize: "13px",
          color: "#78716C",
          margin: "0 0 4px",
          fontWeight: 400,
        }}>
          {greeting}{name ? `, ${name}` : ""}
        </p>
        <h1 className={serif.className} style={{
          fontSize: "28px",
          color: "#292524",
          margin: 0,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}>
          {roleLabel === 'HOD' ? 'Department Overview'
            : roleLabel === 'PROFESSOR' ? 'Faculty Dashboard'
            : 'My Dashboard'}
        </h1>
        <p style={{
          fontSize: "13px",
          color: "#A8A29E",
          margin: "6px 0 0",
          fontWeight: 400,
        }}>
          {subtitle || "Loading…"}
          {profile?.section ? ` · ${profile.section}` : ""}
        </p>
      </section>

      {/* Stats */}
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "28px",
      }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              background: "#FFFFFF", border: "1px solid #DDD8D0", borderRadius: "5px",
              padding: "20px", height: "92px",
            }}>
              <div style={{ width: "60%", height: "10px", background: "#F1EFEB", borderRadius: "3px", marginBottom: "16px" }} />
              <div style={{ width: "40%", height: "20px", background: "#F1EFEB", borderRadius: "3px" }} />
            </div>
          ))
        ) : stats.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} style={{
            background: "#FFFFFF",
            border: "1px solid #DDD8D0",
            borderRadius: "5px",
            padding: "20px",
            transition: "box-shadow 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#A8A29E",
                textTransform: "uppercase",
              }}>
                {label}
              </span>
              <div style={{
                width: "28px",
                height: "28px",
                borderRadius: "4px",
                background: "#FAFAF8",
                border: "1px solid #E7E5E0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={13} color="#78716C" />
              </div>
            </div>
            <p className={serif.className} style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "#292524",
              margin: "0 0 2px",
            }}>
              {value}
            </p>
            {sub && (
              <p style={{ fontSize: "11px", color: "#A8A29E", margin: 0 }}>{sub}</p>
            )}
          </div>
        ))}
      </section>

      {/* Activity feed */}
      <section>
        <h2 className={serif.className} style={{
          fontSize: "16px", fontWeight: 600, color: "#292524", margin: "0 0 14px",
        }}>
          Recent Activity
        </h2>

        {loading ? (
          <div style={{ background: "#FFFFFF", border: "1px solid #DDD8D0", borderRadius: "5px", padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: "12px", color: "#A8A29E", margin: 0 }}>Loading…</p>
          </div>
        ) : feed.length === 0 ? (
          <div style={{ background: "#FFFFFF", border: "1px solid #DDD8D0", borderRadius: "5px", padding: "32px", textAlign: "center" }}>
            <Bell size={20} color="#DDD8D0" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: "12px", color: "#A8A29E", margin: 0 }}>No recent notices or events.</p>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #DDD8D0", borderRadius: "5px", overflow: "hidden" }}>
            {feed.map((item, i) => {
              const Icon = item.kind === "event" ? CalendarDays : item.kind === "alert" ? AlertTriangle : Bell
              const iconColor = item.kind === "alert" ? "#B45309" : item.kind === "event" ? "#0E7490" : "#78716C"
              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "12px",
                  padding: "14px 18px",
                  borderBottom: i < feed.length - 1 ? "1px solid #F1EFEB" : "none",
                }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "4px",
                    background: "#FAFAF8", border: "1px solid #E7E5E0",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon size={13} color={iconColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", color: "#292524", margin: "0 0 2px", fontWeight: 500 }}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p style={{ fontSize: "12px", color: "#A8A29E", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.body}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "#D6D3D1", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {item.time}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}