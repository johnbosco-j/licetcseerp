"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, Shield } from "lucide-react"
import { authenticateAny } from "@/lib/auth"
import { Playfair_Display, Source_Sans_3 } from "next/font/google"

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] })
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["300", "400", "600"] })

const QUOTES = [
  "Forming Leaders with Social Responsibility",
  "Inspired by Jesuit Pedagogy of Excellence",
  "A Centre of Global Learning",
  "Empowering Minds for Tomorrow's World",
  "Where Engineering Meets Human Values",
]

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({ email: "", password: "" })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [fadeQuote, setFadeQuote] = useState(true)

  useEffect(() => {
    setMounted(true)
    const iv = setInterval(() => {
      setFadeQuote(false)
      setTimeout(() => { setQuoteIndex(p => (p + 1) % QUOTES.length); setFadeQuote(true) }, 600)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    await new Promise(r => setTimeout(r, 600))
    const result = await authenticateAny(formData.email.trim(), formData.password.trim())
    if (result) {
      const safeResult = { ...result, data: { ...result.data, password: undefined } }
      localStorage.setItem("licet_user", JSON.stringify(safeResult))
      localStorage.removeItem("excelsior_user")
      router.push("/dashboard")
    } else {
      setError("Invalid credentials. Please try again.")
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <main className={`min-h-screen flex ${sourceSans.className}`} style={{ background: '#0a1628' }}>

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col">
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(145deg, #0a1628 0%, #1a1035 40%, #2d0a1a 75%, #1a0812 100%)'
        }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
        <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #c9a84c 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #8b1a2e 0%, transparent 65%)' }} />
        <div className="absolute top-0 right-0 w-[3px] h-full opacity-30"
          style={{ background: 'linear-gradient(180deg, transparent 0%, #c9a84c 30%, #c9a84c 70%, transparent 100%)' }} />

        <div className="relative z-10 flex flex-col h-full p-14">
          {/* Logo */}
          <div className="flex items-center gap-5">
            <div className="flex-shrink-0 rounded-xl bg-white p-2.5 shadow-lg" style={{ width: '64px', height: '64px' }}>
              <img src="/licet-logo.png" alt="LICET Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.25em] uppercase mb-0.5" style={{ color: '#c9a84c' }}>
                Loyola&ndash;ICAM
              </p>
              <p className="text-white font-semibold text-sm leading-tight tracking-wide">
                College of Engineering<br />&amp; Technology
              </p>
              <p className="text-[9px] tracking-widest uppercase mt-0.5" style={{ color: '#c9a84c99' }}>
                Autonomous Institution
              </p>
            </div>
          </div>

          {/* Centre */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="flex items-center gap-4 mb-10">
              <div className="h-[1px] w-12" style={{ background: '#c9a84c' }} />
              <span className="text-[9px] tracking-[0.3em] uppercase font-semibold" style={{ color: '#c9a84c' }}>
                Department of CSE
              </span>
            </div>
            <h1 className={`text-6xl font-bold leading-[1.05] text-white mb-4 ${playfair.className}`}>
              LICET<br />
              <span style={{
                background: 'linear-gradient(135deg, #c9a84c 0%, #f0d080 50%, #c9a84c 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>CSE&ndash;ERP</span>
            </h1>
            <p className="text-base font-light leading-relaxed mb-12" style={{ color: '#94a3b8' }}>
              The integrated management platform for LICET's Department of Computer Science &amp; Engineering.
            </p>
            <div className="border-l-2 pl-6 py-1" style={{ borderColor: '#c9a84c55' }}>
              <p className={`text-lg italic font-medium transition-opacity duration-500 ${playfair.className}`}
                style={{ color: '#c9a84c', opacity: fadeQuote ? 1 : 0 }}>
                "{QUOTES[quoteIndex]}"
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t" style={{ borderColor: '#ffffff0d' }}>
            {[{ value: '8', label: 'Sections' }, { value: '500+', label: 'Students' }, { value: '17', label: 'Faculty' }].map(({ value, label }) => (
              <div key={label}>
                <p className={`text-3xl font-bold text-white ${playfair.className}`}>{value}</p>
                <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: '#64748b' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative" style={{ background: '#f8f5f0' }}>
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 3h1v1H1V3zm2-2h1v1H3V1z' fill='%23000000' fill-rule='evenodd'/%3E%3C/svg%3E")`
        }} />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <div className="flex-shrink-0 rounded-lg bg-white p-1.5 shadow-sm border" style={{ width: '44px', height: '44px', borderColor: '#e2e8f0' }}>
              <img src="/licet-logo.png" alt="LICET" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: '#0a1628' }}>LICET CSE&ndash;ERP</p>
              <p className="text-xs" style={{ color: '#64748b' }}>Department of Computer Science &amp; Engineering</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-[2px]" style={{ background: '#c9a84c' }} />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#c9a84c' }}>Secure Access</span>
            </div>
            <h2 className={`text-3xl font-bold leading-tight ${playfair.className}`} style={{ color: '#0a1628' }}>Welcome back</h2>
            <p className="text-sm mt-1.5" style={{ color: '#64748b' }}>Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#475569' }}>Email Address</label>
              <input type="email" value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@licet.ac.in" required
                className="w-full h-12 px-4 text-sm rounded-lg border-2 transition-all outline-none"
                style={{ background: '#fff', borderColor: '#e2e8f0', color: '#0a1628' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#c9a84c')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#475569' }}>Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password" required
                  className="w-full h-12 px-4 pr-11 text-sm rounded-lg border-2 transition-all outline-none"
                  style={{ background: '#fff', borderColor: '#e2e8f0', color: '#0a1628' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#c9a84c')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm"
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                <Shield className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-lg font-semibold text-sm tracking-wide flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1e2d4a 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(10,22,40,0.35)' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-[1px]" style={{ background: '#e2e8f0' }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c9a84c' }} />
            <div className="flex-1 h-[1px]" style={{ background: '#e2e8f0' }} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[{ role: 'HOD', color: '#7c3aed', bg: '#f5f3ff' }, { role: 'Faculty', color: '#0369a1', bg: '#f0f9ff' }, { role: 'Student', color: '#0f766e', bg: '#f0fdfa' }].map(({ role, color, bg }) => (
              <div key={role} className="text-center py-2.5 rounded-lg text-xs font-semibold tracking-wide" style={{ background: bg, color }}>{role}</div>
            ))}
          </div>
          <p className="text-center text-xs mt-3" style={{ color: '#94a3b8' }}>Access level is determined by your registered role</p>

          <p className="text-center text-[11px] mt-10" style={{ color: '#94a3b8' }}>
            &copy; 2026 LICET &mdash; Department of Computer Science &amp; Engineering<br />
            Loyola&ndash;ICAM College of Engineering and Technology, Chennai
          </p>
        </div>
      </div>
    </main>
  )
}
