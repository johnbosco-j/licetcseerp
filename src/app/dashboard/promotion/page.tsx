"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { Users, TrendingUp, GraduationCap, AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Archive, Download, Undo2 } from "lucide-react"
import { removeGraduatedStudents, listArchives } from "@/app/actions"
import { getCurrentSemParity } from "@/lib/semester"
import { getAccessToken } from "@/lib/auth"


const PROMOTION_MAP: Record<string, string> = {
  'I CSE-A':   'II CSE-A',
  'I CSE-B':   'II CSE-B',
  'II CSE-A':  'III CSE-A',
  'II CSE-B':  'III CSE-B',
  'III CSE-A': 'IV CSE-A',
  'III CSE-B': 'IV CSE-B',
  'IV CSE-A':  'GRADUATED',
  'IV CSE-B':  'GRADUATED',
}


const SECTION_ORDER = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B']
type LogEntry = { id: string; academic_year: string; promotion_date: string; promoted_count: number; graduated_count: number; notes: string | null }

// The academic year a promotion moves students into: from June the new year has
// begun (2026 → 2026-2027); before June the next one is still ahead.
const nextAcademicYear = (log: LogEntry[]) => {
  const d = new Date()
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1
  const current = `${start}-${start + 1}`
  return log.some(l => l.academic_year === current) ? `${start + 1}-${start + 2}` : current
}

