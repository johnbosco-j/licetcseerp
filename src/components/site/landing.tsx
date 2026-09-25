"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, ShieldAlert, Mail, Lock, GraduationCap, Briefcase, HeartHandshake, Globe2, X, LogIn, LayoutDashboard, ChevronDown } from "lucide-react"
import { signIn } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { Wordmark, LicetLogo } from "@/components/licet-brand"

// Photos from the CSE department page on licet.ac.in, stored in /public/cse.
const SLIDES = [
  { src: "/cse/lab-workshop.jpg", caption: "Hands-on lab workshop" },
  { src: "/cse/department-group.jpg", caption: "Department of CSE" },
  { src: "/cse/trophy-team.jpg", caption: "Inter-college tournament winners" },
  { src: "/cse/skilling-to-career.jpg", caption: "Skilling to Career" },
  { src: "/cse/award-ceremony.jpg", caption: "Awards & recognition" },
]



const NAV = [
  { label: "About", href: "https://licet.ac.in/about/" },
  { label: "CSE Department", href: "https://licet.ac.in/computer-science-and-engineering/" },
  { label: "Placement", href: "https://licet.ac.in/placement/" },
  { label: "Alumni", href: "https://licet.ac.in/alumni/" },
  { label: "Examinations", href: "https://licet.ac.in/examination/" },
]

