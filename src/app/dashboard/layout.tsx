"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  AlertCircle, Star, ClipboardCheck, PieChart, Key, FileText,
  PenTool, CalendarDays, BookOpen, MessageSquare, Wallet, AlertTriangle,
  Package, Heart, Award, ShieldCheck, Bell, Briefcase, TrendingUp,
  FileBarChart, Users, Library, Clock, LogOut, LayoutDashboard, ChevronLeft, Menu, X,
  BarChart3, Search, UserCog, History, WifiOff, ChevronDown, GraduationCap, type LucideIcon
} from "lucide-react"
import type { AuthUser } from "@/lib/auth"
import { signOut } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { getAllowedModules } from "@/lib/roles"
import { LicetLogo } from "@/components/licet-brand"

type NavItem = { icon: LucideIcon; label: string; id: string }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Academic",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",       id: "dashboard" },
      { icon: Users,           label: "Students",        id: "students" },
      { icon: ClipboardCheck,  label: "Attendance",      id: "attendance" },
      { icon: Award,           label: "Marks",           id: "marks" },
      { icon: Library,         label: "Subjects",        id: "subjects" },
      { icon: GraduationCap,   label: "Curriculum",      id: "curriculum" },
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
      { icon: UserCog,         label: "Accounts",        id: "accounts" },
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
      { icon: History,         label: "Audit Log",       id: "audit" },
    ]
  },
  {
    title: "Faculty & Quality",
    items: [
      { icon: Star,            label: "Appraisal",       id: "appraisal" },
      { icon: PieChart,        label: "Att. Analysis",   id: "attendance-analysis" },
      { icon: PenTool,         label: "Editor",          id: "editor" },
      { icon: ShieldCheck,     label: "NAAC / NBA",      id: "naac" },
      { icon: TrendingUp,      label: "Promotion",       id: "promotion" },
      { icon: FileBarChart,    label: "Reports",         id: "reports" },
    ]
  },
]
const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

const ROLE_LABEL: Record<string, string> = {
  HOD: "Head of Department",
  PROFESSOR: "Faculty",
  STUDENT: "Student",
}

