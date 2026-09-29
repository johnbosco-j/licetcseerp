"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { Lock, Eye, EyeOff, CheckCircle2, Loader2, ShieldCheck, ArrowRight, KeyRound, Sparkles } from "lucide-react"
import { defaultStudentPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords"
import { Wordmark } from "@/components/licet-brand"

const RULES = [
  { key: "length",  label: `${MIN_PASSWORD_LENGTH}+ characters`, test: (p: string) => p.length >= MIN_PASSWORD_LENGTH },
  { key: "upper",   label: "Uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower",   label: "Lowercase letter",  test: (p: string) => /[a-z]/.test(p) },
  { key: "number",  label: "Number",            test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "Symbol (!@#…)",     test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]
const STRENGTH = [
  { label: "",            text: "",               bar: "" },
  { label: "Very weak",   text: "text-red-700",   bar: "bg-red-600" },
  { label: "Weak",        text: "text-red-700",   bar: "bg-orange-600" },
  { label: "Fair",        text: "text-amber-700", bar: "bg-amber-600" },
  { label: "Strong",      text: "text-green-700", bar: "bg-green-600" },
  { label: "Very strong", text: "text-green-700", bar: "bg-green-700" },
]

// Defined at module level: a component created inside the page would be
// re-created on every keystroke and the field would lose focus.
function PwdInput({ id, label, value, onChange, show, onToggle, placeholder, autoComplete, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; placeholder: string; autoComplete: string; autoFocus?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-licet-indigo">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-licet-violet/70" />
        <input id={id} type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus}
          className="w-full h-11 pl-10 pr-11 bg-white border border-input rounded-lg text-[14px] focus:border-licet-violet focus:outline-none transition-colors" />
        <button type="button" onClick={onToggle} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-licet-indigo hover:bg-muted">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [firstLogin, setFirstLogin] = useState(false)
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd]         = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [show, setShow]             = useState({ c: false, n: false, co: false })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState("")
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("licet_user")
    if (!stored) { router.push("/login"); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    // The live profile decides whether this is the forced first-login change.
    supabase.from("profiles").select("must_change_password").eq("id", au.data.id).single()
      .then(({ data }) => setFirstLogin(!!data?.must_change_password))
  }, [router])

  const passed = RULES.filter(r => r.test(newPwd))
  const score = passed.length
  const strength = STRENGTH[score]
  const firstName = (authUser?.data.full_name ?? "").replace(/^(Dr|Mr|Ms|Mrs|Rev|Fr)\.?\s+/i, "").split(/\s+/)[0]
  const isStudent = authUser?.type === "student"

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!authUser) return
    if (!currentPwd)                               { setError("Enter your current password."); return }
    if (newPwd.length < MIN_PASSWORD_LENGTH)       { setError(`The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    if (score < 3)                                 { setError("Make the new password stronger: mix letters with numbers or symbols."); return }
    if (newPwd !== confirmPwd)                     { setError("The two new passwords do not match."); return }
    if (newPwd === currentPwd)                     { setError("The new password must be different from the current one."); return }
    if (newPwd.toLowerCase() === defaultStudentPassword(authUser.data.email).toLowerCase()) { setError("Choose a password other than the default one."); return }

    setSaving(true)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authUser.data.email, password: currentPwd })
    if (signInErr) { setError("Your current password is incorrect."); setSaving(false); return }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd })
    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    await supabase.rpc("password_changed")
    try {
      const stored = JSON.parse(localStorage.getItem("licet_user") ?? "null")
      if (stored?.data) { stored.data.must_change_password = false; localStorage.setItem("licet_user", JSON.stringify(stored)) }
    } catch { /* ignore */ }
    window.dispatchEvent(new Event("licet:password-changed"))

    setSaving(false)
    setSuccess(true)
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd("")
  }

  return (
    <div className="px-5 md:px-8 py-6 flex justify-center">
      <div className="w-full max-w-4xl grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
        {/* Intro panel */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-licet-indigo via-[#24155f] to-licet-violet text-white p-7">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 rounded-full border-[36px] border-licet-gold/10" aria-hidden />
          <div className="relative">
            {firstLogin ? (
              <>
                <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Welcome</p>
                <h1 className="!text-white text-[30px] font-semibold leading-tight mt-2">Hello{firstName ? `, ${firstName}` : ""}!</h1>
                <p className="mt-2 text-[14px] text-licet-cream/90 leading-relaxed">
                  Welcome to <Wordmark size={15} className="align-middle" />, the academic portal of the Department of Computer Science &amp; Engineering.
                </p>
                <ol className="mt-6 space-y-3 text-[13.5px]">
                  {[
                    ["Choose your own password", "The password you were given is temporary. Set one only you know."],
                    [isStudent ? "Your records, in one place" : "Your classes, in one place", isStudent ? "Attendance, marks, timetable, leave and notices are on your dashboard." : "Attendance registers, marks entry, timetables and leave, from your dashboard."],
                    ["Need help?", isStudent ? "Your class advisor or the CSE office can reset your password." : "The HOD office can reset your password or change your access."],
                  ].map(([t, d], i) => (
                    <li key={t} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-licet-gold text-licet-indigo text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span><span className="block font-semibold text-white">{t}</span><span className="text-licet-cream/80">{d}</span></span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Security</p>
                <h1 className="!text-white text-[30px] font-semibold leading-tight mt-2">Change password</h1>
                <p className="mt-2 text-[14px] text-licet-cream/90 leading-relaxed">Confirm your current password, then choose a new one. You stay signed in on this device.</p>
                <ul className="mt-6 space-y-2 text-[13px] text-licet-cream/85">
                  <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-licet-gold shrink-0 mt-0.5" />Use a password you don&rsquo;t use on other websites.</li>
                  <li className="flex gap-2"><KeyRound className="w-4 h-4 text-licet-gold shrink-0 mt-0.5" />A short phrase with a number is easy to remember and hard to guess.</li>
                </ul>
              </>
            )}
          </div>
        </section>

        {/* Form */}
        {success ? (
          <section className="bg-card border border-green-200 rounded-2xl p-8 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-green-700 mx-auto" />
            <h2 className="text-[26px] font-semibold">{firstLogin ? "You're all set" : "Password updated"}</h2>
            <p className="text-[13.5px] text-muted-foreground">
              {firstLogin ? "Your new password is saved. Use it the next time you sign in." : "Your password has been changed successfully."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-licet-indigo text-white text-[14px] font-semibold hover:bg-licet-violet">
                {firstLogin ? <Sparkles className="w-4 h-4" /> : null} Go to my dashboard <ArrowRight className="w-4 h-4" />
              </button>
              {!firstLogin && <Link href="/dashboard/profile" className="inline-flex items-center h-11 px-5 rounded-lg border border-border text-[14px] font-semibold text-licet-indigo hover:bg-licet-cream/60">My profile</Link>}
            </div>
          </section>
        ) : (
          <form onSubmit={handleUpdate} className="bg-card border border-border rounded-2xl p-6 sm:p-7 space-y-5" noValidate>
            <div>
              <span className="eyebrow">{firstLogin ? "One-time setup" : "Update password"}</span>
              <h2 className="text-[24px] font-semibold mt-1.5">{firstLogin ? "Set your new password" : "Choose a new password"}</h2>
            </div>

            <PwdInput id="current-password" label={firstLogin ? "Temporary password" : "Current password"} value={currentPwd} onChange={setCurrentPwd}
              show={show.c} onToggle={() => setShow(s => ({ ...s, c: !s.c }))} autoComplete="current-password" autoFocus
              placeholder={firstLogin ? "The password you just signed in with" : "Enter your current password"} />

            <div className="border-t border-border pt-5 space-y-4">
              <PwdInput id="new-password" label="New password" value={newPwd} onChange={setNewPwd}
                show={show.n} onToggle={() => setShow(s => ({ ...s, n: !s.n }))} autoComplete="new-password" placeholder="At least 8 characters" />

              <div className="space-y-2" aria-live="polite">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? strength.bar : "bg-border"}`} />)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {RULES.map(r => (
                    <span key={r.key} className={`inline-flex items-center gap-1.5 text-[12px] ${r.test(newPwd) ? "text-green-700" : "text-muted-foreground"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.test(newPwd) ? "bg-green-600" : "bg-border"}`} />{r.label}
                    </span>
                  ))}
                  {newPwd && <span className={`ml-auto text-[12px] font-semibold ${strength.text}`}>{strength.label}</span>}
                </div>
              </div>

              <PwdInput id="confirm-password" label="Confirm new password" value={confirmPwd} onChange={setConfirmPwd}
                show={show.co} onToggle={() => setShow(s => ({ ...s, co: !s.co }))} autoComplete="new-password" placeholder="Type the new password again" />
              {confirmPwd.length > 0 && (
                <p className={`text-[12.5px] ${confirmPwd === newPwd ? "text-green-700" : "text-red-700"}`}>
                  {confirmPwd === newPwd ? "✓ Passwords match" : "✗ Passwords do not match"}
                </p>
              )}
            </div>

            {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-[13px] text-red-700">{error}</div>}

            <button type="submit" disabled={saving || !currentPwd || !newPwd || !confirmPwd}
              className="w-full flex items-center justify-center gap-2 h-11 bg-licet-indigo text-white text-[14px] font-semibold rounded-lg hover:bg-licet-violet shadow-sm disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {saving ? "Saving…" : firstLogin ? "Save and continue" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
