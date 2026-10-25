"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, ShieldAlert, Mail, Lock, X, LogIn, LayoutDashboard, ChevronDown, Menu } from "lucide-react"
import { signIn } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { Wordmark, LicetLogo } from "@/components/licet-brand"

// The page frame copies the CSE department page on licet.ac.in: navy utility strip, header
// band fading from navy, banner photo with the department name, and the college footer.
// Every menu link goes to the same page on licet.ac.in.
const L = "https://licet.ac.in"

const TOP_LINKS = [
  { label: "Help Desk", href: `${L}/help-desk/` },
  { label: "Library Resources (Internal)", href: "http://192.168.5.2:8080/AutoLib/opac.jsp" },
  { label: "AICTE Resources", href: "https://www.aicte.gov.in/opportunities/students/resources_students" },
]

type MenuItem = { label: string; href?: string; items?: { label: string; href: string }[] }
const MENU: MenuItem[] = [
  { label: "About", items: [
    { label: "Overview", href: `${L}/about/` },
    { label: "Mission & Vision", href: `${L}/about/mission-vision/` },
    { label: "Core Values & Partnership", href: `${L}/about/core-values-partnership/` },
    { label: "Official’s Desk", href: `${L}/officials-message/` },
    { label: "LICET Officials", href: `${L}/about/licet-officials/` },
    { label: "Management & Administration", href: `${L}/about/management-administration-2/` },
    { label: "IQAC", href: `${L}/iqac/` },
    { label: "Milestones", href: `${L}/about/milestones/` },
  ] },
  { label: "Academics", items: [
    { label: "Artificial Intelligence and Data Science", href: `${L}/artificial-intelligence-and-data-science/` },
    { label: "Computer Science and Engineering", href: `${L}/computer-science-and-engineering/` },
    { label: "Electrical and Electronics Engineering", href: `${L}/electrical-and-electronics-engineering/` },
    { label: "Electronics and Communication Engineering", href: `${L}/electronics-and-communication-engineering/` },
    { label: "Information Technology", href: `${L}/information-technology/` },
    { label: "Mechanical Engineering", href: `${L}/mechanical-engineering/` },
    { label: "Science & Humanities", href: `${L}/science-humanities/` },
    { label: "Mandatory Disclosures", href: `${L}/mandatory-disclosure/` },
    { label: "Academic Calendar", href: `${L}/academic-calendar-2/` },
  ] },
  { label: "Placement", href: `${L}/placement/` },
  { label: "Campus Life", items: [
    { label: "IIC", href: "https://licetiic.vercel.app/" },
    { label: "Fab Lab", href: `${L}/labs/fablab/` },
    { label: "Labs", href: `${L}/labs/` },
    { label: "Hostel", href: `${L}/hostel/` },
    { label: "Transport", href: `${L}/bus-1/` },
    { label: "Medical Facility", href: `${L}/medical-facility/` },
    { label: "Central Library", href: `${L}/central-library/` },
    { label: "Sports", href: `${L}/sports/` },
    { label: "Service Learning", href: `${L}/service-learning/` },
    { label: "Cafe/Canteen", href: `${L}/licet-cafe-canteen/` },
    { label: "Green Campus", href: `${L}/service-learning/green-campus/` },
    { label: "Centre Of Peace", href: `${L}/centre-of-peace/` },
    { label: "DAIKIN COE", href: `${L}/daikin-coe/` },
    { label: "Entrepreneurship Cell", href: `${L}/service-learning/entrepreneurship/` },
    { label: "Licetronicles", href: `${L}/licetronicles/` },
  ] },
  { label: "Alumni", href: `${L}/alumni/` },
  { label: "Examinations", href: `${L}/examination/` },
]

