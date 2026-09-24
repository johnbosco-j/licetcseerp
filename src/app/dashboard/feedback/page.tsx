"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { MessageSquare, Star, Loader2, CheckCircle2 } from "lucide-react"

type Subject = Database['public']['Tables']['subjects']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface FeedbackEntry {
  subject_id: string
  faculty_id?: string
  rating: number
  comment: string
  category: string
}

const FEEDBACK_QUESTIONS = [
  'Course content was well organized',
  'Faculty explained concepts clearly',
  'Adequate time given for understanding',
  'Practical sessions were effective',
  'Overall satisfaction with the course',
]


// Semester helper — June–Dec = odd (1,3,5,7), Jan–May = even (2,4,6,8)
function getActiveSemester(s: string): number {
  const m = new Date().getMonth() + 1
  const odd = m >= 6
  const map: Record<string, [number,number]> = {
    'I CSE-A':[1,2],'I CSE-B':[1,2],
    'II CSE-A':[3,4],'II CSE-B':[3,4],
    'III CSE-A':[5,6],'III CSE-B':[5,6],
    'IV CSE-A':[7,8],'IV CSE-B':[7,8],
  }
  const [o,e] = map[s] ?? [1,2]
  return odd ? o : e
}
export default function FeedbackPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<Subject | null>(null)
  const [ratings, setRatings]   = useState<number[]>([0, 0, 0, 0, 0])
  const [comment, setComment]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState<string[]>([])
  const [summary, setSummary]   = useState<Record<string, { avg: number; count: number }>>({})
  const [submitError, setSubmitError] = useState('')
  const [loadingStats, setLoadingStats] = useState(false)
  const [selectedSection, setSelectedSection] = useState('II CSE-A')

  const isStaff   = authUser?.type === 'staff'
  const isStudent = authUser?.type === 'student'
  const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  useEffect(() => {
    if (!isStudent || !profile) return
    supabase.from('announcements').select('audience')
      .eq('created_by', profile.id).like('audience', 'FEEDBACK:%')
      .then(({ data }) => { if (data) setSaved(data.map(r => r.audience.slice('FEEDBACK:'.length))) })
  }, [isStudent, profile])

  useEffect(() => {
    if (!authUser) return
    if (isStudent) {
      const section = (authUser.data as { section?: string })?.section ?? ''
      supabase.from('subjects').select('*')
        .eq('section', section).eq('semester', currentSem(section)).order('name')
        .then(({ data }) => { if (data) setSubjects(data) })
    }
  }, [authUser, isStudent])

  useEffect(() => {
    if (!isStaff) return
    let cancelled = false
    const load = async () => {
      setLoadingStats(true)
      const { data: subs } = await supabase.from('subjects').select('*')
        .eq('section', selectedSection).eq('semester', currentSem(selectedSection)).order('name')
      const list = subs ?? []
      const { data: rows } = list.length
        ? await supabase.from('announcements').select('audience, body').in('audience', list.map(s => `FEEDBACK:${s.id}`))
        : { data: [] }
      const agg: Record<string, { total: number; count: number }> = {}
      for (const r of rows ?? []) {
        try {
          const avg = Number(JSON.parse(r.body).avgRating)
          if (!avg) continue
          const id = r.audience.slice('FEEDBACK:'.length)
          agg[id] = { total: (agg[id]?.total ?? 0) + avg, count: (agg[id]?.count ?? 0) + 1 }
        } catch { /* skip malformed rows */ }
      }
      if (cancelled) return
      setSubjects(list)
      setSummary(Object.fromEntries(Object.entries(agg).map(([id, v]) => [id, { avg: v.total / v.count, count: v.count }])))
      setLoadingStats(false)
    }
    load()
    return () => { cancelled = true }
  }, [isStaff, selectedSection])

  const submitFeedback = async () => {
    if (!profile || !selected || ratings.some(r => r === 0)) return
    setSaving(true)
    setSubmitError('')
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length

    const { error } = await supabase.from('announcements').insert({
      title: `Course feedback — ${selected.code}`,
      body: JSON.stringify({ ratings, comment, avgRating }),
      audience: `FEEDBACK:${selected.id}`,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })

    setSaving(false)
    // 23505 = already submitted for this subject
    if (error && error.code !== '23505') { setSubmitError('Could not submit feedback. Please try again.'); return }
    setSaved(prev => [...prev, selected.id])
    setSelected(null)
    setRatings([0, 0, 0, 0, 0])
    setComment('')
  }

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(star => (
        <button key={star} onClick={() => onChange(star)}
          className={`text-xl transition-all ${star <= value ? 'text-amber-600' : 'text-muted-foreground/30 hover:text-amber-600/50'}`}>
          ★
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">FEEDBACK</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Course Feedback</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          {isStudent ? 'Rate your courses to help improve teaching quality'
            : 'View aggregated feedback for courses'}
        </p>
      </div>

      {/* Staff summary */}
      {isStaff && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSelectedSection(s)}
                className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${selectedSection === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
              <span className="eyebrow">FEEDBACK SUMMARY — {selectedSection}</span>
            </div>
            {loadingStats && (
              <div className="px-6 py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            )}
            {!loadingStats && subjects.length === 0 && (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">No subjects configured for {selectedSection} this semester.</p>
            )}
            {!loadingStats && subjects.map(subject => {
              const s = summary[subject.id]
              return (
                <div key={subject.id} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                    <p className="text-sm font-medium">{subject.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-muted-foreground">{s ? `${s.count} response${s.count === 1 ? '' : 's'}` : 'No responses yet'}</p>
                    {s
                      ? <p className="text-licet-indigo text-lg font-semibold"><span className="text-amber-600">★</span> {s.avg.toFixed(2)}<span className="text-xs text-muted-foreground font-normal"> / 5</span></p>
                      : <p className="text-muted-foreground/60 text-lg">—</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Student view */}
      {isStudent && (
        <div className="space-y-4">
          {!selected ? (
            <div className="space-y-3">
              <p className="font-mono text-xs text-muted-foreground">Select a subject to give feedback:</p>
              {subjects.map(subject => {
                const isSaved = saved.includes(subject.id)
                return (
                  <div key={subject.id}
                    className={`bg-card border rounded-lg p-4 flex items-center justify-between transition-all ${isSaved ? 'border-green-200 opacity-60' : 'border-border hover:border-primary/50 cursor-pointer'}`}
                    onClick={() => !isSaved && setSelected(subject)}>
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                      <p className="text-sm font-medium">{subject.name}</p>
                    </div>
                    {isSaved ? (
                      <span className="flex items-center gap-1 font-mono text-xs text-green-700">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">Rate →</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-6">
              <div>
                <span className="eyebrow">FEEDBACK FOR</span>
                <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">{selected.name}</h2>
                <p className="font-mono text-xs text-muted-foreground">{selected.code}</p>
              </div>

              <div className="space-y-4">
                {FEEDBACK_QUESTIONS.map((q, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <p className="text-sm flex-1">{q}</p>
                    <StarRating value={ratings[i]} onChange={v => {
                      const next = [...ratings]; next[i] = v; setRatings(next)
                    }} />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Additional Comments (optional)</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Any additional feedback..."
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={submitFeedback} disabled={saving || ratings.some(r => r === 0)}
                  className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                  {saving ? 'Submitting...' : 'Submit Feedback'}
                </button>
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">
                  Cancel
                </button>
              </div>

              {submitError && <p className="font-mono text-xs text-red-700">{submitError}</p>}
              {ratings.some(r => r === 0) && (
                <p className="font-mono text-xs text-muted-foreground">Please rate all questions before submitting</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
