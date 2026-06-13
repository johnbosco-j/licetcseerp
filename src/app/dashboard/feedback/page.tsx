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
  const [hodView, setHodView]   = useState<any[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [selectedSection, setSelectedSection] = useState('II CSE-A')

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isStudent = authUser?.type === 'student'
  const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
  const currentSem = (s: string) => s.startsWith('IV ') ? 8 : s.startsWith('III ') ? 6 : s.startsWith('II ') ? 4 : 2

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

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
    if (!isHOD) return
    setLoadingStats(true)
    supabase.from('subjects').select('*')
      .eq('section', selectedSection).eq('semester', currentSem(selectedSection)).order('name')
      .then(({ data }) => {
        if (data) setSubjects(data)
        setLoadingStats(false)
      })
  }, [isHOD, selectedSection])

  const submitFeedback = async () => {
    if (!profile || !selected || ratings.some(r => r === 0)) return
    setSaving(true)
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length

    // Store as announcement with structured data (using announcements table as proxy)
    await supabase.from('announcements').insert({
      title: `FEEDBACK:${selected.id}:${profile.id}`,
      body: JSON.stringify({ ratings, comment, avgRating }),
      audience: 'PROFESSOR',
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })

    setSaving(false)
    setSaved(prev => [...prev, selected.id])
    setSelected(null)
    setRatings([0, 0, 0, 0, 0])
    setComment('')
  }

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(star => (
        <button key={star} onClick={() => onChange(star)}
          className={`text-xl transition-all ${star <= value ? 'text-yellow-500' : 'text-muted-foreground/30 hover:text-yellow-500/50'}`}>
          ★
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: FEEDBACK</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Course Feedback</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          {isStudent ? 'Rate your courses to help improve teaching quality'
            : 'View aggregated feedback for courses'}
        </p>
      </div>

      {/* HOD view */}
      {isHOD && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSelectedSection(s)}
                className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${selectedSection === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-mono text-xs text-primary">// FEEDBACK SUMMARY — {selectedSection}</span>
            </div>
            {subjects.map(subject => (
              <div key={subject.id} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                  <p className="text-sm font-medium">{subject.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-muted-foreground">Avg Rating</p>
                  <p className="text-yellow-500 text-lg font-bold">★ —</p>
                </div>
              </div>
            ))}
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
                    className={`bg-card border rounded-lg p-4 flex items-center justify-between transition-all ${isSaved ? 'border-green-500/30 opacity-60' : 'border-border hover:border-primary/50 cursor-pointer'}`}
                    onClick={() => !isSaved && setSelected(subject)}>
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                      <p className="text-sm font-medium">{subject.name}</p>
                    </div>
                    {isSaved ? (
                      <span className="flex items-center gap-1 font-mono text-xs text-green-500">
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
            <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-6">
              <div>
                <span className="font-mono text-xs text-primary">// FEEDBACK FOR</span>
                <h2 className="font-bold text-sm mt-1">{selected.name}</h2>
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
                  className="w-full px-3 py-2 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={submitFeedback} disabled={saving || ratings.some(r => r === 0)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                  {saving ? 'Submitting...' : 'Submit Feedback'}
                </button>
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 bg-accent font-mono text-xs rounded hover:bg-accent/80">
                  Cancel
                </button>
              </div>

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
