"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { Star, CheckCircle2, Loader2, BarChart3, Users, Plus, X } from "lucide-react"
import { toast, reportResult } from "@/components/toaster"

const APPRAISAL_QUESTIONS = [
  { id: 'teaching',    label: 'Teaching Quality',           sub: 'Clarity of explanation, pace, use of examples' },
  { id: 'content',     label: 'Course Content Coverage',    sub: 'Syllabus completion, depth of topics covered' },
  { id: 'practical',   label: 'Practical / Lab Sessions',   sub: 'Lab guidance, hands-on learning quality' },
  { id: 'punctuality', label: 'Punctuality & Availability', sub: 'On-time classes, accessible outside hours' },
  { id: 'overall',     label: 'Overall Rating',             sub: 'General satisfaction with the faculty' },
]

const SURVEY_QUESTIONS = [
  { id: 'understanding',  label: 'Understanding of topics taught this month' },
  { id: 'engagement',     label: 'Student engagement in class' },
  { id: 'difficulty',     label: 'Difficulty level of content' },
  { id: 'support',        label: 'Support received when stuck' },
  { id: 'recommend',      label: 'Would recommend this teaching style' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export default function AppraisalPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [tab, setTab]             = useState<'appraisal'|'survey'|'results'>('appraisal')
  const [faculty, setFaculty]     = useState<any[]>([])
  const [selectedFaculty, setSelectedFaculty] = useState<string>('')
  const [appraisalRatings, setAppraisalRatings] = useState<Record<string, number>>({})
  const [appraisalComment, setAppraisalComment] = useState('')
  const [surveyRatings, setSurveyRatings] = useState<Record<string, number>>({})
  const [surveyMonth, setSurveyMonth] = useState(MONTHS[new Date().getMonth()])
  const [surveySection, setSurveySection] = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [results, setResults]     = useState<any[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()])

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isStudent = authUser?.type === 'student'
  const isFaculty = authUser?.type === 'staff' && !isHOD
  const year      = new Date().getFullYear()

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data)
          if ((data as any).section) setSurveySection((data as any).section)
        }
      })
    // Students appraise the faculty who teach their section; everyone else sees all faculty.
    ;(async () => {
      const { data: all } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'PROFESSOR').eq('is_active', true).order('full_name')
      let list = all ?? []
      if (au.type === 'student' && (au.data as { section?: string }).section) {
        const { data: subs } = await supabase.from('subjects').select('faculty_id').eq('section', (au.data as { section?: string }).section!).not('faculty_id', 'is', null)
        const mine = new Set((subs ?? []).map(s => s.faculty_id))
        if (mine.size) list = list.filter(f => mine.has(f.id))
      }
      setFaculty(list)
    })()
  }, [router])

  useEffect(() => { if (isFaculty) setTab('results') }, [isFaculty])

  const [mySummary, setMySummary] = useState<{ reviews: number; by_question: Record<string, number>; comments: string[] } | null>(null)
  useEffect(() => {
    if (tab !== 'results' || !isFaculty) return
    supabase.rpc('my_appraisal_summary', { p_year: year }).then(({ data, error }) => {
      if (error) toast.error(error.message)
      else setMySummary(data)
    })
  }, [tab, isFaculty, year])

  const submitAppraisal = async () => {
    if (!profile || !selectedFaculty || Object.keys(appraisalRatings).length < APPRAISAL_QUESTIONS.length) return
    setSaving(true)
    const avgRating = Object.values(appraisalRatings).reduce((a, b) => a + b, 0) / APPRAISAL_QUESTIONS.length

    const apTitle = `APPRAISAL:${selectedFaculty}:${profile.id}:${year}`
    const { data: prior } = await supabase.from('announcements').select('id').eq('title', apTitle).eq('created_by', profile.id).maybeSingle()
    if (prior) {
      setSaving(false)
      toast.info(`You have already appraised ${faculty.find(f => f.id === selectedFaculty)?.full_name ?? 'this faculty member'} for ${year}. Each student can appraise a faculty member once a year.`)
      return
    }
    const apBody = {
        type: 'faculty_appraisal',
        faculty_id: selectedFaculty,
        reviewer_id: profile.id,
        reviewer_type: isStudent ? 'student' : 'faculty',
        year,
        ratings: appraisalRatings,
        avg_rating: avgRating,
        comment: appraisalComment,
    }
    const { error } = await supabase.from('announcements').insert({ title: apTitle, body: JSON.stringify(apBody), audience: 'APPRAISAL:faculty', is_urgent: false, created_by: profile.id, department_id: '00000000-0000-0000-0000-000000000001' })

    setSaving(false)
    if (!reportResult(error, 'Appraisal submitted anonymously. Thank you!')) return
    setSaved(true)
    setAppraisalRatings({})
    setAppraisalComment('')
    setSelectedFaculty('')
    setTimeout(() => setSaved(false), 4000)
  }

  const submitSurvey = async () => {
    if (!profile || Object.keys(surveyRatings).length < SURVEY_QUESTIONS.length) return
    setSaving(true)
    const avgRating = Object.values(surveyRatings).reduce((a, b) => a + b, 0) / SURVEY_QUESTIONS.length

    const svTitle = `SURVEY:${profile.id}:${surveyMonth}:${year}`
    const { data: priorSv } = await supabase.from('announcements').select('id').eq('title', svTitle).eq('created_by', profile.id).maybeSingle()
    if (priorSv) {
      setSaving(false)
      toast.info(`You have already submitted the ${surveyMonth} ${year} survey.`)
      return
    }
    const svBody = JSON.stringify({
        type: 'monthly_survey',
        student_id: profile.id,
        section: surveySection || profile.section,
        month: surveyMonth,
        year,
        ratings: surveyRatings,
        avg_rating: avgRating,
      })
    const { error } = await supabase.from('announcements').insert({ title: svTitle, body: svBody, audience: 'SURVEY:monthly', is_urgent: false, created_by: profile.id, department_id: '00000000-0000-0000-0000-000000000001' })

    setSaving(false)
    if (!reportResult(error, 'Survey submitted. Thank you!')) return
    setSaved(true)
    setSurveyRatings({})
    setTimeout(() => setSaved(false), 4000)
  }

  const loadResults = async () => {
    setLoadingResults(true)

    // Load appraisals
    const { data: appraisals } = await supabase.from('announcements').select('*')
      .like('audience', 'APPRAISAL:%')
    const { data: surveys } = await supabase.from('announcements').select('*')
      .like('audience', 'SURVEY:%')

    const facultyResults = faculty.map(f => {
      const reviews = (appraisals ?? [])
        .map(a => { try { return JSON.parse(a.body) } catch { return null } })
        .filter(r => r?.faculty_id === f.id && r?.year === year)

      const avgByQuestion: Record<string, number> = {}
      APPRAISAL_QUESTIONS.forEach(q => {
        const vals = reviews.map(r => r.ratings?.[q.id]).filter(Boolean)
        avgByQuestion[q.id] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
      })
      const overall = Object.values(avgByQuestion).filter(v => v > 0)
      const avg = overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : 0

      return { ...f, reviews: reviews.length, avgByQuestion, avg: Math.round(avg * 10) / 10 }
    })

    // Monthly survey results
    const surveyResults = MONTHS.map(month => {
      const monthSurveys = (surveys ?? [])
        .map(a => { try { return JSON.parse(a.body) } catch { return null } })
        .filter(r => r?.month === month && r?.year === year)

      const avgByQ: Record<string, number> = {}
      SURVEY_QUESTIONS.forEach(q => {
        const vals = monthSurveys.map((r: any) => r?.ratings?.[q.id]).filter(Boolean)
        avgByQ[q.id] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
      })
      const overall2 = Object.values(avgByQ).filter(v => v > 0)
      const avg2 = overall2.length ? overall2.reduce((a, b) => a + b, 0) / overall2.length : 0

      return { month, responses: monthSurveys.length, avgByQ, avg: Math.round(avg2 * 10) / 10 }
    })

    setResults([{ type: 'faculty', data: facultyResults }, { type: 'survey', data: surveyResults }])
    setLoadingResults(false)
  }

  useEffect(() => { if (tab === 'results' && isHOD && faculty.length) loadResults() }, [tab, faculty, isHOD])

  const StarRating = ({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm'|'md' }) => (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(star => (
        <button key={star} type="button" onClick={() => onChange?.(star)}
          disabled={!onChange}
          className={`transition-all ${size === 'sm' ? 'text-base' : 'text-2xl'} ${star <= value ? 'text-amber-600' : 'text-muted-foreground/20 hover:text-amber-600/50'} ${!onChange ? 'cursor-default' : 'cursor-pointer'}`}>
          ★
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">APPRAISAL & SURVEY</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Faculty Appraisal & Monthly Survey</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          Faculty appraisal by students · Monthly teaching quality survey
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'appraisal', label: 'Faculty Appraisal', show: isStudent || isHOD },
          { key: 'survey',    label: 'Monthly Survey',    show: isStudent },
          { key: 'results',   label: 'Results & Analytics', show: isHOD || isFaculty },
        ].filter(t => t.show).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2.5 font-mono text-xs border-b-2 transition-all ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── FACULTY APPRAISAL ── */}
      {tab === 'appraisal' && (isStudent || isHOD) && (
        <div className="space-y-4">
          {saved && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <p className="font-mono text-sm text-green-700">Appraisal submitted.</p>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Select Faculty to Appraise</label>
              <select value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                <option value="">Choose faculty member...</option>
                {faculty.map(f => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </div>

            {selectedFaculty && (
              <>
                <div className="space-y-4">
                  {APPRAISAL_QUESTIONS.map(q => (
                    <div key={q.id} className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{q.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{q.sub}</p>
                      </div>
                      <StarRating value={appraisalRatings[q.id] ?? 0}
                        onChange={v => setAppraisalRatings(prev => ({...prev, [q.id]: v}))} />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Additional Comments (optional)</label>
                  <textarea value={appraisalComment} onChange={e => setAppraisalComment(e.target.value)}
                    placeholder="Any suggestions or feedback..."
                    rows={3}
                    className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
                </div>
                <button onClick={submitAppraisal}
                  disabled={saving || Object.keys(appraisalRatings).length < APPRAISAL_QUESTIONS.length}
                  className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                  {saving ? 'Submitting...' : 'Submit Appraisal'}
                </button>
                {Object.keys(appraisalRatings).length < APPRAISAL_QUESTIONS.length && (
                  <p className="font-mono text-xs text-muted-foreground">
                    Please rate all {APPRAISAL_QUESTIONS.length} questions ({Object.keys(appraisalRatings).length}/{APPRAISAL_QUESTIONS.length} done)
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MONTHLY SURVEY ── */}
      {tab === 'survey' && isStudent && (
        <div className="space-y-4">
          {saved && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <p className="font-mono text-sm text-green-700">Monthly survey submitted for {surveyMonth}!</p>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow">MONTHLY TEACHING QUALITY SURVEY</span>
                <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
                  Rate your overall learning experience for {surveyMonth} {year}
                </p>
              </div>
              <select value={surveyMonth} onChange={e => setSurveyMonth(e.target.value)}
                className="h-9 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="space-y-4">
              {SURVEY_QUESTIONS.map(q => (
                <div key={q.id} className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
                  <p className="text-sm flex-1">{q.label}</p>
                  <StarRating value={surveyRatings[q.id] ?? 0}
                    onChange={v => setSurveyRatings(prev => ({...prev, [q.id]: v}))} />
                </div>
              ))}
            </div>

            <button onClick={submitSurvey}
              disabled={saving || Object.keys(surveyRatings).length < SURVEY_QUESTIONS.length}
              className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {saving ? 'Submitting...' : `Submit Survey for ${surveyMonth}`}
            </button>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {tab === 'results' && (isHOD || isFaculty) && (
        <div className="space-y-6">
          {loadingResults ? (
            <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
              <p className="font-mono text-sm text-muted-foreground">Loading results...</p>
            </div>
          ) : (
            <>
              {/* Faculty appraisal results */}
              {isHOD && results[0]?.data && (
                <div className="bg-card border border-border rounded-lg">
                  <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
                    <span className="eyebrow">FACULTY APPRAISAL RESULTS — {year}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {results[0].data.map((f: any) => (
                      <div key={f.id} className="px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-bold text-sm">{f.full_name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{f.reviews} review(s)</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-amber-700">{f.avg > 0 ? f.avg.toFixed(1) : '—'}</p>
                            <p className="font-mono text-xs text-muted-foreground">/ 5.0</p>
                          </div>
                        </div>
                        {f.reviews > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {APPRAISAL_QUESTIONS.map(q => (
                              <div key={q.id} className="text-center">
                                <p className="font-mono text-xs text-muted-foreground truncate">{q.label.split(' ')[0]}</p>
                                <p className="font-mono text-sm font-bold">{f.avgByQuestion[q.id]?.toFixed(1) ?? '—'}</p>
                                <StarRating value={Math.round(f.avgByQuestion[q.id] ?? 0)} size="sm" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Faculty sees their own (anonymous) results */}
              {isFaculty && (
                <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                  <span className="eyebrow">YOUR APPRAISAL RESULTS — {year}</span>
                  {!mySummary ? <p className="font-mono text-sm text-muted-foreground">Loading…</p>
                    : mySummary.reviews === 0 ? <p className="font-mono text-sm text-muted-foreground">No appraisals received yet</p> : (() => {
                    const vals = Object.values(mySummary.by_question).map(Number)
                    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                    return (
                      <>
                        <div className="flex items-center gap-4">
                          <p className="text-4xl font-bold text-amber-700">{avg.toFixed(1)}</p>
                          <div>
                            <StarRating value={Math.round(avg)} />
                            <p className="text-[13.5px] text-muted-foreground mt-1.5">{mySummary.reviews} anonymous student review{mySummary.reviews === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {APPRAISAL_QUESTIONS.map(q => (
                            <div key={q.id} className="flex items-center gap-3">
                              <p className="font-mono text-xs w-40 text-muted-foreground">{q.label}</p>
                              <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                                <div className="h-full bg-amber-600 rounded-full" style={{ width: `${((Number(mySummary.by_question[q.id]) || 0) / 5) * 100}%` }} />
                              </div>
                              <p className="font-mono text-xs w-8 text-right">{Number(mySummary.by_question[q.id] ?? 0).toFixed(1)}</p>
                            </div>
                          ))}
                        </div>
                        {mySummary.comments.length > 0 ? (
                          <div className="pt-2 space-y-2">
                            <p className="eyebrow">WHAT STUDENTS SAID</p>
                            {mySummary.comments.map((c, i) => <p key={i} className="text-[13.5px] text-foreground bg-licet-paper border border-border rounded-md px-3 py-2">“{c}”</p>)}
                          </div>
                        ) : mySummary.reviews < 3 && <p className="text-[12px] text-muted-foreground">Written comments appear once at least 3 students have responded, so no one can be identified.</p>}
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Monthly survey results */}
              {isHOD && results[1]?.data && (
                <div className="bg-card border border-border rounded-lg">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <span className="eyebrow">MONTHLY SURVEY RESULTS — {year}</span>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                      className="h-8 px-2 bg-background border border-border rounded font-mono text-xs focus:border-primary focus:outline-none">
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const monthData = results[1].data.find((d: any) => d.month === selectedMonth)
                    if (!monthData || monthData.responses === 0) return (
                      <div className="px-6 py-8 text-center font-mono text-sm text-muted-foreground">
                        No survey responses for {selectedMonth}
                      </div>
                    )
                    return (
                      <div className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                          <p className="text-3xl font-bold text-primary">{monthData.avg.toFixed(1)}</p>
                          <div>
                            <StarRating value={Math.round(monthData.avg)} />
                            <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">{monthData.responses} response(s)</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {SURVEY_QUESTIONS.map(q => (
                            <div key={q.id} className="flex items-center gap-3">
                              <p className="font-mono text-xs w-48 text-muted-foreground">{q.label}</p>
                              <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full"
                                  style={{ width: `${(monthData.avgByQ[q.id] / 5) * 100}%` }} />
                              </div>
                              <p className="font-mono text-xs w-8 text-right">{monthData.avgByQ[q.id]?.toFixed(1) || '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
