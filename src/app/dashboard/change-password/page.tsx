"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { Lock, Eye, EyeOff, CheckCircle2, Loader2 } from "lucide-react"

export default function ChangePasswordPage() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showC, setShowC]           = useState(false)
  const [showN, setShowN]           = useState(false)
  const [showCo, setShowCo]         = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    setAuthUser(JSON.parse(stored) as AuthUser)
  }, [router])

  // Password strength
  const getStrength = (pwd: string) => {
    const checks = {
      length:  pwd.length >= 8,
      upper:   /[A-Z]/.test(pwd),
      lower:   /[a-z]/.test(pwd),
      number:  /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
    }
    const score = Object.values(checks).filter(Boolean).length
    return { score, checks }
  }

  const { score, checks } = getStrength(newPwd)
  const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][score]
  const strengthColor = ['', 'text-red-500', 'text-red-400', 'text-yellow-500', 'text-green-500', 'text-green-500'][score]
  const strengthBar   = ['', 'bg-red-500',   'bg-red-400',   'bg-yellow-500',   'bg-green-500',   'bg-green-500'][score]

  const handleUpdate = async () => {
    setError('')
    if (!currentPwd)            { setError('Please enter your current password'); return }
    if (!newPwd)                { setError('Please enter a new password'); return }
    if (newPwd.length < 8)      { setError('New password must be at least 8 characters'); return }
    if (newPwd !== confirmPwd)  { setError('New passwords do not match'); return }
    if (newPwd === currentPwd)  { setError('New password must be different from current password'); return }

    setSaving(true)

    // Step 1 — verify current password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: authUser!.data.email,
      password: currentPwd
    })

    if (signInErr) {
      setError('Current password is incorrect')
      setSaving(false)
      return
    }

    // Step 2 — update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd })

    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSuccess(true)
    setCurrentPwd('')
    setNewPwd('')
    setConfirmPwd('')
  }

  const PwdInput = ({
    label, value, onChange, show, onToggle, placeholder
  }: {
    label: string; value: string; onChange: (v: string) => void
    show: boolean; onToggle: () => void; placeholder: string
  }) => (
    <div className="space-y-1.5">
      <label className="font-mono text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-10 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none transition-colors"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 flex justify-center">
      <div className="w-full max-w-md space-y-6">
        <div>
          <span className="font-mono text-xs text-primary">// SECURITY</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Change Password</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Verify your current password then set a new one
          </p>
        </div>

        {success ? (
          <div className="bg-card border border-green-500/20 rounded-lg p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="font-bold text-base">Password Updated!</h2>
            <p className="font-mono text-xs text-muted-foreground">
              Your password has been changed successfully.
            </p>
            <button onClick={() => setSuccess(false)}
              className="font-mono text-xs text-primary hover:underline">
              Change again
            </button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 space-y-5">

            <PwdInput
              label="Current Password"
              value={currentPwd}
              onChange={setCurrentPwd}
              show={showC}
              onToggle={() => setShowC(!showC)}
              placeholder="Enter your current password"
            />

            <div className="border-t border-border pt-5 space-y-5">
              <PwdInput
                label="New Password"
                value={newPwd}
                onChange={setNewPwd}
                show={showN}
                onToggle={() => setShowN(!showN)}
                placeholder="Enter new password"
              />

              {/* Strength meter */}
              {newPwd.length > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${i <= score ? strengthBar : 'bg-border'}`} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`font-mono text-xs ${strengthColor}`}>{strengthLabel}</p>
                    <p className="font-mono text-xs text-muted-foreground">{score}/5</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    {[
                      { key: 'length',  label: '8+ characters' },
                      { key: 'upper',   label: 'Uppercase (A-Z)' },
                      { key: 'lower',   label: 'Lowercase (a-z)' },
                      { key: 'number',  label: 'Number (0-9)' },
                      { key: 'special', label: 'Special (!@#...)' },
                    ].map(({ key, label }) => (
                      <div key={key}
                        className={`flex items-center gap-1.5 font-mono text-xs transition-colors ${(checks as any)[key] ? 'text-green-500' : 'text-muted-foreground'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${(checks as any)[key] ? 'bg-green-500' : 'bg-border'}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <PwdInput
                label="Confirm New Password"
                value={confirmPwd}
                onChange={setConfirmPwd}
                show={showCo}
                onToggle={() => setShowCo(!showCo)}
                placeholder="Re-enter new password"
              />

              {/* Match indicator */}
              {confirmPwd.length > 0 && (
                <p className={`font-mono text-xs ${confirmPwd === newPwd ? 'text-green-500' : 'text-red-500'}`}>
                  {confirmPwd === newPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                <p className="font-mono text-xs text-red-500">{error}</p>
              </div>
            )}

            <button
              onClick={handleUpdate}
              disabled={saving || !currentPwd || !newPwd || !confirmPwd}
              className="w-full flex items-center justify-center gap-2 h-10 bg-primary text-primary-foreground font-mono text-sm rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
