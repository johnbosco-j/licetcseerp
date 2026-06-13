"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Users, TrendingUp, GraduationCap, AlertTriangle, CheckCircle2, Loader2, Calendar } from "lucide-react"

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
  const [preview, setPreview]     = useState(false)
  const [academicYear, setAcademicYear] = useState('2026-2027')

  const isHOD = authUser?.type === 'staff' && authUser.data.role === 'HOD'

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff' || (au.data as any).role !== 'HOD') {
      router.push('/dashboard'); return
    }
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

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

  const runPromotion = async () => {
    if (!profile) return
    setPromoting(true)

    let promoted = 0
    let graduated = 0

    // Promote students
    for (const { student, from, to } of promotions) {
      const { error } = await supabase.from('profiles').update({ section: to })
        .eq('id', student.id)
      if (!error) {
        // Log history
        await supabase.from('student_promotion_history' as any).insert({
          student_id: student.id,
          from_section: from,
          to_section: to,
          from_sem: SEM_MAP[from] ?? 0,
          to_sem: SEM_MAP[to] ?? 0,
          academic_year: academicYear,
        })
        promoted++
      }
    }

    // Graduate students
    for (const student of graduations) {
      const { error } = await supabase.from('profiles').update({
        section: 'GRADUATED', is_active: false
      }).eq('id', student.id)
      if (!error) {
        await supabase.from('student_promotion_history' as any).insert({
          student_id: student.id,
          from_section: student.section,
          to_section: 'GRADUATED',
          from_sem: 8,
          to_sem: 9,
          academic_year: academicYear,
        })
        graduated++
      }
    }

    // Log the promotion run
    await supabase.from('promotion_log' as any).insert({
      academic_year: academicYear,
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
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <GraduationCap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="font-mono text-sm text-muted-foreground">Promotion module is restricted to HOD</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: YEAR PROMOTION</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Academic Year Promotion</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          Promote all students to next year — run every July. IV year students will be marked as Graduated.
        </p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-4">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-mono text-xs font-bold text-yellow-500">IMPORTANT — Run only in July</p>
          <p className="font-mono text-xs text-muted-foreground">
            This will permanently move all students to their next section.
            I year → II year, II year → III year, III year → IV year, IV year → GRADUATED.
            This action cannot be undone without manual intervention.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="font-mono text-xs text-primary">// PROMOTION SETTINGS</span>
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground">New Academic Year</label>
            <input value={academicYear} onChange={e => setAcademicYear(e.target.value)}
              placeholder="2026-2027"
              className="h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
          </div>
          {!preview && !done && (
            <button onClick={loadPreview} disabled={loading}
              className="flex items-center gap-2 h-10 px-4 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              {loading ? 'Loading...' : 'Preview Promotions'}
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && !done && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-mono text-xs text-muted-foreground mb-1">Total Students</p>
              <p className="text-2xl font-bold">{students.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-mono text-xs text-muted-foreground mb-1">To Promote</p>
              <p className="text-2xl font-bold text-blue-500">{promotions.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-mono text-xs text-muted-foreground mb-1">To Graduate</p>
              <p className="text-2xl font-bold text-green-500">{graduations.length}</p>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-mono text-xs text-primary">// PROMOTION MAP</span>
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
                <div className="flex items-center justify-between px-6 py-3 bg-green-500/5">
                  <span className="font-mono text-sm">IV CSE → 🎓 GRADUATED</span>
                  <span className="font-mono text-sm font-bold text-green-500">{graduations.length} students</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={runPromotion} disabled={promoting}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-mono text-sm rounded hover:bg-red-700 disabled:opacity-50 font-bold">
              {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {promoting ? `Promoting... ${promotions.length} students` : '⚡ Run Promotion Now'}
            </button>
            <button onClick={() => setPreview(false)}
              className="px-6 py-3 bg-accent font-mono text-sm rounded hover:bg-accent/80">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h2 className="font-bold text-lg">Promotion Complete!</h2>
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
          <div className="px-6 py-4 border-b border-border">
            <span className="font-mono text-xs text-primary">// PROMOTION HISTORY</span>
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
                  <p className="font-mono text-xs text-blue-500">{entry.promoted_count} promoted</p>
                  <p className="font-mono text-xs text-green-500">{entry.graduated_count} graduated</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
