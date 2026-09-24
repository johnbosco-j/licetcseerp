"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Users, TrendingUp, GraduationCap, AlertTriangle, CheckCircle2, Loader2, Calendar, Trash2 } from "lucide-react"
import { removeGraduatedStudents } from "@/app/actions"
import { getAccessToken } from "@/lib/auth"

type Profile = Database['public']['Tables']['profiles']['Row']

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

const SEM_MAP: Record<string, number> = {
  'I CSE-A': 2,   'I CSE-B': 2,
  'II CSE-A': 4,  'II CSE-B': 4,
  'III CSE-A': 6, 'III CSE-B': 6,
  'IV CSE-A': 8,  'IV CSE-B': 8,
}

export default function PromotionPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [students, setStudents]   = useState<Profile[]>([])
  const [promotions, setPromotions] = useState<{student: Profile; from: string; to: string}[]>([])
  const [graduations, setGraduations] = useState<Profile[]>([])
  const [loading, setLoading]     = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [done, setDone]           = useState(false)
  const [log, setLog]             = useState<any[]>([])
  const [gradCount, setGradCount] = useState(0)
  const [removing, setRemoving]   = useState(false)
  const [removeMsg, setRemoveMsg] = useState('')
  const [preview, setPreview]     = useState(false)
  const [academicYear, setAcademicYear] = useState('2026-2027')
  const [runError, setRunError]   = useState('')

  const isHOD = authUser?.type === 'staff' && isTier1(authUser.data)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff' || !isTier1(au.data)) {
      router.push('/dashboard'); return
    }
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT').eq('section', 'GRADUATED')
      .then(({ count }) => setGradCount(count ?? 0))
  }, [done])

  // Load promotion history
  useEffect(() => {
    supabase.from('promotion_log' as any).select('*').order('promotion_date', { ascending: false })
      .then(({ data }: any) => { if (data) setLog(data) })
  }, [done])

  const loadPreview = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*')
      .eq('role', 'STUDENT').not('section', 'is', null).neq('section', 'GRADUATED')
    if (!data) { setLoading(false); return }

    const p: typeof promotions = []
    const g: Profile[] = []

    data.forEach(s => {
      const next = PROMOTION_MAP[s.section ?? '']
      if (!next) return
      if (next === 'GRADUATED') g.push(s)
      else p.push({ student: s, from: s.section!, to: next })
    })

    setStudents(data)
    setPromotions(p)
    setGraduations(g)
    setPreview(true)
    setLoading(false)
  }

  const alreadyRun = log.some(l => l.academic_year === academicYear.trim())

  const runPromotion = async () => {
    if (!profile || promoting) return
    setPromoting(true)
    setRunError('')

    // Each run moves every student up one year, so a second run for the same
    // academic year would skip them a year ahead. Re-check the database here in
    // case another session already ran it.
    const { count } = await supabase.from('promotion_log' as any)
      .select('id', { count: 'exact', head: true }).eq('academic_year', academicYear.trim())
    if (count) {
      setRunError(`Promotion for ${academicYear.trim()} has already been run. It can only run once per academic year.`)
      setPromoting(false)
      setPreview(false)
      const { data } = await supabase.from('promotion_log' as any).select('*').order('promotion_date', { ascending: false })
      if (data) setLog(data)
      return
    }

    let promoted = 0
    let graduated = 0
    const failures: string[] = []

    // Move whole sections at once, final year first, so no student is moved twice.
    const order = ['IV CSE-A', 'IV CSE-B', 'III CSE-A', 'III CSE-B', 'II CSE-A', 'II CSE-B', 'I CSE-A', 'I CSE-B']
    for (const from of order) {
      const to = PROMOTION_MAP[from]
      const ids = to === 'GRADUATED'
        ? graduations.filter(s => s.section === from).map(s => s.id)
        : promotions.filter(p => p.from === from).map(p => p.student.id)
      if (!ids.length) continue

      const { error } = await supabase.from('profiles')
        .update(to === 'GRADUATED' ? { section: to, is_active: false } : { section: to })
        .in('id', ids).eq('section', from)
      if (error) { failures.push(`${from}: ${error.message}`); continue }

      await supabase.from('student_promotion_history' as any).insert(ids.map(id => ({
        student_id: id, from_section: from, to_section: to,
        from_sem: SEM_MAP[from] ?? 0, to_sem: to === 'GRADUATED' ? 9 : SEM_MAP[to] ?? 0,
        academic_year: academicYear.trim(),
      })))
      if (to === 'GRADUATED') graduated += ids.length
      else promoted += ids.length
    }

    if (failures.length) {
      setRunError(`Some sections could not be promoted: ${failures.join('; ')}. Fix the issue and contact the administrator before re-running.`)
    }

    // Log the promotion run
    await supabase.from('promotion_log' as any).insert({
      academic_year: academicYear.trim(),
      promoted_count: promoted,
      graduated_count: graduated,
      run_by: profile.id,
      notes: `Promotion run for AY ${academicYear}`
    })

    setPromoting(false)
    setDone(true)
    setPreview(false)
  }

  if (!isHOD) return (
    <div className="p-6">
      <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
        <GraduationCap className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
        <p className="font-mono text-sm text-muted-foreground">Promotion module is restricted to HOD</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">YEAR PROMOTION</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Academic Year Promotion</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          Promote all students to next year — run every July. IV year students will be marked as Graduated.
        </p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-4">
        <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-mono text-xs font-bold text-amber-700">IMPORTANT — Run only in July</p>
          <p className="font-mono text-xs text-muted-foreground">
            This will permanently move all students to their next section.
            I year → II year, II year → III year, III year → IV year, IV year → GRADUATED.
            This action cannot be undone without manual intervention.
          </p>
        </div>
      </div>

      {gradCount > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="eyebrow">Graduated students</span>
            <p className="text-sm mt-1.5">{gradCount} graduated student{gradCount === 1 ? '' : 's'} still have accounts. Remove them to keep the ERP to current students only.</p>
          </div>
          <button disabled={removing} onClick={async () => {
            if (!confirm(`Permanently remove ${gradCount} graduated students and their records? This cannot be undone.`)) return
            setRemoving(true)
            const res = await removeGraduatedStudents(await getAccessToken() ?? '')
            setRemoving(false)
            if (res.error) setRemoveMsg(res.error)
            else { setRemoveMsg(`Removed ${res.removed} graduated students.`); setGradCount(0) }
          }} className="flex items-center gap-2 h-9 px-4 rounded-md bg-red-700 text-white text-[13px] font-semibold hover:bg-red-800 disabled:opacity-50">
            {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove graduated students
          </button>
        </div>
      )}
      {removeMsg && <p className="text-sm text-licet-indigo">{removeMsg}</p>}

      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="eyebrow">PROMOTION SETTINGS</span>
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground">New Academic Year</label>
            <input value={academicYear} onChange={e => setAcademicYear(e.target.value)}
              placeholder="2026-2027"
              className="h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
          </div>
          {!preview && !done && (
            <button onClick={loadPreview} disabled={loading || alreadyRun}
              className="flex items-center gap-2 h-10 px-4 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              {loading ? 'Loading...' : 'Preview Promotions'}
            </button>
          )}
        </div>
        {(alreadyRun || runError) && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            {runError || `Promotion for ${academicYear.trim()} has already been run — it can only run once per academic year.`}
          </p>
        )}
      </div>

      {/* Preview */}
      {preview && !done && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Total Students</p>
              <p className="font-serif text-[30px] font-semibold leading-none text-licet-indigo">{students.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">To Promote</p>
              <p className="text-2xl font-bold text-blue-700">{promotions.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">To Graduate</p>
              <p className="text-2xl font-bold text-green-700">{graduations.length}</p>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
              <span className="eyebrow">PROMOTION MAP</span>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(
                promotions.reduce((acc, p) => {
                  const key = `${p.from} → ${p.to}`
                  acc[key] = (acc[key] ?? 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between px-6 py-3">
                  <span className="font-mono text-sm">{key}</span>
                  <span className="font-mono text-sm font-bold text-primary">{count} students</span>
                </div>
              ))}
              {graduations.length > 0 && (
                <div className="flex items-center justify-between px-6 py-3 bg-green-50">
                  <span className="font-mono text-sm">IV CSE → 🎓 GRADUATED</span>
                  <span className="font-mono text-sm font-bold text-green-700">{graduations.length} students</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={runPromotion} disabled={promoting || alreadyRun}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-mono text-sm rounded hover:bg-red-700 disabled:opacity-50 font-bold">
              {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {promoting ? `Promoting... ${promotions.length} students` : '⚡ Run Promotion Now'}
            </button>
            <button onClick={() => setPreview(false)}
              className="px-6 py-3 border border-border bg-white text-licet-indigo text-[13.5px] font-semibold rounded-md hover:bg-licet-cream/60">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-700 mx-auto" />
          <h2 className="font-bold text-lg">Promotion complete</h2>
          <p className="font-mono text-sm text-muted-foreground">
            {promotions.length} students promoted · {graduations.length} graduated
          </p>
          <button onClick={() => { setDone(false); setPreview(false); loadPreview() }}
            className="font-mono text-xs text-primary hover:underline">
            View updated state
          </button>
        </div>
      )}

      {/* Promotion history */}
      {log.length > 0 && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
            <span className="eyebrow">PROMOTION HISTORY</span>
          </div>
          <div className="divide-y divide-border">
            {log.map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-mono text-sm font-bold">AY {entry.academic_year}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {new Date(entry.promotion_date).toLocaleDateString()} · {entry.notes}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-blue-700">{entry.promoted_count} promoted</p>
                  <p className="font-mono text-xs text-green-700">{entry.graduated_count} graduated</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