const FOOTER_COLUMNS = [
  { title: "Insights", links: [
    ["Holistic Formation", `${L}/holistic-education/`], ["Cultural Activities", `${L}/cultural-activities/`],
    ["Mindfulness & Yoga", `${L}/mindfulness-yoga/`], ["Service Learning", `${L}/service-learning/`],
    ["Outreach Programme", `${L}/outreach-programme/`], ["International Programme", `${L}/international-programme/`],
    ["Nodal Centers", `${L}/nodal-centers/`], ["Campus Ministry", `${L}/campus-ministry/`],
  ] },
  { title: "Committees", links: [
    ["Antiragging", `${L}/anti-ragging/`], ["Grievance Redressal", `${L}/grievance-redressal-committee/`],
    ["Women Welfare Committee", `${L}/service-learning/women-welfare-committee/`], ["Rotaract", `${L}/service-learning/rotaract/`],
    ["NCC", `${L}/service-learning/ncc/`], ["YRC", `${L}/service-learning/yrc/`],
  ] },
  { title: "Useful Links", links: [
    ["Mandatory Disclosure", `${L}/mandatory-disclosure/`], ["AICTE Scholarship/Fellowship Schemes", "https://www.aicte.gov.in/schemes/students-development-schemes"],
    ["LICET Strategic Plan", `${L}/licet-strategic-plan/`], ["NIRF", `${L}/nirf/`], ["IQAC", `${L}/iqac/`], ["FAQ", `${L}/faq/`],
    ["ARIIA", `${L}/ariia/`], ["Rules And Regulations", `${L}/rules-and-regulations/`],
  ] },
]
const OFFICIALS = [["Director", "Rev. Dr. Justine SJ"], ["Principal", "Dr. A. Baskar"], ["Webmaster", "Convener/Licet Website Committee"], ["Maintenance", "LICET Website Committee"]]

const SOCIAL = [
  { label: "Instagram", href: "https://www.instagram.com/loyolaicam_official/", path: "M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z" },
  { label: "LinkedIn", href: "https://www.linkedin.com/school/loyola-icam-college-of-engineering-and-technology/", path: "M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77Z" },
  { label: "YouTube", href: "https://www.youtube.com/channel/UCR13QxRq4JDFMsy4c-bKuww", path: "M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73Z" },
]

const ext = { target: "_blank", rel: "noopener noreferrer" } as const

/**
 * Public homepage: department content for everyone, with sign-in in a dialog.
 * `openLogin` opens the dialog straight away (the /login route).
 */