const PILLARS = [
  { icon: GraduationCap, title: "Academic Excellence", text: "Preparing students as per the prescribed syllabi of Anna University along with value-added courses and skill-based training." },
  { icon: Briefcase, title: "Professionalism", text: "Excelling in professionalism through interaction and integration with industries." },
  { icon: HeartHandshake, title: "Holistic Formation", text: "Focusing on the overall growth of students through sports and cultural activities." },
  { icon: Globe2, title: "International Exposure", text: "Consistent collaboration with universities of international repute to provide world-class exposure." },
]

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
  const [slide, setSlide]       = useState(0)
  const [loginOpen, setLoginOpen] = useState(openLogin)
  const [signedIn, setSignedIn] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && localStorage.getItem("licet_user")) {
        setSignedIn(true)
        if (openLogin) router.replace("/dashboard")
      }
    })
    const iv = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), 5000)
    return () => clearInterval(iv)
  }, [router, openLogin])

  useEffect(() => {
    if (!loginOpen) return
    setTimeout(() => emailRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLoginOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loginOpen])

  const SignInButton = ({ large = false }: { large?: boolean }) => signedIn ? (
    <button onClick={() => router.push("/dashboard")}
      className={`inline-flex items-center gap-2 rounded-full font-semibold bg-licet-gold text-licet-indigo hover:bg-[#F8D88D] shadow-lg shadow-black/20 transition-colors ${large ? "h-12 px-7 text-[15px]" : "h-10 px-5 text-[13.5px]"}`}>
      <LayoutDashboard className="w-4 h-4" /> Open dashboard
    </button>
  ) : (
    <button onClick={() => setLoginOpen(true)}
      className={`inline-flex items-center gap-2 rounded-full font-semibold bg-licet-gold text-licet-indigo hover:bg-[#F8D88D] shadow-lg shadow-black/20 transition-colors ${large ? "h-12 px-7 text-[15px]" : "h-10 px-5 text-[13.5px]"}`}>
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Utility strip */}
      <div className="bg-licet-indigo border-b-[3px] border-licet-gold text-[12px]">
        <div className="max-w-[1200px] mx-auto px-4 h-9 flex items-center gap-5">
          <nav className="hidden sm:flex items-center gap-5 text-licet-cream">
            <a href="https://licet.ac.in/help-desk/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D]">Help Desk</a>
            <a href="https://www.aicte.gov.in/opportunities/students/resources_students" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D]">AICTE Resources</a>
            <a href="http://moodle.licet.ac.in/" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8D88D]">Moodle</a>
          </nav>
          <span className="sm:ml-auto text-[13px] text-licet-gold">Anna University Counselling Code : 1450</span>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden bg-licet-indigo">
        {SLIDES.map(({ src }, i) => (
          <img key={src} src={src} alt="" aria-hidden
            className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-[1500ms] ${i === slide ? "opacity-100 scale-100" : "opacity-0 scale-105"}`} />
        ))}
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(20,9,62,0.96) 0%, rgba(26,12,78,0.82) 38%, rgba(26,12,78,0.35) 75%, rgba(26,12,78,0.25) 100%), linear-gradient(180deg, #1A0C4E 0%, transparent 25%, transparent 70%, rgba(26,12,78,0.9) 100%)" }} />

        {/* Nav band */}
        <div className="relative max-w-[1200px] mx-auto px-4 pt-4 flex items-center gap-6">
          <a href="https://licet.ac.in/" target="_blank" rel="noopener noreferrer" aria-label="licet.ac.in">
            <LicetLogo className="h-[62px] w-auto" />
          </a>
          <nav className="hidden lg:flex ml-auto items-center gap-7">
            {NAV.map(n => (
              <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer"
                className="text-[15px] font-semibold text-white hover:text-[#F8D88D] transition-colors">{n.label}</a>
            ))}
          </nav>
          <div className="ml-auto lg:ml-2"><SignInButton /></div>
        </div>

        <div className="relative max-w-[1200px] mx-auto px-4 py-14 lg:py-24">
          <div className="text-white" style={{ animation: "licet-fade 0.8s ease-out both" }}>
            <p className="text-[12px] font-bold tracking-[3px] uppercase text-licet-gold">Department of Computer Science &amp; Engineering</p>
            <h1 className="mt-4 !text-white" aria-label="LICET Things">
              <span className="block font-nav text-[13px] sm:text-[15px] font-semibold tracking-[0.35em] uppercase text-licet-cream/80">Loyola-ICAM presents</span>
              <Wordmark size="clamp(42px, 6.2vw, 68px)" className="mt-3" />
            </h1>
            <div className="h-[3px] w-20 bg-licet-gold mt-5" />
            <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-white/90">
              The department&rsquo;s academic portal for attendance, marks, timetables, leave, feedback and more —
              for students, faculty and the Head of Department.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <SignInButton large />
              <a href="#vision" className="inline-flex items-center gap-2 h-12 px-7 rounded-full text-[15px] font-semibold text-white border border-white/40 backdrop-blur-sm hover:bg-white/10 transition-colors">
                Explore the department <ChevronDown className="w-4 h-4" />
              </a>
            </div>
            <p className="mt-8 text-[12px] font-semibold tracking-[2px] uppercase text-white/70">{SLIDES[slide].caption}</p>
            <div className="flex gap-2 mt-3" role="tablist" aria-label="Photo slides">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)} aria-label={`Show photo ${i + 1}`} aria-selected={i === slide} role="tab"
                  className={`h-1.5 rounded-full transition-all ${i === slide ? "w-8 bg-licet-gold" : "w-3 bg-white/40 hover:bg-white/70"}`} />
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Uniqueness of LICET */}
      <section className="bg-licet-cream">
        <div className="max-w-[1200px] mx-auto px-4 py-16">
          <div className="text-center">
            <h2 className="font-serif font-semibold text-[38px] sm:text-[48px] leading-tight">Uniqueness of <span className="italic text-licet-violet">LICET</span></h2>
            <p className="text-[12px] font-semibold tracking-[3px] uppercase text-licet-indigo mt-1">A Four-Pillar Approach</p>
            <div className="h-[2px] w-16 bg-licet-indigo/60 mx-auto mt-4" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="group rounded-2xl bg-licet-indigo text-licet-cream p-7 min-h-[230px] flex flex-col shadow-lg shadow-licet-indigo/20 transition hover:-translate-y-1 hover:shadow-xl">
                <Icon className="w-8 h-8 text-licet-gold" strokeWidth={1.5} />
                <h3 className="font-serif text-[22px] font-semibold mt-5 text-licet-cream">{title}</h3>
                <p className="text-[13.5px] leading-relaxed mt-2 text-licet-cream/75">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Department content from licet.ac.in */}
      {children}

      {/* Vision & Quality Policy */}
      <section className="bg-licet-indigo text-white">
        <div className="max-w-[1200px] mx-auto px-4 py-14 grid md:grid-cols-2 gap-10">
          {[
            { h: "Vision", t: "“To form responsible engineers, who would engineer a just society”" },
            { h: "Quality Policy", t: "To form engineers who are creative, competent, committed, compassionate and socially responsible" },
          ].map(({ h, t }) => (
            <div key={h} className="border-t-2 border-licet-gold/60 pt-6">
              <h2 className="font-serif text-[36px] font-semibold !text-licet-gold">{h}</h2>
              <p className="text-[15px] font-semibold tracking-[1.5px] uppercase mt-2 text-licet-cream leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {loginOpen && !signedIn && (
        <div className="fixed inset-0 z-[90] bg-[#0d0628]/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setLoginOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={e => e.stopPropagation()}
            className="relative w-full max-w-[860px] grid md:grid-cols-[1fr_1.1fr] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10"
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
      <footer className="bg-licet-parchment mt-auto">
        <div className="max-w-[1200px] mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8 text-[14px] text-[#3c3852]">
          <div>
            <h3 className="font-serif text-[24px] font-semibold text-licet-indigo">Contact Us</h3>
            <p className="mt-2 leading-relaxed">LICET<br />Loyola Campus, Nungambakkam,<br />Chennai – 600034.</p>
          </div>
          <div>
            <h3 className="font-serif text-[24px] font-semibold text-licet-indigo">Get In Touch</h3>
            <p className="mt-2 leading-relaxed">Email: licet@licet.ac.in<br />Phone: +91 44 2817 8490</p>
          </div>
          <div>
            <h3 className="font-serif text-[24px] font-semibold text-licet-indigo">Loyola Institutions</h3>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <a className="hover:text-licet-violet underline-offset-4 hover:underline" href="https://www.loyolacollege.edu/" target="_blank" rel="noopener noreferrer">Loyola College</a>
              <a className="hover:text-licet-violet underline-offset-4 hover:underline" href="https://liba.edu/" target="_blank" rel="noopener noreferrer">LIBA</a>
              <a className="hover:text-licet-violet underline-offset-4 hover:underline" href="https://www.loyolacollegeofeducation.in/" target="_blank" rel="noopener noreferrer">LCE</a>
            </p>
          </div>
        </div>
        <div className="border-t border-[#DCD0B4]">
          <p className="max-w-[1200px] mx-auto px-4 py-3 text-[12px] text-[#6b6480]">
            © {new Date().getFullYear()} Loyola-ICAM College of Engineering and Technology (Autonomous) · LICET Things, maintained by the Department of CSE
          </p>
        </div>
      </footer>
    </div>
  )
}
