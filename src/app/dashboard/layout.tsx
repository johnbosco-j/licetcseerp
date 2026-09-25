"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  AlertCircle, ClipboardCheck, PieChart, Key, FileText,
  PenTool, CalendarDays, BookOpen, MessageSquare, Wallet, AlertTriangle,
  Package, Award, ShieldCheck, Bell, Briefcase, TrendingUp,
  FileBarChart, Users, Library, Clock, LogOut, LayoutDashboard, ChevronLeft, Menu, X,
  BarChart3, Search, UserCog, History, WifiOff, ChevronDown, GraduationCap, ExternalLink, CalendarMinus, UserCheck, Scale, FileSpreadsheet, type LucideIcon
} from "lucide-react"
import type { AuthUser } from "@/lib/auth"
import { signOut } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { getAllowedModules } from "@/lib/roles"
import { setAcademicState } from "@/lib/semester"
import { Wordmark } from "@/components/licet-brand"

type NavItem = { icon: LucideIcon; label: string; id: string }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Academics",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",             id: "dashboard" },
      { icon: Users,           label: "Student Records",       id: "students" },
      { icon: ClipboardCheck,  label: "Attendance Register",   id: "attendance" },
      { icon: Award,           label: "Assessments & Marks",   id: "marks" },
      { icon: Library,         label: "Courses",               id: "subjects" },
      { icon: GraduationCap,   label: "Curriculum & Syllabus", id: "curriculum" },
      { icon: Clock,           label: "Class Timetable",       id: "timetable" },
      { icon: BookOpen,        label: "Examinations",          id: "examination" },
      { icon: BarChart3,       label: "Academic Analytics",    id: "analytics" },
    ]
  },
  {
    title: "Administration",
    items: [
      { icon: Wallet,          label: "Finance Ledger",        id: "finance" },
      { icon: Package,         label: "Assets & Inventory",    id: "inventory" },
      { icon: Briefcase,       label: "Training & Placement",  id: "placements" },
      { icon: CalendarMinus,   label: "Leave Management",      id: "leaves" },
      { icon: CalendarDays,    label: "Events & Activities",   id: "events" },
      { icon: UserCog,         label: "User Accounts",         id: "accounts" },
    ]
  },
  {
    title: "Records & Circulars",
    items: [
      { icon: FileText,        label: "Document Repository",   id: "documents" },
      { icon: MessageSquare,   label: "Course Feedback",       id: "feedback" },
      { icon: Scale,           label: "Grievance Redressal",   id: "grievances" },
      { icon: Bell,            label: "Notices & Circulars",   id: "notices" },
      { icon: AlertCircle,     label: "Attendance Alerts",     id: "alerts" },
      { icon: History,         label: "Audit Trail",           id: "audit" },
      { icon: FileSpreadsheet, label: "Data Export",           id: "export" },
    ]
  },
  {
    title: "Quality Assurance",
    items: [
      { icon: UserCheck,       label: "Faculty Appraisal",     id: "appraisal" },
      { icon: PieChart,        label: "Attendance Analysis",   id: "attendance-analysis" },
      { icon: PenTool,         label: "Document Editor",       id: "editor" },
      { icon: ShieldCheck,     label: "NAAC & NBA",            id: "naac" },
      { icon: TrendingUp,      label: "Year Promotion",        id: "promotion" },
      { icon: FileBarChart,    label: "Departmental Reports",  id: "reports" },
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
  const [designation, setDesignation] = useState<string | null>(null)
  const [closedGroups, setClosedGroups] = useState<string[]>([])
  const [tip, setTip]             = useState<{ label: string; top: number } | null>(null)
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
      // Academic state (latest promotion) drives the odd/even semester everywhere.
      const { data: academic } = await supabase.rpc("current_academic_state" as never)
      const ac = (academic ?? {}) as { academic_year?: string; promoted_at?: string }
      setAcademicState({ academicYear: ac.academic_year ?? null, promotedAt: ac.promoted_at ?? null })
      if (!active) return

      const type = profile.role === "STUDENT" ? "student" : "staff"
      const fresh = { type, data: { ...user.data, ...profile, name: profile.full_name } } as AuthUser
      localStorage.setItem("licet_user", JSON.stringify(fresh))

      setAllowed(getAllowedModules({ type, role: profile.role, advisor_section: profile.advisor_section, can_reset_passwords: profile.can_reset_passwords, access_tier: profile.access_tier }))
      setDesignation(profile.designation ?? null)
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

  useEffect(() => { setMobile(false); setMenuOpen(false); setTip(null) }, [pathname])

  // Collapsed menu groups are a per-browser convenience; storage may be unavailable.
  useEffect(() => {
    try { setClosedGroups(JSON.parse(localStorage.getItem("licet_nav_closed") ?? "[]")) } catch { /* ignore */ }
  }, [])
  const toggleGroup = (title: string) => setClosedGroups(prev => {
    const next = prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    try { localStorage.setItem("licet_nav_closed", JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

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

  const roleLine = `${designation ?? ROLE_LABEL[role] ?? role}${role === "STUDENT" && section ? ` · ${section}` : ""}`
  const openSearch = () => { setExpanded(true); setMobile(true); setTimeout(() => searchRef.current?.focus(), 60) }

  if (!ready) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-licet-indigo bg-[radial-gradient(80%_60%_at_50%_0%,#41317E_0%,transparent_70%)]">
        <div className="flex flex-col items-center gap-5 text-licet-cream">
          <span className="relative">
            <span className="absolute inset-0 rounded-full ring-2 ring-licet-gold/60 animate-ping" />
            <img src="/images.png" alt="" className="relative w-16 h-16 rounded-full bg-white p-1 ring-2 ring-licet-gold" />
          </span>
          <Wordmark size={24} />
          <p className="font-nav text-[11px] font-semibold tracking-[3px] uppercase text-licet-gold">Preparing your workspace</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      {/* Utility strip — mirrors the top bar on licet.ac.in */}
      <div className="hidden md:flex h-8 shrink-0 items-center gap-6 px-6 bg-[#120838] text-[11.5px] font-nav border-b border-licet-gold/40">
        <nav className="flex items-center gap-5 text-licet-cream/80" aria-label="LICET links">
          {[
            ["https://licet.ac.in/help-desk/", "Help Desk"],
            ["https://licet.ac.in/examination/", "Examinations"],
            ["http://moodle.licet.ac.in/", "Moodle"],
            ["https://licet.ac.in/", "licet.ac.in"],
          ].map(([href, label]) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[#F8D88D] transition-colors">
              {label}<ExternalLink size={10} className="opacity-50" />
            </a>
          ))}
        </nav>
        <span className="ml-auto text-licet-gold/90 tracking-wide">Anna University Counselling Code · <b className="text-[#F8D88D]">1450</b></span>
      </div>

      {/* Brand bar */}
      <header className="h-16 shrink-0 flex items-center gap-4 px-4 md:px-6 z-40 relative text-white
        bg-[linear-gradient(100deg,#1A0C4E_0%,#2A1A63_55%,#41317E_100%)] shadow-[0_6px_20px_-10px_rgba(26,12,78,0.6)]">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-licet-gold via-[#F8D88D] to-licet-gold opacity-90" />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
          <span className="absolute -right-10 -top-24 w-72 h-72 rounded-full bg-licet-gold/[0.07] blur-2xl" />
        </div>

        <button onClick={() => setMobile(!mobileOpen)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}
          className="md:hidden p-2 -ml-1 rounded-lg text-licet-cream hover:bg-white/10">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href="/dashboard" className="relative flex items-center gap-4 min-w-0" aria-label="Dashboard home">
          <img src="/images.png" alt="LICET" className="w-10 h-10 rounded-full bg-white p-[2px] ring-2 ring-licet-gold/80 shrink-0" />
          <span className="flex flex-col items-start leading-none min-w-0">
            <Wordmark size={19} />
            <span className="hidden sm:block font-nav text-[9.5px] font-semibold tracking-[2.6px] uppercase text-licet-cream/75 mt-1.5 truncate">Dept. of Computer Science &amp; Engineering</span>
          </span>
        </Link>

        {/* Command-style module search */}
        <button onClick={openSearch}
          className="relative hidden lg:flex items-center gap-2.5 mx-auto w-[340px] h-10 px-4 rounded-full bg-white/[0.07] border border-white/15 text-licet-cream/60 font-nav text-[13px] hover:bg-white/[0.11] hover:border-licet-gold/50 transition-colors">
          <Search size={15} className="text-licet-gold" />
          <span>Search modules…</span>
          <kbd className="ml-auto text-[10.5px] font-semibold text-licet-cream/60 border border-white/20 rounded-md px-1.5 py-0.5">/</kbd>
        </button>

        <div className="relative ml-auto lg:ml-0 flex items-center gap-3">
          <span className="hidden xl:flex flex-col items-end leading-tight font-nav pr-3 border-r border-white/15">
            <span className="text-[13px] font-semibold text-white tabular-nums">{time}</span>
            <span className="text-[10.5px] text-licet-cream/70">{date}</span>
          </span>
          <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-full pl-1 pr-1 md:pr-3 py-1 hover:bg-white/10 transition-colors">
            <span className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-br from-[#F8D88D] to-licet-gold shrink-0">
              <span className="w-full h-full rounded-full bg-licet-cream text-licet-indigo flex items-center justify-center font-nav text-[12px] font-bold">{initials || "?"}</span>
            </span>
            <span className="hidden md:block text-left leading-tight font-nav">
              <span className="block text-[13px] font-semibold text-white max-w-[200px] truncate">{name}</span>
              <span className="block text-[10px] font-semibold tracking-[1.5px] uppercase text-licet-gold max-w-[200px] truncate">{roleLine}</span>
            </span>
            <ChevronDown size={14} className={`hidden md:block text-licet-cream/70 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-full mt-3 w-64 z-50 rounded-xl bg-white text-foreground shadow-2xl shadow-licet-indigo/25 border border-border overflow-hidden font-nav">
                <div className="px-4 py-3.5 bg-gradient-to-br from-licet-indigo to-licet-violet text-white">
                  <p className="text-[13.5px] font-semibold truncate">{name}</p>
                  <p className="text-[11px] text-licet-cream/80 truncate">{roleLine}</p>
                </div>
                <Link href="/dashboard" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-licet-cream/60">
                  <LayoutDashboard size={15} className="text-licet-violet" /> My dashboard
                </Link>
                <Link href="/dashboard/change-password" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-licet-cream/60">
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
          <div onClick={() => setMobile(false)} className="md:hidden fixed inset-0 top-16 bg-licet-indigo/45 backdrop-blur-[2px] z-40" />
        )}

        {/* Sidebar */}
        <aside
          aria-label="Main menu"
          className={`relative flex flex-col shrink-0 overflow-clip z-50 font-nav transition-[width,transform] duration-300 ease-out
            bg-[linear-gradient(180deg,#1A0C4E_0%,#170A45_45%,#110636_100%)] border-r border-white/5
            max-md:fixed max-md:top-16 max-md:bottom-0 max-md:left-0 max-md:w-[280px] max-md:shadow-2xl
            ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
            ${expanded ? "md:w-[272px]" : "md:w-[76px]"}`}
        >
          {/* decoration, clipped in its own layer so it can never make the menu scroll sideways */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
            <span className="absolute -top-24 -left-20 w-72 h-72 rounded-full bg-[#41317E]/50 blur-3xl" />
            <img src="/images.png" alt="" className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-[0.04]" />
          </div>

          {/* Profile card */}
          <div className={`relative shrink-0 ${showText ? "px-4 pt-4 pb-3" : "px-2 pt-4 pb-2 flex justify-center"}`}>
            {showText ? (
              <div className="flex items-center gap-3 rounded-2xl p-3 bg-white/[0.06] border border-white/10 backdrop-blur-sm">
                <span className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-br from-[#F8D88D] to-licet-gold shrink-0">
                  <span className="w-full h-full rounded-full bg-licet-indigo text-licet-gold flex items-center justify-center text-[13px] font-bold">{initials || "?"}</span>
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-white truncate">{name}</p>
                  <p className="text-[11px] text-licet-cream/65 truncate">{roleLine}</p>
                </div>
              </div>
            ) : (
              <span title={`${name} · ${roleLine}`} className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-br from-[#F8D88D] to-licet-gold">
                <span className="w-full h-full rounded-full bg-licet-indigo text-licet-gold flex items-center justify-center text-[12px] font-bold">{initials || "?"}</span>
              </span>
            )}
          </div>

          {/* Search + collapse */}
          <div className={`relative flex items-center gap-2 shrink-0 ${showText ? "px-4 pb-3" : "px-2 pb-2 flex-col"}`}>
            {showText ? (
              <label className="flex-1 flex items-center gap-2 h-10 px-3.5 rounded-xl bg-black/20 border border-white/10 focus-within:border-licet-gold/70 focus-within:ring-2 focus-within:ring-licet-gold/20 transition">
                <Search size={14} className="text-licet-gold/80 shrink-0" />
                <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a module"
                  aria-label="Find a module" className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-licet-cream/40 outline-none" />
                {query
                  ? <button onClick={() => setQuery("")} aria-label="Clear search" className="text-licet-cream/50 hover:text-white"><X size={13} /></button>
                  : <kbd className="hidden md:inline text-[10px] text-licet-cream/45 border border-white/15 rounded px-1">/</kbd>}
              </label>
            ) : (
              <button onClick={openSearch} aria-label="Search modules" className="w-10 h-10 flex items-center justify-center rounded-xl text-licet-cream/70 hover:text-licet-gold hover:bg-white/[0.07]">
                <Search size={16} />
              </button>
            )}
            <button onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Collapse menu" : "Expand menu"}
              className="hidden md:flex w-10 h-10 items-center justify-center rounded-xl text-licet-gold/80 hover:text-licet-gold bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 shrink-0">
              <ChevronLeft size={16} className={`transition-transform duration-300 ${expanded ? "" : "rotate-180"}`} />
            </button>
          </div>

          <nav className="relative flex-1 overflow-y-auto overflow-x-hidden pb-4 [scrollbar-width:thin] [scrollbar-color:#41317E_transparent]"
            onScroll={() => setTip(null)}>
            {visibleGroups.length === 0 && (
              <p className="px-5 py-6 text-[12.5px] text-licet-cream/50">No module matches &ldquo;{query}&rdquo;.</p>
            )}
            {visibleGroups.map(group => {
              const hasActive = group.items.some(i => i.id === activeId)
              const open = !showText || !!query || hasActive || !closedGroups.includes(group.title)
              return (
                <div key={group.title} className="mt-1">
                  {showText ? (
                    <button onClick={() => toggleGroup(group.title)} aria-expanded={open}
                      className="group/h w-full flex items-center gap-2.5 px-5 pt-3.5 pb-2 text-left">
                      <span className="font-brand text-[11px] tracking-[2.2px] uppercase text-licet-gold whitespace-nowrap">{group.title}</span>
                      <span className="flex-1 h-px bg-gradient-to-r from-licet-gold/40 to-transparent" />
                      <ChevronDown size={13} className={`text-licet-cream/40 group-hover/h:text-licet-gold transition-transform ${open ? "" : "-rotate-90"}`} />
                    </button>
                  ) : <div className="mx-5 my-3 h-px bg-gradient-to-r from-transparent via-licet-gold/35 to-transparent" />}
                  <div className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <ul className={`overflow-hidden ${showText ? "px-3 space-y-1" : "px-2.5 space-y-1.5"}`}>
                      {group.items.map(({ icon: Icon, label, id }) => {
                        const active = activeId === id
                        return (
                          <li key={id}>
                            <Link href={hrefFor(id)} prefetch aria-current={active ? "page" : undefined} aria-label={!showText ? label : undefined}
                              onMouseEnter={e => { if (!showText) setTip({ label, top: e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 }) }}
                              onMouseLeave={() => setTip(null)}
                              className={`group relative flex items-center gap-3 rounded-xl whitespace-nowrap transition-all duration-200
                                ${showText ? "pl-2 pr-3 py-1.5" : "justify-center p-1.5"}
                                ${active
                                  ? "bg-gradient-to-r from-[#F8D88D] to-licet-gold text-licet-indigo shadow-[0_8px_20px_-10px_rgba(248,216,141,0.8)]"
                                  : "text-licet-cream/80 hover:bg-white/[0.06] hover:text-white hover:translate-x-0.5"}`}>
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors
                                ${active ? "bg-licet-indigo text-[#F8D88D] shadow-inner" : "bg-white/[0.06] text-licet-cream/75 group-hover:bg-licet-gold/15 group-hover:text-[#F8D88D]"}`}>
                                <Icon size={16} strokeWidth={active ? 2.2 : 1.9} />
                              </span>
                              {showText && <span className={`truncate text-[13.5px] ${active ? "font-bold" : "font-medium"}`}>{label}</span>}
                              {showText && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-licet-indigo" />}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )
            })}
          </nav>

          <div className={`relative border-t border-white/10 shrink-0 ${showText ? "px-4 py-3.5" : "px-2 py-3"}`}>
            {showText ? (
              <div className="flex items-center gap-3">
                <img src="/images.png" alt="" className="w-9 h-9 rounded-full bg-white ring-1 ring-licet-gold/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif italic text-[16px] text-licet-gold leading-none">Luceat Lux Vestra</p>
                  <p className="text-[9.5px] tracking-[2px] uppercase text-licet-cream/50 mt-1">Let your light shine</p>
                </div>
                <button onClick={logout} aria-label="Sign out" title="Sign out"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-licet-cream/60 hover:text-white hover:bg-red-500/25 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button onClick={logout} aria-label="Sign out" title="Sign out"
                className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-licet-cream/60 hover:text-white hover:bg-red-500/25">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </aside>

        {/* Floating label for the collapsed menu (outside the scrolling sidebar so it isn't clipped) */}
        {tip && !showText && (
          <div role="tooltip" style={{ top: tip.top }}
            className="hidden md:block fixed left-[84px] -translate-y-1/2 z-[60] pointer-events-none font-nav text-[12.5px] font-semibold text-licet-indigo bg-gradient-to-r from-[#F8D88D] to-licet-gold px-3 py-1.5 rounded-lg shadow-xl">
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[#F8D88D]" />
            {tip.label}
          </div>
        )}

        {/* Main */}
        <main id="scroll-container" className="flex-1 overflow-y-auto flex flex-col [scrollbar-width:thin] [scrollbar-color:#DCCAA0_transparent]">
          {current && activeId !== "dashboard" && (
            <div className="px-5 md:px-8 pt-5 font-nav text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-licet-indigo"><LayoutDashboard size={12} />Dashboard</Link>
              <span aria-hidden className="text-licet-gold">/</span>
              <span className="text-licet-indigo font-semibold">{current.label}</span>
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
          <footer className="shrink-0 bg-licet-parchment border-t border-border px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-nav">
            <span>© {now?.getFullYear() ?? ""} Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai</span>
            <span>Maintained by <span className="font-semibold text-licet-indigo">LICET · Department of CSE</span></span>
          </footer>
        </main>
      </div>
    </div>
  )
}