export function Landing({ openLogin = false, children }: { openLogin?: boolean; children?: ReactNode }) {
  const router = useRouter()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [loginOpen, setLoginOpen] = useState(openLogin)
  const [signedIn, setSignedIn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && localStorage.getItem("licet_user")) {
        setSignedIn(true)
        if (openLogin) router.replace("/dashboard")
      }
    })
  }, [router, openLogin])

  useEffect(() => {
    if (!loginOpen) return
    setTimeout(() => emailRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLoginOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loginOpen])

  const signInButton = signedIn ? (
    <button onClick={() => router.push("/dashboard")}
      className="lx-menu inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold bg-licet-cream text-licet-indigo hover:bg-white transition-colors">
      <LayoutDashboard className="w-4 h-4" /> Dashboard
    </button>
  ) : (
    <button onClick={() => setLoginOpen(true)}
      className="lx-menu inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold bg-licet-cream text-licet-indigo hover:bg-white transition-colors">
      <LogIn className="w-4 h-4" /> Sign in
    </button>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    const { authUser, error: err } = await signIn(email.trim(), password)
    if (authUser) {
      localStorage.setItem("licet_user", JSON.stringify(authUser))
      localStorage.removeItem("excelsior_user")
      router.replace("/dashboard")
    } else {
      setError(err ?? "Invalid email or password")
      setLoading(false)
    }
  }

  return (
    <div className="licet-site min-h-screen flex flex-col bg-white">
      {/* Utility strip */}
      <div className="bg-licet-indigo text-white lx-menu text-[12px]">
        <div className="max-w-[1140px] mx-auto px-4 h-[54px] flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6">
            {TOP_LINKS.map(l => <a key={l.label} href={l.href} {...ext} className="hover:text-licet-cream">{l.label}</a>)}
          </nav>
          <a href="https://admission.licet.ac.in/login/index.php" {...ext} className="hidden lg:block ml-auto text-licet-cream hover:text-white">Anna University Counselling Code : 1450</a>
          <div className="ml-auto lg:ml-4">{signInButton}</div>
        </div>
      </div>

      {/* Header band */}
      <header className="relative z-30" style={{ background: "linear-gradient(#1A0C4E 3%, rgba(0,0,0,0.14) 100%)" }}>
        <div className="max-w-[1140px] mx-auto px-4 h-[112px] flex items-center gap-6">
          <a href={`${L}/`} {...ext} aria-label="licet.ac.in" className="shrink-0">
            <LicetLogo className="h-[53px] w-auto" />
          </a>
          <nav className="hidden lg:flex ml-auto items-center gap-9 lx-menu">
            {MENU.map(m => m.items ? (
              <div key={m.label} className="group relative">
                <button className="flex items-center gap-1 text-[13px] font-semibold text-white py-3 group-hover:text-licet-cream" aria-haspopup="true">
                  {m.label} <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition absolute left-0 top-full min-w-[260px] bg-white shadow-xl border-t-2 border-licet-indigo py-2">
                  {m.items.map(i => (
                    <a key={i.label} href={i.href} {...ext} className={`block px-5 py-2 text-[13px] hover:bg-licet-cream/60 ${i.label === "Computer Science and Engineering" ? "text-licet-gold font-semibold" : "text-licet-indigo"}`}>{i.label}</a>
                  ))}
                </div>
              </div>
            ) : (
              <a key={m.label} href={m.href} {...ext} className="text-[13px] font-semibold text-white hover:text-licet-cream">{m.label}</a>
            ))}
          </nav>
          <button onClick={() => setMenuOpen(o => !o)} className="lg:hidden ml-auto w-10 h-10 flex items-center justify-center text-white" aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="lg:hidden absolute inset-x-0 top-full bg-licet-indigo text-white lx-menu max-h-[70vh] overflow-y-auto shadow-xl">
            {MENU.map(m => m.items ? (
              <details key={m.label} className="border-b border-white/10">
                <summary className="px-5 py-3 text-[14px] font-semibold list-none flex justify-between items-center">{m.label}<ChevronDown className="w-4 h-4" /></summary>
                {m.items.map(i => <a key={i.label} href={i.href} {...ext} className="block px-8 py-2 text-[13px] text-licet-cream">{i.label}</a>)}
              </details>
            ) : (
              <a key={m.label} href={m.href} {...ext} className="block px-5 py-3 text-[14px] font-semibold border-b border-white/10">{m.label}</a>
            ))}
            {TOP_LINKS.map(l => <a key={l.label} href={l.href} {...ext} className="block px-5 py-2.5 text-[12.5px] text-licet-cream/80">{l.label}</a>)}
          </nav>
        )}
      </header>

      {/* Banner */}
      <section className="relative h-[260px] sm:h-[360px] lg:h-[450px] bg-licet-indigo bg-cover bg-center" style={{ backgroundImage: "url(/cse/hero-cse.jpg)" }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(26,12,78,0.15) 0%, rgba(26,12,78,0.05) 45%, rgba(26,12,78,0.55) 100%)" }} />
        <div className="relative h-full max-w-[1140px] mx-auto px-4 flex items-end pb-6 sm:pb-10">
          <h1 className="!text-white text-[34px] sm:text-[44px] lg:text-[50px] leading-tight capitalize">Computer Science And Engineering</h1>
        </div>
      </section>

      {/* Department pages from licet.ac.in */}
      {children}

      {loginOpen && !signedIn && (
        <div className="fixed inset-0 z-[90] bg-[#0d0628]/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setLoginOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={e => e.stopPropagation()}
            className="relative w-full max-w-[860px] max-h-[calc(100dvh-2rem)] overflow-y-auto grid md:grid-cols-[1fr_1.1fr] rounded-3xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10 font-sans"
            style={{ animation: "licet-fade 0.35s ease-out both" }}>

            {/* Brand panel */}
            <div className="relative hidden md:flex flex-col justify-between p-9 text-white overflow-hidden bg-gradient-to-br from-licet-indigo via-[#24155f] to-licet-violet">
              <img src="/cse/department-group.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-[0.12] mix-blend-luminosity" />
              <div className="absolute -right-24 -bottom-24 w-72 h-72 rounded-full border-[40px] border-licet-gold/10" aria-hidden />
              <div className="relative">
                <img src="/images.png" alt="LICET seal" className="w-14 h-14 rounded-full bg-white p-[3px] ring-2 ring-licet-gold" />
                <Wordmark size={30} className="mt-6" />
                <p className="mt-3 text-[13.5px] leading-relaxed text-licet-cream/85 max-w-[30ch]">
                  The academic portal of the Department of Computer Science &amp; Engineering.
                </p>
              </div>
              <ul className="relative space-y-2.5 text-[13px] text-licet-cream/90">
                {[
                  ["Students", "attendance, marks, leave and placements"],
                  ["Faculty", "registers, assessments and class advising"],
                  ["Head of Department", "the whole department at a glance"],
                ].map(([who, what]) => (
                  <li key={who} className="flex gap-2.5">
                    <span className="mt-[7px] w-1.5 h-1.5 rotate-45 bg-licet-gold shrink-0" />
                    <span><span className="font-semibold text-white">{who}</span> — {what}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Form */}
            <div className="relative p-7 sm:p-10">
              <button onClick={() => setLoginOpen(false)} aria-label="Close sign in" className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-licet-indigo"><X className="w-4 h-4" /></button>
              <div className="flex md:hidden items-center gap-3 mb-6">
                <img src="/images.png" alt="LICET seal" className="w-11 h-11 rounded-full ring-2 ring-licet-gold" />
                <Wordmark size={22} tone="dark" />
              </div>
              <p className="eyebrow">Secure access</p>
              <h2 id="signin-title" className="text-[34px] font-semibold leading-tight mt-2">Welcome back</h2>
              <p className="text-[13.5px] text-muted-foreground mt-1">Sign in with your college email to continue.</p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-[12.5px] font-semibold text-licet-indigo">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-licet-violet/70" />
                    <input ref={emailRef} id="email" type="email" autoComplete="username" required value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="you@licet.ac.in"
                      className="w-full h-12 pl-10 pr-3.5 text-[15px] rounded-xl border border-input bg-licet-paper focus:bg-white focus:border-licet-violet focus:ring-4 focus:ring-licet-gold/30 outline-none transition" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-[12.5px] font-semibold text-licet-indigo">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-licet-violet/70" />
                    <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                      className="w-full h-12 pl-10 pr-12 text-[15px] rounded-xl border border-input bg-licet-paper focus:bg-white focus:border-licet-violet focus:ring-4 focus:ring-licet-gold/30 outline-none transition" />
                    <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-licet-indigo hover:bg-muted">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div role="alert" className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-[13px] bg-red-50 border border-red-200 text-red-700">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />{error}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-licet-indigo text-white text-[14.5px] font-semibold hover:bg-licet-violet shadow-lg shadow-licet-indigo/25 disabled:opacity-60 transition-colors">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <p className="mt-6 pt-5 border-t border-border text-[12.5px] text-muted-foreground leading-relaxed">
                Access follows your role: HOD, faculty or student. Forgot your password? Your class advisor or the CSE department office can reset it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto bg-white">
        <div className="max-w-[1140px] mx-auto px-4 pt-14 pb-10 border-t border-[#e5e0d3] grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.25fr] gap-x-8 gap-y-10">
          {FOOTER_COLUMNS.map(c => (
            <div key={c.title}>
              <h3 className="text-[30px] sm:text-[34px] leading-none">{c.title}</h3>
              <ul className="mt-7 space-y-3.5 lx-menu text-[13px] pl-2">
                {c.links.map(([label, href]) => <li key={label}><a href={href} {...ext} className="text-black hover:text-licet-violet">{label}</a></li>)}
              </ul>
            </div>
          ))}
          <div className="space-y-5">
            {OFFICIALS.map(([role, who]) => (
              <div key={role}>
                <h5 className="lx-serif !text-licet-gold text-[20px]">{role}</h5>
                <p className="text-[13.5px] text-[#555] mt-1.5">{who}</p>
              </div>
            ))}
          </div>
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4">
            <span className="lx-serif text-[15px]">Follow Us</span>
            {SOCIAL.map(s => (
              <a key={s.label} href={s.href} {...ext} aria-label={s.label} className="text-black hover:text-licet-violet">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden><path d={s.path} /></svg>
              </a>
            ))}
          </div>
        </div>
        <div className="bg-licet-parchment">
          <div className="max-w-[1140px] mx-auto px-4 py-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 lx-menu text-[12px] text-licet-indigo">
            <span>Copyright © {new Date().getFullYear()}, LICET.</span>
            <img src="/images.png" alt="LICET seal" className="w-14 h-14 rounded-full" />
            <span className="text-right">Maintained by <a href={`${L}/computer-science-and-engineering/`} {...ext} className="hover:underline">Department of CSE</a></span>
          </div>
        </div>
      </footer>
    </div>
  )
}
