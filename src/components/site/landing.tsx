"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, ShieldAlert, GraduationCap, Briefcase, HeartHandshake, Globe2, X, LogIn, LayoutDashboard, ChevronDown } from "lucide-react"
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
      className={`inline-flex items-center gap-2 font-semibold bg-licet-gold text-licet-indigo hover:bg-[#F8D88D] transition-colors ${large ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[13.5px]"}`}>
      <LayoutDashboard className="w-4 h-4" /> Open dashboard
    </button>
  ) : (
    <button onClick={() => setLoginOpen(true)}
      className={`inline-flex items-center gap-2 font-semibold bg-licet-gold text-licet-indigo hover:bg-[#F8D88D] transition-colors ${large ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[13.5px]"}`}>
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
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #1A0C4E 3%, rgba(26,12,78,0.55) 45%, rgba(26,12,78,0.85) 100%)" }} />

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
            <p className="mt-5 max-w-xl text-[16px] font-light leading-relaxed text-white/85">
              The department&rsquo;s academic portal for attendance, marks, timetables, leave, feedback and more —
              for students, faculty and the Head of Department.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <SignInButton large />
              <a href="#vision" className="inline-flex items-center gap-2 h-12 px-6 text-[15px] font-semibold text-white border border-white/40 hover:bg-white/10 transition-colors">
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
            <h2 className="font-serif italic font-medium text-[40px] sm:text-[50px] leading-tight">Uniqueness of LICET</h2>
            <p className="text-[12px] font-semibold tracking-[3px] uppercase text-licet-indigo mt-1">A Four-Pillar Approach</p>
            <div className="h-[2px] w-16 bg-licet-indigo/60 mx-auto mt-4" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="group bg-licet-indigo text-licet-cream p-7 min-h-[230px] flex flex-col transition-colors hover:bg-[#1E1445]">
                <Icon className="w-8 h-8 text-licet-gold" strokeWidth={1.5} />
                <h3 className="font-serif text-[24px] mt-5 text-licet-cream">{title}</h3>
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
              <h2 className="font-serif italic text-[40px] font-medium !text-licet-gold">{h}</h2>
              <p className="text-[15px] font-semibold tracking-[1.5px] uppercase mt-2 text-licet-cream leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {loginOpen && !signedIn && (
        <div className="fixed inset-0 z-[90] bg-licet-indigo/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLoginOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={e => e.stopPropagation()} className="relative w-full max-w-[440px] bg-white border-t-[3px] border-licet-gold shadow-2xl shadow-black/40 p-7 sm:p-8" style={{ animation: "licet-fade 0.35s ease-out both" }}>
            <button onClick={() => setLoginOpen(false)} aria-label="Close sign in" className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
            <div className="flex items-center gap-3">
              <img src="/images.png" alt="LICET seal" className="w-12 h-12 rounded-full" />
              <div>
                <p className="eyebrow">Secure Access</p>
                <h2 id="signin-title" className="font-serif text-[30px] font-semibold leading-tight">Sign in</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-[11px] font-bold tracking-[2px] uppercase text-licet-violet">Email</label>
                <input ref={emailRef} id="email" type="email" autoComplete="username" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@licet.ac.in"
                  className="w-full h-11 px-3.5 text-[15px] border border-input bg-licet-paper focus:bg-white focus:border-licet-violet focus:ring-2 focus:ring-licet-gold/40 outline-none transition" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[11px] font-bold tracking-[2px] uppercase text-licet-violet">Password</label>
                <div className="relative">
                  <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                    className="w-full h-11 px-3.5 pr-11 text-[15px] border border-input bg-licet-paper focus:bg-white focus:border-licet-violet focus:ring-2 focus:ring-licet-gold/40 outline-none transition" />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-licet-indigo">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 px-3 py-2.5 text-[13px] bg-red-50 border border-red-200 text-red-700">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-2 bg-licet-indigo text-white text-[14px] font-semibold tracking-wide hover:bg-licet-violet disabled:opacity-60 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <p className="mt-5 text-[12px] text-muted-foreground leading-relaxed">
              Use your college email. Access is based on your role — HOD, faculty or student.
              Forgot your password? Contact the CSE department office.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-licet-parchment mt-auto">
        <div className="max-w-[1200px] mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8 text-[14px] text-[#3c3852]">
          <div>
            <h3 className="font-serif text-[28px] text-licet-indigo">Contact Us</h3>
            <p className="mt-2 leading-relaxed">LICET<br />Loyola Campus, Nungambakkam,<br />Chennai – 600034.</p>
          </div>
          <div>
            <h3 className="font-serif text-[28px] text-licet-indigo">Get In Touch</h3>
            <p className="mt-2 leading-relaxed">Email: licet@licet.ac.in<br />Phone: +91 44 2817 8490</p>
          </div>
          <div>
            <h3 className="font-serif text-[28px] text-licet-indigo">Loyola Institutions</h3>
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
