"use client"

// Two-step sign-in (authenticator app, TOTP) via Supabase Auth MFA.
// Once the HOD (or any tier-1 member) has set it up, the database only grants
// HOD powers to sessions confirmed with a code (migration 36, is_hod()).

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck, ShieldAlert, Smartphone, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/toaster"
import { signOut } from "@/lib/auth"

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string }

const codeInput = "w-40 h-11 px-3 rounded-md border border-input text-center text-[20px] tracking-[0.35em] font-mono focus:outline-none focus:border-licet-violet"

/** Has this user set up an authenticator? */
export async function hasVerifiedFactor(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.totp ?? []).some(f => f.status === 'verified')
}

/** Profile card: set up or remove the authenticator. */
export function TwoStepSettings({ recommended }: { recommended?: boolean }) {
  const [factors, setFactors] = useState<Factor[] | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const [version, setVersion] = useState(0)
  const load = () => setVersion(v => v + 1)
  useEffect(() => {
    let on = true
    supabase.auth.mfa.listFactors().then(({ data }) => { if (on) setFactors(((data?.all ?? []) as Factor[]).filter(f => f.status === 'verified')) })
    return () => { on = false }
  }, [version])

  const start = async () => {
    setBusy(true)
    // drop half-finished set-ups first (an unverified factor blocks a new one with the same name)
    const { data: all } = await supabase.auth.mfa.listFactors()
    for (const f of ((all?.all ?? []) as Factor[]).filter(f => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toLocaleDateString('en-IN')}` })
    setBusy(false)
    if (error || !data) { toast.error(error?.message ?? 'Could not start the set-up'); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  const confirm = async () => {
    if (!enroll) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
    setBusy(false)
    if (error) { toast.error('That code did not match. Check the time on your phone and try the newest code.'); return }
    toast.success('Two-step sign-in is on. You will be asked for a code each time you sign in.')
    setEnroll(null); setCode(''); load()
  }
  const remove = async (id: string) => {
    if (!confirm_('Turn off two-step sign-in? Your HOD powers will then need only your password.')) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy(false)
    if (error) { toast.error(error.message.includes('AAL2') ? 'Sign in again with your code first, then turn it off.' : error.message); return }
    toast.success('Two-step sign-in turned off'); load()
  }

  const on = !!factors?.length
  return (
    <section className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        {on ? <ShieldCheck className="w-5 h-5 text-green-700 mt-0.5" /> : <ShieldAlert className={`w-5 h-5 mt-0.5 ${recommended ? 'text-amber-600' : 'text-muted-foreground'}`} />}
        <div className="flex-1">
          <h2 className="font-semibold text-licet-indigo">Two-step sign-in</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {on ? 'On. Each sign-in asks for a 6-digit code from your authenticator app.'
              : `Off. ${recommended ? 'Strongly recommended for the HOD: with it on, HOD powers need your phone as well as your password.' : 'Optional: protects your account if your password leaks.'}`}
          </p>
        </div>
      </div>
      {factors === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : on ? (
        <ul className="text-[13px] divide-y divide-border border border-border rounded-md">
          {factors.map(f => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <Smartphone className="w-4 h-4 text-licet-violet" />
              <span className="flex-1">{f.friendly_name || 'Authenticator app'} <span className="text-muted-foreground">· since {new Date(f.created_at).toLocaleDateString('en-IN')}</span></span>
              <button onClick={() => remove(f.id)} disabled={busy} className="text-[12.5px] text-red-700 hover:underline">Turn off</button>
            </li>
          ))}
        </ul>
      ) : enroll ? (
        <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code to scan with an authenticator app" className="w-44 h-44 border border-border rounded-md bg-white p-1" />
          <div className="space-y-2 text-[13px]">
            <p>1. Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar) and scan this code.</p>
            <p className="text-muted-foreground">Cannot scan? Enter this key instead: <code className="font-mono text-[12px] break-all bg-muted px-1 rounded">{enroll.secret}</code></p>
            <p>2. Type the 6-digit code the app shows.</p>
            <div className="flex items-center gap-2">
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={codeInput} />
              <button onClick={confirm} disabled={busy || code.length !== 6} className="h-10 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Turn on'}</button>
              <button onClick={() => { setEnroll(null); setCode('') }} className="h-10 px-3 rounded-md border border-border text-[13px]">Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={start} disabled={busy} className="h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set up two-step sign-in'}</button>
      )}
    </section>
  )
}
const confirm_ = (msg: string) => typeof window !== 'undefined' && window.confirm(msg)

/** Full-screen step shown after the password when the account has an authenticator. */
export function TwoStepGate({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = (data?.totp ?? []).find(f => f.status === 'verified')
    if (!factor) { setBusy(false); onDone(); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    setBusy(false)
    if (error) { toast.error('Wrong or expired code — try the newest one in your app'); setCode(''); return }
    onDone()
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-licet-paper p-4">
      <form onSubmit={verify} className="bg-white border border-border rounded-xl shadow-sm p-6 w-full max-w-sm space-y-4 text-center">
        <ShieldCheck className="w-8 h-8 text-licet-violet mx-auto" />
        <div>
          <h1 className="font-display text-xl font-bold text-licet-indigo">Two-step sign-in</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus className={`${codeInput} mx-auto block`} />
        <button type="submit" disabled={busy || code.length !== 6} className="w-full h-10 rounded-md bg-licet-indigo text-white text-[13.5px] font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Continue'}</button>
        <button type="button" onClick={() => signOut().then(() => { window.location.href = '/login' })} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-licet-indigo"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
        <p className="text-[11.5px] text-muted-foreground">Lost your phone? Ask the department’s ERP administrator to reset two-step sign-in for your account.</p>
      </form>
    </div>
  )
}
