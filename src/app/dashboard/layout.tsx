"use client"
import React from "react"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { 
  AlertCircle, Activity, Star, ClipboardCheck, PieChart, Key, FileText,
  PenTool, CalendarDays, BookOpen, MessageSquare, Wallet, AlertTriangle,
  Package, Heart, Award, ShieldCheck, Bell, Briefcase, TrendingUp,
  FileBarChart, Users, Library, Clock, LogOut, LayoutDashboard, ChevronRight, Menu,
  BarChart3
} from "lucide-react"
import type { AuthUser } from "@/lib/auth"
import { getAllowedModules } from "@/lib/roles"
import { toTitleCase } from "@/lib/utils"
import { Inter, Crimson_Text } from "next/font/google"

const serif = Crimson_Text({ subsets: ["latin"], weight: ["400", "600"] })
const sans  = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] })

const NAV_GROUPS = [
  {
    title: "Academic",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",       id: "dashboard" },
      { icon: Users,           label: "Students",        id: "students" },
      { icon: ClipboardCheck,  label: "Attendance",      id: "attendance" },
      { icon: Award,           label: "Marks",           id: "marks" },
      { icon: Library,         label: "Subjects",        id: "subjects" },
      { icon: Clock,           label: "Timetable",       id: "timetable" },
      { icon: BookOpen,        label: "Examination",     id: "examination" },
      { icon: BarChart3,       label: "Analytics",       id: "analytics" },
    ]
  },
  {
    title: "Administration",
    items: [
      { icon: Wallet,          label: "Finance",         id: "finance" },
      { icon: Package,         label: "Inventory",       id: "inventory" },
      { icon: Briefcase,       label: "Placements",      id: "placements" },
      { icon: Heart,           label: "Leaves",          id: "leaves" },
      { icon: CalendarDays,    label: "Events",          id: "events" },
    ]
  },
  {
    title: "Records",
    items: [
      { icon: FileText,        label: "Documents",       id: "documents" },
      { icon: MessageSquare,   label: "Feedback",        id: "feedback" },
      { icon: AlertTriangle,   label: "Grievances",      id: "grievances" },
      { icon: Bell,            label: "Notices",         id: "notices" },
      { icon: AlertCircle,     label: "Alerts",          id: "alerts" },
    ]
  },
  {
    title: "Faculty",
    items: [
      { icon: Star,            label: "Appraisal",       id: "appraisal" },
      { icon: PieChart,        label: "Att. Analysis",   id: "attendance-analysis" },
      { icon: PenTool,         label: "Editor",          id: "editor" },
      { icon: ShieldCheck,     label: "NAAC",            id: "naac" },
      { icon: TrendingUp,      label: "Promotion",       id: "promotion" },
      { icon: FileBarChart,    label: "Reports",         id: "reports" },
      { icon: Key,             label: "Change Password", id: "change-password" },
    ]
  },
]

const ROLE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  HOD:       { label: "Head of Department", bg: "#722F37", color: "#FFFFFF" },
  PROFESSOR: { label: "Faculty",            bg: "#E7E5E0", color: "#57534E" },
  STUDENT:   { label: "Student",            bg: "#F5F5F0", color: "#78716C" },
}


