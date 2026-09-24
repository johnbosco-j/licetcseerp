"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { KeyRound, Loader2, Search, ShieldCheck, UserCog, Users, X, Check, Copy } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { Database } from "@/lib/supabase"
import { getAccessToken } from "@/lib/auth"
import { resetPassword } from "@/app/actions"
import { canResetPassword, defaultStudentPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords"
import { PageHeader, Card, CardHeader, Badge, EmptyState, btn, field } from "@/components/ui/page"

type Profile = Database['public']['Tables']['profiles']['Row']

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export default function AccountsPage() {
  const [me, setMe]             = useState<Profile | null>(null)
  const [people, setPeople]     = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'STUDENT' | 'PROFESSOR'>('STUDENT')
  const [sectionFilter, setSectionFilter] = useState('ALL')
  const [search, setSearch]     = useState('')
  const [target, setTarget]     = useState<Profile | null>(null)
  const [customPwd, setCustomPwd] = useState('')
  const [busy, setBusy]         = useState(false)
  const [message, setMessage]   = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied]     = useState(false)

  const isHOD = isTier1(me)              // tier 1: HOD or Vice Principal
  const isRealHOD = me?.role === 'HOD'   // only the HOD grants password-admin rights
  const isPasswordAdmin = isHOD || !!me?.can_reset_passwords
  const advisorOnly = !isPasswordAdmin && !!me?.advisor_section

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: self } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setMe(self)
    let q = supabase.from('profiles').select('*').in('role', ['STUDENT', 'PROFESSOR']).order('full_name')
    if (self && !isTier1(self) && !self.can_reset_passwords && self.advisor_section) {
      q = q.eq('role', 'STUDENT').eq('section', self.advisor_section)
    }
    const { data } = await q
    setPeople(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (advisorOnly && me?.advisor_section) setSectionFilter(me.advisor_section) }, [advisorOnly, me])

  const list = useMemo(() => {
    const s = search.trim().toLowerCase()
    return people.filter(p =>
      p.role === tab &&
      (tab !== 'STUDENT' || sectionFilter === 'ALL' || p.section === sectionFilter) &&
      (!s || p.full_name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s)))
  }, [people, tab, sectionFilter, search])

  const advisors = useMemo(() => {
    const m: Record<string, Profile> = {}
    people.forEach(p => { if (p.role === 'PROFESSOR' && p.advisor_section) m[p.advisor_section] = p })
    return m
  }, [people])

  const doReset = async (useDefault: boolean) => {
    if (!target) return
    if (!useDefault && customPwd.trim().length < MIN_PASSWORD_LENGTH) {
      setMessage({ tone: 'err', text: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }); return
    }
    setBusy(true); setMessage(null)
    const res = await resetPassword(await getAccessToken() ?? '', target.id, useDefault ? undefined : customPwd.trim())
    setBusy(false)
    if (res.error) { setMessage({ tone: 'err', text: res.error }); return }
    setMessage({ tone: 'ok', text: `${target.full_name}'s password is now: ${res.password}` })
    setPeople(prev => prev.map(p => p.id === target.id ? { ...p, must_change_password: true } : p))
    setCustomPwd('')
  }

  const setAdvisor = async (faculty: Profile, section: string) => {
    setMessage(null)
    const prev = people.find(p => p.role === 'PROFESSOR' && p.advisor_section === section && p.id !== faculty.id)
    if (section && prev) await supabase.from('profiles').update({ advisor_section: null }).eq('id', prev.id)
    const { error } = await supabase.from('profiles').update({ advisor_section: section || null }).eq('id', faculty.id)
    if (error) { setMessage({ tone: 'err', text: error.message }); return }
    setPeople(ps => ps.map(p => p.id === faculty.id ? { ...p, advisor_section: section || null }
      : prev && p.id === prev.id ? { ...p, advisor_section: null } : p))
    setMessage({ tone: 'ok', text: section ? `${faculty.full_name} is now class advisor of ${section}` : `${faculty.full_name} is no longer a class advisor` })
  }

  const togglePasswordAdmin = async (faculty: Profile) => {
    const next = !faculty.can_reset_passwords
    const { error } = await supabase.from('profiles').update({ can_reset_passwords: next }).eq('id', faculty.id)
    if (error) { setMessage({ tone: 'err', text: error.message }); return }
    setPeople(ps => ps.map(p => p.id === faculty.id ? { ...p, can_reset_passwords: next } : p))
  }

  if (!loading && me && !isPasswordAdmin && !me.advisor_section) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader kicker="Accounts" title="Accounts & Passwords" />
        <Card><EmptyState icon={ShieldCheck} title="No account permissions">
          Only the HOD, password administrators and class advisors can reset passwords. Ask the HOD if you need access.
        </EmptyState></Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader kicker="Accounts" title="Accounts & Passwords"
        description={advisorOnly
          ? `As class advisor of ${me?.advisor_section}, you can reset passwords for students in your class.`
          : 'Reset forgotten passwords. Students return to their default password; everyone must choose a new one at next sign-in.'} />

      {message && (
        <div role="status" className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-[13px] ${message.tone === 'ok' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {message.tone === 'ok' ? <Check size={16} className="mt-0.5 shrink-0" /> : <X size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1 select-all">{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}

      {isHOD && (
        <Card>
          <CardHeader title="Class advisors" description="Advisors can reset passwords of students in their class (Regulations 2024, clause 8)." />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {SECTIONS.map(sec => (
              <div key={sec} className="bg-card p-4">
                <p className="text-[11px] font-bold tracking-[2px] uppercase text-muted-foreground">{sec}</p>
                <p className="text-[14px] font-medium text-licet-indigo mt-1 truncate">{advisors[sec]?.full_name ?? <span className="text-muted-foreground italic font-normal">Not assigned</span>}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
          {isPasswordAdmin && (
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-licet-paper" role="tablist">
              {(['STUDENT', 'PROFESSOR'] as const).map(t => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`h-8 px-4 rounded-md text-[13px] font-semibold ${tab === t ? 'bg-licet-indigo text-white shadow-sm' : 'text-licet-indigo hover:bg-white'}`}>
                  {t === 'STUDENT' ? 'Students' : 'Faculty'}
                </button>
              ))}
            </div>
          )}
          {tab === 'STUDENT' && !advisorOnly && (
            <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className={`${field} w-auto`} aria-label="Section">
              <option value="ALL">All sections</option>
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <label className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" className={`${field} pl-9`} />
          </label>
          <span className="text-[12px] text-muted-foreground">{list.length} {tab === 'STUDENT' ? 'students' : 'faculty'}</span>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title="Nobody found">Try a different search or section.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Email</th>
                  {tab === 'STUDENT' ? <th className="px-5 py-2.5">Section</th> : isHOD && <><th className="px-5 py-2.5">Class advisor</th><th className="px-5 py-2.5">Password admin</th></>}
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium text-licet-indigo">{p.full_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.email}</td>
                    {tab === 'STUDENT' ? <td className="px-5 py-3">{p.section}</td> : isHOD && (
                      <>
                        <td className="px-5 py-3">
                          <select value={p.advisor_section ?? ''} onChange={e => setAdvisor(p, e.target.value)} className={`${field} h-8 w-36`} aria-label={`Class advisor section for ${p.full_name}`}>
                            <option value="">—</option>
                            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-5 py-3">
                          <button role="switch" aria-checked={p.can_reset_passwords} onClick={() => togglePasswordAdmin(p)}
                            disabled={!isRealHOD} title={isRealHOD ? undefined : 'Only the HOD can change password-admin rights'}
                            aria-label={`Password admin: ${p.full_name}`}
                            className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${p.can_reset_passwords ? 'bg-licet-indigo' : 'bg-muted border border-border'}`}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.can_reset_passwords ? 'left-[18px]' : 'left-0.5'}`} />
                          </button>
                        </td>
                      </>
                    )}
                    <td className="px-5 py-3">
                      {p.must_change_password ? <Badge tone="amber">Must change password</Badge> : <Badge tone="green">Active</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {me && canResetPassword(me, p) && (
                        <button onClick={() => { setTarget(p); setCustomPwd(''); setMessage(null) }} className={btn.ghost}>
                          <KeyRound size={14} /> Reset password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-licet-indigo/40 backdrop-blur-[2px] p-4" onClick={() => !busy && setTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-xl shadow-2xl border-t-[3px] border-licet-gold overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Reset password</p>
                  <h2 id="reset-title" className="font-serif text-[22px] font-semibold mt-1">{target.full_name}</h2>
                  <p className="text-[12.5px] text-muted-foreground">{target.email}</p>
                </div>
                <button onClick={() => setTarget(null)} aria-label="Close" className="p-1 rounded hover:bg-muted"><X size={18} /></button>
              </div>

              {message?.tone === 'ok' ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-[13px]">
                    <Check size={16} /> Password updated. They must set a new one at next sign-in.
                  </div>
                  <button className={btn.secondary} onClick={() => {
                    navigator.clipboard?.writeText(message.text.split(': ').slice(1).join(': ')); setCopied(true); setTimeout(() => setCopied(false), 1500)
                  }}><Copy size={14} /> {copied ? 'Copied' : 'Copy password'}</button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {target.role === 'STUDENT' && (
                    <button disabled={busy} onClick={() => doReset(true)} className={`${btn.primary} w-full`}>
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                      Reset to default ({defaultStudentPassword(target.email)})
                    </button>
                  )}
                  <div>
                    <label className="text-[11px] font-bold tracking-[2px] uppercase text-licet-violet" htmlFor="custom-pwd">
                      {target.role === 'STUDENT' ? 'Or set a specific password' : 'New password'}
                    </label>
                    <div className="flex gap-2 mt-1.5">
                      <input id="custom-pwd" value={customPwd} onChange={e => setCustomPwd(e.target.value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} className={field} autoComplete="new-password" />
                      <button disabled={busy || !customPwd} onClick={() => doReset(false)} className={btn.secondary}>Set</button>
                    </div>
                  </div>
                  {message?.tone === 'err' && <p className="text-[12.5px] text-red-700">{message.text}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isHOD && tab === 'PROFESSOR' && (
        <p className="text-[12px] text-muted-foreground flex items-center gap-1.5"><UserCog size={13} /> Password admins can reset any student or faculty password.</p>
      )}
    </div>
  )
}