const hrefFor = (id: string) => (id === "dashboard" ? "/dashboard" : `/dashboard/${id}`)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady]         = useState(false)
  const [now, setNow]             = useState<Date | null>(null)
  const [allowed, setAllowed]     = useState<string[]>([])
  const [name, setName]           = useState("")
  const [role, setRole]           = useState("")
  const [section, setSection]     = useState<string | null>(null)
  const [mustChange, setMustChange] = useState(false)
  const [expanded, setExpanded]   = useState(true)
  const [mobileOpen, setMobile]   = useState(false)
  const [query, setQuery]         = useState("")
  const [menuOpen, setMenuOpen]   = useState(false)
  const [offline, setOffline]     = useState(false)
  const [toast, setToast]         = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const activeId = pathname === "/dashboard" || pathname === "/dashboard/"
    ? "dashboard"
    : pathname?.split("/")[2] ?? "dashboard"

  // Session + live profile check on every dashboard load.
  useEffect(() => {
    let active = true
    const goLogin = () => { localStorage.removeItem("licet_user"); router.replace("/login") }

    const init = async () => {
      localStorage.removeItem("excelsior_user")
      const stored = localStorage.getItem("licet_user")
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      let user: AuthUser | null = null
      try { user = stored ? (JSON.parse(stored) as AuthUser) : null } catch { user = null }
      if (!session || !user?.data || session.user.id !== user.data.id) return goLogin()

      // Re-read role/flags from the database so changes (and tampering) take effect.
      const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single()
      if (!active) return
      if (error || !profile || !profile.is_active) {
        await supabase.auth.signOut()
        return goLogin()
      }
      const type = profile.role === "STUDENT" ? "student" : "staff"
      const fresh = { type, data: { ...user.data, ...profile, name: profile.full_name } } as AuthUser
      localStorage.setItem("licet_user", JSON.stringify(fresh))

      setAllowed(getAllowedModules({ type, role: profile.role, advisor_section: profile.advisor_section, can_reset_passwords: profile.can_reset_passwords }))
      setName(profile.full_name || "")
      setRole(profile.role)
      setSection(profile.section ?? null)
      setMustChange(!!profile.must_change_password)
      setReady(true)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") goLogin()
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [router])

  // Keep people on allowed pages; force the password change when required.
  useEffect(() => {
    if (!ready) return
    if (mustChange && activeId !== "change-password") router.replace("/dashboard/change-password")
    else if (!mustChange && !allowed.includes(activeId)) router.replace("/dashboard")
  }, [ready, mustChange, activeId, allowed, router])

  useEffect(() => {
    const onFlag = () => setMustChange(false)
    window.addEventListener("licet:password-changed", onFlag)
    return () => window.removeEventListener("licet:password-changed", onFlag)
  }, [])

  useEffect(() => {
    setNow(new Date())
    const iv = setInterval(() => setNow(new Date()), 30_000)
    const on = () => setOffline(false), off = () => setOffline(true)
    setOffline(!navigator.onLine)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")
      if (e.key === "/" && !typing) { e.preventDefault(); setExpanded(true); searchRef.current?.focus() }
      if (e.key === "Escape") { setMobile(false); setMenuOpen(false) }
    }
    window.addEventListener("keydown", onKey)
    let toastTimer: ReturnType<typeof setTimeout> | undefined
    const onFailure = (e: PromiseRejectionEvent | ErrorEvent) => {
      const msg = e instanceof PromiseRejectionEvent ? String(e.reason?.message ?? e.reason ?? '') : e.message
      if (/ResizeObserver|AbortError/i.test(msg)) return
      setToast(/fetch|network/i.test(msg)
        ? "Couldn't reach the server. Check your connection and try again."
        : "Something went wrong. Please try again — if it keeps happening, contact the department office.")
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setToast(''), 6000)
    }
    window.addEventListener("unhandledrejection", onFailure)
    window.addEventListener("error", onFailure)
    return () => {
      clearTimeout(toastTimer)
      window.removeEventListener("unhandledrejection", onFailure)
      window.removeEventListener("error", onFailure)
      clearInterval(iv)
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  useEffect(() => { setMobile(false); setMenuOpen(false) }, [pathname])

  const visibleGroups = useMemo(() => {
    if (mustChange) return [{ title: "Security", items: [{ icon: Key, label: "Change Password", id: "change-password" }] }]
    const q = query.trim().toLowerCase()
    return NAV_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(i => allowed.includes(i.id) && (!q || i.label.toLowerCase().includes(q))),
    })).filter(g => g.items.length)
  }, [allowed, query, mustChange])

  const logout = async () => {
    await signOut()
    router.replace("/login")
  }

  const current = ALL_ITEMS.find(i => i.id === activeId) ?? (activeId === "change-password" ? { label: "Change Password" } : null)
  const initials = name.replace(/^(Dr|Mr|Ms|Mrs|Rev)\.?\s+/i, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const time = now?.toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" }) ?? ""
  const date = now?.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? ""
  const showText = expanded || mobileOpen

  if (!ready) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-licet-indigo">
        <div className="flex flex-col items-center gap-4 text-licet-cream">
          <img src="/images.png" alt="" className="w-16 h-16 rounded-full bg-white p-1 animate-pulse" />
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      {/* Utility strip — same as the top bar on licet.ac.in */}
      <div className="hidden md:flex h-9 shrink-0 items-center gap-6 px-6 bg-licet-indigo border-b-[3px] border-licet-gold text-[12px]">
        <nav className="flex items-center gap-5 text-licet-cream" aria-label="LICET links">
          <a href="https://licet.ac.in/help-desk/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D] transition-colors">Help Desk</a>
          <a href="https://licet.ac.in/examination/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D] transition-colors">Examinations</a>
          <a href="http://moodle.licet.ac.in/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D] transition-colors">Moodle</a>
          <a href="https://licet.ac.in/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D] transition-colors">licet.ac.in</a>
        </nav>
        <span className="mx-auto text-white/80 tabular-nums">{date}{time && <> &nbsp;·&nbsp; {time}</>}</span>
        <span className="text-[13px] text-licet-gold">Anna University Counselling Code : 1450</span>
      </div>

      {/* Brand bar */}
      <header className="h-16 shrink-0 flex items-center gap-4 px-4 md:px-6 z-40 relative text-white"
        style={{ background: "linear-gradient(180deg, #1A0C4E 0%, #2A1A63 100%)" }}>
        <button onClick={() => setMobile(!mobileOpen)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}
          className="md:hidden p-2 -ml-1 rounded-md text-licet-cream hover:bg-white/10">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href="/dashboard" className="flex items-center gap-4 min-w-0" aria-label="Dashboard home">
          <LicetLogo className="h-10 w-auto" />
          <span className="hidden sm:block h-8 w-px bg-licet-gold/50" />
          <span className="hidden sm:flex flex-col items-start leading-tight min-w-0">
            <span className="font-display uppercase font-bold tracking-wide text-[17px] text-white">CSE ERP</span>
            <span className="text-[10px] font-semibold tracking-[2px] uppercase text-licet-gold truncate">Dept. of Computer Science &amp; Engineering</span>
          </span>
        </Link>

        <div className="ml-auto relative">
          <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-full md:rounded-md pl-1 pr-1 md:pr-3 py-1 hover:bg-white/10 transition-colors">
            <span className="w-9 h-9 rounded-full bg-licet-cream text-licet-indigo border-2 border-licet-gold flex items-center justify-center text-[12px] font-bold shrink-0">
              {initials || "?"}
            </span>
            <span className="hidden md:block text-left leading-tight">
              <span className="block text-[13px] font-medium text-white max-w-[220px] truncate">{name}</span>
              <span className="block text-[10px] font-bold tracking-[2px] uppercase text-licet-gold">
                {ROLE_LABEL[role] ?? role}{role === "STUDENT" && section ? ` · ${section}` : ""}
              </span>
            </span>
            <ChevronDown size={14} className="hidden md:block text-licet-cream/70" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 mt-2 w-56 z-50 rounded-lg bg-white text-foreground shadow-xl shadow-licet-indigo/20 border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border md:hidden">
                  <p className="text-[13px] font-semibold text-licet-indigo truncate">{name}</p>
                  <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
                </div>
                <Link href="/dashboard/change-password" role="menuitem"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-licet-cream/60">
                  <Key size={15} className="text-licet-violet" /> Change password
                </Link>
                <button onClick={logout} role="menuitem"
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-700 hover:bg-red-50 border-t border-border">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {offline && (
        <div role="status" className="shrink-0 flex items-center justify-center gap-2 bg-amber-100 text-amber-900 text-[12.5px] py-1.5 border-b border-amber-200">
          <WifiOff size={14} /> You&rsquo;re offline — changes won&rsquo;t be saved until your connection is back.
        </div>
      )}
      {mustChange && (
        <div role="status" className="shrink-0 bg-licet-cream text-licet-indigo text-[13px] py-2 px-4 text-center border-b border-licet-gold">
          For your security, please set a new password before continuing.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {mobileOpen && (
          <div onClick={() => setMobile(false)} className="md:hidden fixed inset-0 top-16 bg-licet-indigo/40 backdrop-blur-[1px] z-40" />
        )}

        {/* Sidebar */}
        <aside
          aria-label="Main menu"
          className={`bg-licet-indigo flex flex-col shrink-0 overflow-hidden z-50 transition-[width,transform] duration-200 ease-out
            max-md:fixed max-md:top-16 max-md:bottom-0 max-md:left-0 max-md:w-72 max-md:shadow-2xl
            ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
            ${expanded ? "md:w-64" : "md:w-[68px]"}`}
        >
          <div className={`flex items-center gap-2 border-b border-white/10 ${showText ? "p-3" : "p-2 justify-center"}`}>
            {showText ? (
              <label className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md bg-white/[0.07] border border-white/10 focus-within:border-licet-gold/70 transition-colors">
                <Search size={14} className="text-licet-cream/60 shrink-0" />
                <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a module…"
                  aria-label="Find a module" className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-licet-cream/40 outline-none" />
                <kbd className="hidden md:inline text-[10px] text-licet-cream/40 border border-white/15 rounded px-1">/</kbd>
              </label>
            ) : null}
            <button onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Collapse menu" : "Expand menu"}
              className="hidden md:flex w-9 h-9 items-center justify-center rounded-md text-licet-gold/70 hover:text-licet-gold hover:bg-white/5 shrink-0">
              <ChevronLeft size={16} className={`transition-transform ${expanded ? "" : "rotate-180"}`} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:thin] [scrollbar-color:#41317E_transparent]">
            {visibleGroups.length === 0 && (
              <p className="px-5 py-6 text-[12.5px] text-licet-cream/50">No module matches &ldquo;{query}&rdquo;.</p>
            )}
            {visibleGroups.map(group => (
              <div key={group.title} className="mb-1">
                {showText
                  ? <p className="px-5 pt-4 pb-1.5 text-[10px] font-bold tracking-[2.5px] uppercase text-licet-gold/70">{group.title}</p>
                  : <div className="mx-4 my-2.5 h-px bg-white/10" />}
                <ul className={showText ? "px-2.5 space-y-0.5" : "px-2 space-y-1"}>
                  {group.items.map(({ icon: Icon, label, id }) => {
                    const active = activeId === id
                    return (
                      <li key={id}>
                        <Link href={hrefFor(id)} prefetch title={!showText ? label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={`relative flex items-center gap-3 rounded-md text-[13.5px] whitespace-nowrap transition-colors
                            ${showText ? "px-3 py-2" : "justify-center py-2.5"}
                            ${active
                              ? "bg-white/[0.12] text-white font-semibold"
                              : "text-licet-cream/75 hover:bg-white/[0.06] hover:text-[#F8D88D]"}`}>
                          {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-licet-gold" />}
                          <Icon size={17} className={`shrink-0 ${active ? "text-licet-gold" : ""}`} />
                          {showText && <span className="truncate">{label}</span>}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 px-5 py-4 shrink-0">
            {showText ? (
              <div className="flex items-center gap-3">
                <img src="/images.png" alt="" className="w-9 h-9 rounded-full bg-white shrink-0" />
                <div className="min-w-0">
                  <p className="font-serif italic text-[16px] text-licet-gold leading-none">Luceat Lux Vestra</p>
                  <p className="text-[10px] tracking-[2px] uppercase text-licet-cream/55 mt-1">Let your light shine</p>
                </div>
              </div>
            ) : (
              <img src="/images.png" alt="" className="w-8 h-8 rounded-full bg-white mx-auto" />
            )}
          </div>
        </aside>

        {/* Main */}
        <main id="scroll-container" className="flex-1 overflow-y-auto flex flex-col [scrollbar-width:thin] [scrollbar-color:#DCCAA0_transparent]">
          {current && activeId !== "dashboard" && (
            <div className="px-5 md:px-8 pt-5 text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Link href="/dashboard" className="hover:text-licet-indigo">Dashboard</Link>
              <span aria-hidden>›</span>
              <span className="text-licet-indigo font-medium">{current.label}</span>
            </div>
          )}
          <div className="flex-1">{children}</div>
          {toast && (
            <div role="alert" className="fixed bottom-5 right-5 z-[70] max-w-sm flex items-start gap-3 rounded-lg bg-licet-indigo text-white px-4 py-3 shadow-2xl border-l-4 border-licet-gold text-[13px]">
              <AlertTriangle size={16} className="text-licet-gold mt-0.5 shrink-0" />
              <span className="flex-1">{toast}</span>
              <button onClick={() => setToast('')} aria-label="Dismiss" className="text-white/70 hover:text-white"><X size={15} /></button>
            </div>
          )}
          <footer className="shrink-0 bg-licet-parchment border-t border-border px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>© {now?.getFullYear() ?? ""} Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai</span>
            <span>Maintained by <span className="font-semibold text-licet-indigo">LICET · Department of CSE</span></span>
          </footer>
        </main>
      </div>
    </div>
  )
}