// Logo with text fallback if SVG fails to load
function LogoBadge({ size = 30 }: { size?: number }) {
  const [err, setErr] = React.useState(false)
  if (err) return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#1d3557', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 800, letterSpacing: '0.02em',
      flexShrink: 0,
    }}>L</div>
  )
  return <img src="/images.png" alt="LICET" onError={() => setErr(true)}
    style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [time, setTime]         = useState("")
  const [date, setDate]         = useState("")
  const [allowed, setAllowed]   = useState<string[]>([])
  const [name, setName]         = useState("")
  const [role, setRole]         = useState("")
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobile] = useState(false)

  useEffect(() => {
    let stored = localStorage.getItem("licet_user")
    if (!stored) {
      // Migrate legacy key from previous branding
      const legacy = localStorage.getItem("excelsior_user")
      if (legacy) {
        localStorage.setItem("licet_user", legacy)
        localStorage.removeItem("excelsior_user")
        stored = legacy
      }
    }
    if (!stored) { router.push("/login"); return }
    const user = JSON.parse(stored) as AuthUser
    if (!user || !user.data) { localStorage.removeItem("licet_user"); router.push("/login"); return }
    setAllowed(getAllowedModules(user.type, user.type === "staff" ? user.data.role : ""))
    setName(user.data.name || "")
    setRole(user.type === "staff" ? user.data.role : "STUDENT")
    const tick = () => {
      const n = new Date()
      setTime(n.toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" }))
      setDate(n.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
    }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [router])

  const logout = () => { localStorage.removeItem("licet_user"); router.push("/login") }

  const navigateTo = (id: string) => {
    router.push(id === "dashboard" ? "/dashboard" : `/dashboard/${id}`)
    setMobile(false)
  }

  const activeId = (() => {
    if (pathname === "/dashboard" || pathname === "/dashboard/") return "dashboard"
    const seg = pathname?.split("/")[2] ?? "dashboard"
    return seg
  })()

  const rc = ROLE_CONFIG[role] || ROLE_CONFIG.STUDENT
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden ${sans.className}`} style={{ background: "#F1EFEB" }}>
      {/* Header */}
      <header style={{
        background: "#FFFFFF",
        borderBottom: "1px solid #DDD8D0",
        height: "54px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        zIndex: 40,
        position: "relative",
      }}>
        <button
          onClick={() => setMobile(!mobileOpen)}
          className="mobile-btn"
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#A8A29E",
            padding: "6px",
            marginRight: "8px",
            borderRadius: "4px",
          }}
        >
          <Menu size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "6px",
            background: "#FFFFFF",
            border: "1px solid #DDD8D0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: "3px",
          }}>
            <img src="/images.png" alt="LICET" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className={serif.className} style={{
                fontSize: "16px",
                color: "#292524",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}>
                LICET CSE&ndash;ERP
              </span>
            </div>
            <p style={{
              fontSize: "9px",
              color: "#A8A29E",
              margin: 0,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}>
              Dept. of Computer Science &amp; Engineering
            </p>
          </div>
        </div>

        <div className="hide-mobile" style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#292524",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}>
            {time}
          </span>
          <span style={{ fontSize: "9px", color: "#A8A29E", fontWeight: 500 }}>
            {date}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
          <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "#292524", margin: 0, lineHeight: 1.3 }}>
                {name}
              </p>
              <span style={{
                display: "inline-block",
                fontSize: "9px",
                fontWeight: 600,
                padding: "1px 7px",
                borderRadius: "3px",
                letterSpacing: "0.06em",
                background: rc.bg,
                color: rc.color,
              }}>
                {rc.label.toUpperCase()}
              </span>
            </div>
            <div style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "#E7E5E0",
              color: "#57534E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              flexShrink: 0,
              border: "1px solid #DDD8D0",
            }}>
              {initials || "?"}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px",
              borderRadius: "4px",
              background: "transparent",
              color: "#A8A29E",
              border: "1px solid #E7E5E0",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 500,
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#FAFAF8"
              e.currentTarget.style.color = "#292524"
              e.currentTarget.style.borderColor = "#DDD8D0"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.color = "#A8A29E"
              e.currentTarget.style.borderColor = "#E7E5E0"
            }}
          >
            <LogOut size={13} />
            <span className="hide-mobile">Sign out</span>
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {mobileOpen && (
          <div
            onClick={() => setMobile(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(41, 37, 36, 0.2)", zIndex: 50 }}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
          style={{
            width: expanded ? "228px" : "50px",
            transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            background: "#292524",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
            zIndex: 60,
          }}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: expanded ? "flex-end" : "center",
              padding: expanded ? "0 12px" : "0",
              background: "none",
              border: "none",
              borderBottom: "1px solid #3E3A36",
              cursor: "pointer",
              color: "#78716C",
              transition: "color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#A8A29E")}
            onMouseLeave={e => (e.currentTarget.style.color = "#78716C")}
          >
            <ChevronRight
              size={14}
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          <div
            className="nav-scroll"
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}
          >
            {NAV_GROUPS.map(group => {
              const visibleItems = group.items.filter(i => allowed.includes(i.id))
              if (visibleItems.length === 0) return null
              return (
                <div key={group.title} style={{ marginBottom: "4px" }}>
                  {expanded && (
                    <p style={{
                      fontSize: "8px",
                      fontWeight: 600,
                      letterSpacing: "0.14em",
                      color: "#78716C",
                      textTransform: "uppercase",
                      padding: "8px 14px 4px",
                      margin: 0,
                    }}>
                      {group.title}
                    </p>
                  )}
                  {visibleItems.map(({ icon: Icon, label, id }) => {
                    const active = activeId === id
                    return (
                      <button
                        key={id}
                        onClick={() => navigateTo(id)}
                        title={!expanded ? label : undefined}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: expanded ? "6px 14px" : "6px 0",
                          justifyContent: expanded ? "flex-start" : "center",
                          background: active ? "rgba(114, 47, 55, 0.25)" : "transparent",
                          border: "none",
                          borderLeft: active ? "2px solid #722F37" : "2px solid transparent",
                          color: active ? "#FFFFFF" : "#A8A29E",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: active ? 500 : 400,
                          whiteSpace: "nowrap",
                          textAlign: "left",
                          transition: "all 0.1s ease",
                        }}
                        onMouseEnter={e => {
                          if (!active) {
                            e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                            e.currentTarget.style.color = "#D6D3D1"
                          }
                        }}
                        onMouseLeave={e => {
                          if (!active) {
                            e.currentTarget.style.background = "transparent"
                            e.currentTarget.style.color = "#A8A29E"
                          }
                        }}
                      >
                        <Icon size={14} style={{ flexShrink: 0 }} />
                        {expanded && (
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div style={{ borderTop: "1px solid #3E3A36", padding: "12px 14px", flexShrink: 0 }}>
            {expanded ? (
              <div>
                <p style={{
                  fontSize: "8px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  color: "#78716C",
                  margin: "0 0 2px",
                  textTransform: "uppercase",
                }}>
                  Loyola-ICAM
                </p>
                <p style={{ fontSize: "8px", color: "#57534E", margin: 0, fontWeight: 400 }}>
                  Established 2009
                </p>
              </div>
            ) : (
              <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#722F37",
                margin: "0 auto",
              }} />
            )}
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ height: "3px", background: "#722F37", flexShrink: 0 }} />
          <div
            id="scroll-container"
            style={{
              flex: 1,
              overflowY: "auto",
              background: "#F1EFEB",
              scrollbarWidth: "thin",
              scrollbarColor: "#DDD8D0 transparent",
            }}
          >
            {children}
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .nav-scroll::-webkit-scrollbar { width: 3px; }
        .nav-scroll::-webkit-scrollbar-thumb { background: #44403C; border-radius: 3px; }
        #scroll-container::-webkit-scrollbar { width: 5px; }
        #scroll-container::-webkit-scrollbar-thumb { background: #DDD8D0; border-radius: 3px; }
        #scroll-container::-webkit-scrollbar-thumb:hover { background: #A8A29E; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .mobile-btn { display: flex !important; }
          .sidebar { position: fixed !important; top: 54px !important; left: 0 !important; bottom: 0 !important; width: 228px !important; transform: translateX(-100%) !important; transition: transform 0.25s cubic-bezier(0.4,0,0.2,1) !important; }
          .sidebar.mobile-open { transform: translateX(0) !important; }
        }
      `}} />
    </div>
  )
}