export default function PromotionPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [counts, setCounts]       = useState<Record<string, number> | null>(null)
  const [log, setLog]             = useState<LogEntry[]>([])
  const [academicYear, setAcademicYear] = useState('')
  const [busy, setBusy]           = useState<'' | 'preview' | 'run' | 'revert' | 'remove'>('')
  const [message, setMessage]     = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [gradCount, setGradCount] = useState(0)
  const [archives, setArchives]   = useState<{ name: string; created_at: string; url: string }[]>([])

  const isHOD = authUser?.type === 'staff' && isTier1(authUser.data)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff' || !isTier1(au.data)) router.push('/dashboard')
  }, [router])

  const refresh = async () => {
    const [{ data: logRows }, { count }, arch] = await Promise.all([
      supabase.from('promotion_log' as any).select('*').order('promotion_date', { ascending: false }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT').eq('section', 'GRADUATED'),
      listArchives(await getAccessToken() ?? ''),
    ])
    const entries = (logRows ?? []) as unknown as LogEntry[]
    setLog(entries)
    setAcademicYear(prev => prev || nextAcademicYear(entries))
    setGradCount(count ?? 0)
    setArchives(arch.files ?? [])
  }
  useEffect(() => { if (isHOD) refresh() }, [isHOD])

  const loadPreview = async () => {
    setBusy('preview'); setMessage(null)
    const head = { count: 'exact' as const, head: true }
    const res = await Promise.all(SECTION_ORDER.map(sec =>
      supabase.from('profiles').select('id', head).eq('role', 'STUDENT').eq('section', sec)))
    setCounts(Object.fromEntries(SECTION_ORDER.map((sec, i) => [sec, res[i].count ?? 0])))
    setBusy('')
  }

  const ay = academicYear.trim()
  const alreadyRun = log.some(l => l.academic_year === ay)
  const toPromote = counts ? SECTION_ORDER.filter(s => !s.startsWith('IV')).reduce((a, s) => a + counts[s], 0) : 0
  const toGraduate = counts ? counts['IV CSE-A'] + counts['IV CSE-B'] : 0

  const runPromotion = async () => {
    if (!confirm(`Promote every student for academic year ${ay}?\n\n${toPromote} students move up one year and ${toGraduate} final-year students graduate. This runs as a single step: either every student is moved or none are.`)) return
    setBusy('run'); setMessage(null)
    const { data, error } = await supabase.rpc('run_promotion' as never, { p_academic_year: ay } as never)
    setBusy('')
    if (error) { setMessage({ tone: 'err', text: error.message }); return }
    const r = data as unknown as { promoted: number; graduated: number }
    setMessage({ tone: 'ok', text: `Promotion for ${ay} complete: ${r.promoted} students promoted, ${r.graduated} graduated. Students now see their new semester's courses.` })
    setCounts(null)
    await refresh()
  }

  const revert = async (entry: LogEntry) => {
    if (!confirm(`Undo the ${entry.academic_year} promotion?\n\nEvery student returns to the section they were in before it, and graduates are reactivated. Use this only if the promotion was run by mistake.`)) return
    setBusy('revert'); setMessage(null)
    const { data, error } = await supabase.rpc('revert_promotion' as never, { p_academic_year: entry.academic_year } as never)
    setBusy('')
    if (error) { setMessage({ tone: 'err', text: error.message }); return }
    setMessage({ tone: 'ok', text: `Promotion for ${entry.academic_year} undone: ${(data as unknown as { restored: number }).restored} students restored to their previous sections.` })
    setAcademicYear('')
    await refresh()
  }

  const removeGraduates = async () => {
    if (!confirm(`Archive and remove ${gradCount} graduated students?\n\nTheir complete records (profile, attendance, marks, leaves, grievances, alerts, promotion history) are first saved to the department archive. Their accounts are then removed from the ERP.`)) return
    setBusy('remove'); setMessage(null)
    const res = await removeGraduatedStudents(await getAccessToken() ?? '')
    setBusy('')
    if (res.error) { setMessage({ tone: 'err', text: res.error }); return }
    setMessage({ tone: 'ok', text: `Archived and removed ${res.removed} graduated students. The archive can be downloaded below.` })
    await refresh()
  }

  if (!isHOD) return (
    <div className="p-6">
      <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
        <GraduationCap className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Year promotion is available to the HOD and Vice Principal.</p>
      </div>
    </div>
  )

  const latest = log[0]
  const parity = getCurrentSemParity()

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">YEAR PROMOTION</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Academic Year Promotion</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          Moves every student up one year at the start of the academic year. Final-year students are marked as graduated.
        </p>
      </div>

      {message && (
        <div role="status" className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-[13px] ${message.tone === 'ok' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Current state */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card border border-border p-4">
          <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground">Last promotion</p>
          <p className="font-serif text-[26px] font-semibold text-licet-indigo mt-1">{latest ? `AY ${latest.academic_year}` : 'None yet'}</p>
          <p className="text-[12px] text-muted-foreground">{latest ? `Run on ${new Date(latest.promotion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'No promotion has been recorded'}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground">Current semester</p>
          <p className="font-serif text-[26px] font-semibold text-licet-indigo mt-1">{parity === 'odd' ? 'Odd' : 'Even'} semester</p>
          <p className="text-[12px] text-muted-foreground">{parity === 'odd' ? 'Semesters 1, 3, 5, 7 · started at promotion' : 'Semesters 2, 4, 6, 8 · January to May'}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground">Next promotion</p>
          <p className="font-serif text-[26px] font-semibold text-licet-indigo mt-1">AY {nextAcademicYear(log)}</p>
          <p className="text-[12px] text-muted-foreground">Run once, at the start of that academic year</p>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-licet-cream/60 border border-licet-gold rounded-lg px-4 py-4">
        <ShieldCheck className="w-5 h-5 text-licet-indigo flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-[13px] text-licet-indigo">
          <p className="font-semibold">How promotion keeps data safe</p>
          <p className="text-muted-foreground">
            Promotion runs as a single database step: either every student is moved or nobody is, so a lost connection can never leave the department half-promoted.
            It can run only once per academic year. Each move is recorded in the promotion history, and the most recent promotion can be undone.
            Attendance, marks and all other records stay attached to the student. The odd semester begins when promotion is run.
          </p>
        </div>
      </div>

      {/* Run */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="eyebrow">PROMOTION</span>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="ay" className="text-xs text-muted-foreground">Academic year to promote into</label>
            <input id="ay" value={academicYear} onChange={e => { setAcademicYear(e.target.value); setCounts(null) }} placeholder="2027-2028"
              className="h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
          </div>
          <button onClick={loadPreview} disabled={!!busy || alreadyRun || !/^\d{4}-\d{4}$/.test(ay)}
            className="flex items-center gap-2 h-10 px-4 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
            {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Preview
          </button>
        </div>
        {alreadyRun && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            Promotion for {ay} has already been run. It can only run once per academic year.
          </p>
        )}

        {counts && !alreadyRun && (
          <div className="space-y-4 pt-2">
            <div className="border border-border rounded-lg divide-y divide-border">
              {SECTION_ORDER.map(from => (
                <div key={from} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]">
                  <span className="text-licet-indigo">{from} <span className="text-muted-foreground">→</span> {PROMOTION_MAP[from] === 'GRADUATED' ? 'Graduated' : PROMOTION_MAP[from]}</span>
                  <span className="font-semibold tabular-nums">{counts[from]} students</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={runPromotion} disabled={!!busy}
                className="flex items-center gap-2 h-10 px-5 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet disabled:opacity-50">
                {busy === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {busy === 'run' ? 'Promoting…' : `Promote ${toPromote} students and graduate ${toGraduate}`}
              </button>
              <button onClick={() => setCounts(null)} className="h-10 px-4 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Graduates */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="eyebrow">GRADUATED STUDENTS</span>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13.5px] text-licet-indigo max-w-2xl">
            {gradCount > 0
              ? `${gradCount} graduated student${gradCount === 1 ? '' : 's'} still ${gradCount === 1 ? 'has an account' : 'have accounts'}. Archiving saves their complete records to the department archive before the accounts are removed.`
              : 'No graduated students have accounts in the ERP.'}
          </p>
          {gradCount > 0 && (
            <button disabled={!!busy} onClick={removeGraduates}
              className="flex items-center gap-2 h-9 px-4 rounded-md bg-red-700 text-white text-[13px] font-semibold hover:bg-red-800 disabled:opacity-50">
              {busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Archive and remove
            </button>
          )}
        </div>
        {archives.length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border">
            {archives.map(a => (
              <div key={a.name} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                <span className="text-licet-indigo truncate">{a.name}</span>
                <a href={a.url} className="inline-flex items-center gap-1.5 text-licet-violet font-semibold hover:underline shrink-0"><Download className="w-3.5 h-3.5" />Download</a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {log.length > 0 && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
            <span className="eyebrow">PROMOTION HISTORY</span>
          </div>
          <div className="divide-y divide-border">
            {log.map((entry, i) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-licet-indigo">AY {entry.academic_year}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.promotion_date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-xs">
                    <p className="text-licet-indigo">{entry.promoted_count} promoted</p>
                    <p className="text-green-800">{entry.graduated_count} graduated</p>
                  </div>
                  {i === 0 && (
                    <button onClick={() => revert(entry)} disabled={!!busy}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-semibold text-licet-indigo hover:bg-licet-cream/60 disabled:opacity-50">
                      {busy === 'revert' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Undo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
