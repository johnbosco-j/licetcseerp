"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import { attendanceStatus } from "@/lib/regulations"
import { computeRisk, loadStudentStats, type RiskScore, type CGPAResult } from "@/lib/cgpa"
import { semesterStart } from "@/lib/dashboard"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import {
  BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Users, Activity, Loader2, ChevronDown, ChevronUp,
  Shield, ShieldAlert, ShieldX, Eye, Download, BookOpen, Briefcase
} from "lucide-react"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']

interface StudentAnalytics {
  profile:       Profile
  cgpaResult:    CGPAResult
  risk:          RiskScore
  attendancePct: number | null
  avgMarksPct:   number | null
}

interface FacultyWorkload {
  profile: Profile
  subjects: Subject[]
  totalCredits: number
}

const RISK_COLORS = {
  SAFE:     { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-800', icon: Shield,      label: 'Safe' },
  WATCH:    { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-800', icon: Eye,         label: 'Watch' },
  AT_RISK:  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', icon: ShieldAlert, label: 'At risk' },
  CRITICAL: { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-800',   icon: ShieldX,     label: 'Critical' },
}
const NO_DATA = { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', icon: Eye, label: 'No data' }
const riskStyle = (r: RiskScore) => r.hasData ? RISK_COLORS[r.riskLevel] : NO_DATA
const ATT_TONE = { good: 'text-green-700', warn: 'text-amber-700', bad: 'text-red-700' }
const attTone = (pct: number | null) => pct === null ? 'text-muted-foreground' : ATT_TONE[attendanceStatus(pct).tone]
const pctText = (pct: number | null) => pct === null ? '—' : `${pct}%`

const GRADE_COLORS: Record<string, string> = {
  'O': 'text-green-700', 'A+': 'text-emerald-700', 'A': 'text-blue-700',
  'B+': 'text-cyan-700', 'B': 'text-amber-700', 'C': 'text-orange-700', 'U': 'text-red-700',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'WORKLOAD' | 'NAAC'>('STUDENTS')
  
  // Student Analytics State
  const [section, setSection]     = useState('II CSE-A')
  const [students, setStudents]   = useState<Profile[]>([])
  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([])
  const [loading, setLoading]     = useState(false)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [myData, setMyData]       = useState<StudentAnalytics | null>(null)
  const [sortBy, setSortBy]       = useState<'name'|'cgpa'|'attendance'|'risk'>('risk')

  // Faculty Workload State
  const [workload, setWorkload]   = useState<FacultyWorkload[]>([])
  const [loadingWorkload, setLoadingWorkload] = useState(false)

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  // Load students when section changes
  useEffect(() => {
    if (isStudent) return
    supabase.from('profiles').select('*')
      .eq('role', 'STUDENT').eq('section', section).order('full_name')
      .then(({ data }) => { if (data) setStudents(data) })
  }, [section, isStudent])

  // Load Faculty Workload
  useEffect(() => {
    if (!isHOD && !isFaculty) return
    if (activeTab !== 'WORKLOAD' && activeTab !== 'NAAC') return

    const loadWorkloadData = async () => {
      setLoadingWorkload(true)
      const { data: profs } = await supabase.from('profiles').select('*').in('role', ['PROFESSOR', 'HOD'])
      const { data: subjs } = await supabase.from('subjects').select('*')
      const { data: marks } = await supabase.from('marks').select('subject_id, faculty_id')

      if (profs && subjs && marks) {
        const assignments: Record<string, string> = {}
        marks.forEach(m => { assignments[m.subject_id] = m.faculty_id })

        const wl = profs.map(p => {
          const assignedSubjects = subjs.filter(s => assignments[s.id] === p.id)
          const totalCredits = assignedSubjects.reduce((sum, s) => sum + Number(s.credits), 0)
          return { profile: p, subjects: assignedSubjects, totalCredits }
        }).sort((a, b) => b.totalCredits - a.totalCredits)
        
        setWorkload(wl)
      }
      setLoadingWorkload(false)
    }
    loadWorkloadData()
  }, [isHOD, isFaculty, activeTab])

  const runAnalytics = async () => {
    setLoading(true)
    setAnalytics([])
    const results: StudentAnalytics[] = []
    try {
      // Fetch the selected section here so a quick section change can't run on the previous list.
      const { data: students, error } = await supabase.from('profiles').select('*')
        .eq('role', 'STUDENT').eq('section', section).eq('is_active', true).order('full_name')
      if (error) throw error
      if (!students?.length) { setLoading(false); return }
      setStudents(students)
      const stats = await loadStudentStats(students.map(s => s.id), semesterStart())
      for (const student of students) {
        const st = stats[student.id]
        const risk = await computeRisk(student.id, st.attendancePct, st.avgMarksPct, st.cgpa.cgpa)
        results.push({ profile: student, cgpaResult: st.cgpa, risk, attendancePct: st.attendancePct, avgMarksPct: st.avgMarksPct })
      }
    } catch (e) {
      console.error('Analytics failed', e)
    }
    setAnalytics(results)
    setLoading(false)
  }

  useEffect(() => {
    if (!isStudent || !profile) return
    const run = async () => {
      setLoading(true)
      const st = (await loadStudentStats([profile.id], semesterStart()))[profile.id]
      const { attendancePct, avgMarksPct } = st
      const cgpaResult = st.cgpa
      const risk = await computeRisk(profile.id, attendancePct, avgMarksPct, cgpaResult.cgpa)
      setMyData({ profile, cgpaResult, risk, attendancePct, avgMarksPct })
      setLoading(false)
    }
    run()
  }, [isStudent, profile])

  const exportNAAC = () => {
    // 1. Student Performance Sheet (Criterion 2.6)
    const ws_students = XLSX.utils.json_to_sheet(analytics.map(a => ({
      'Register Number': a.profile.email.split('@')[0].toUpperCase(),
      'Student Name': a.profile.full_name,
      'Section': a.profile.section,
      'CGPA': a.cgpaResult.totalCredits ? a.cgpaResult.cgpa.toFixed(2) : 'No grades yet',
      'Total Credits Earned': a.cgpaResult.totalCredits,
      'Attendance %': a.attendancePct ?? 'No records',
      'Risk Classification': riskStyle(a.risk).label
    })))

    // 2. Faculty Workload Sheet (Criterion 2.4)
    const ws_workload = XLSX.utils.json_to_sheet(workload.map(fw => ({
      'Faculty ID': fw.profile.employee_id || '—',
      'Name of the Full-time Teacher': fw.profile.full_name,
      'Designation': fw.profile.role,
      'Courses Handled (Codes)': fw.subjects.map(s => s.code).join(', '),
      'Total Teaching Credits': fw.totalCredits,
      'Workload Status': fw.totalCredits > 16 ? 'Overloaded' : fw.totalCredits < 12 ? 'Underloaded' : 'Optimal'
    })))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws_students, '2.6 Student Performance')
    XLSX.utils.book_append_sheet(wb, ws_workload, '2.4 Teacher Profile')

    ws_students['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 20 }]
    ws_workload['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 22 }, { wch: 18 }]

    XLSX.writeFile(wb, `LICET_CSE_NAAC_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const sorted = [...analytics].sort((a, b) => {
    if (sortBy === 'cgpa')       return b.cgpaResult.cgpa - a.cgpaResult.cgpa
    if (sortBy === 'attendance') return (b.attendancePct ?? -1) - (a.attendancePct ?? -1)
    if (sortBy === 'risk')       return b.risk.riskScore - a.risk.riskScore
    return a.profile.full_name.localeCompare(b.profile.full_name)
  })

  const riskCounts = analytics.reduce((acc, a) => {
    if (a.risk.hasData) acc[a.risk.riskLevel] = (acc[a.risk.riskLevel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const graded = analytics.filter(a => a.cgpaResult.totalCredits > 0)
  const avgCGPA = graded.length ? (graded.reduce((s, a) => s + a.cgpaResult.cgpa, 0) / graded.length).toFixed(2) : '—'
  const withAtt = analytics.filter(a => a.attendancePct !== null)
  const avgAtt = withAtt.length ? Math.round(withAtt.reduce((s, a) => s + (a.attendancePct ?? 0), 0) / withAtt.length) : null
  const noData = analytics.filter(a => !a.risk.hasData).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">ANALYTICS & REPORTS</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Department Reports</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          {isStudent ? 'Your CGPA, grade history and risk assessment' : 'Performance, Faculty Workload, and Accreditation Exports'}
        </p>
      </div>

      {/* ── HOD / FACULTY TABS ── */}
      {(isHOD || isFaculty) && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-4">
          <button onClick={() => setActiveTab('STUDENTS')} className={`flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-full transition-all ${activeTab === 'STUDENTS' ? 'bg-primary text-primary-foreground' : 'bg-white border border-border text-licet-indigo hover:bg-licet-cream/60'}`}>
            <Users className="w-4 h-4" /> Student Performance
          </button>
          <button onClick={() => setActiveTab('WORKLOAD')} className={`flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-full transition-all ${activeTab === 'WORKLOAD' ? 'bg-primary text-primary-foreground' : 'bg-white border border-border text-licet-indigo hover:bg-licet-cream/60'}`}>
            <Briefcase className="w-4 h-4" /> Faculty Workload
          </button>
          {isHOD && (
            <button onClick={() => setActiveTab('NAAC')} className={`flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-full transition-all ${activeTab === 'NAAC' ? 'bg-primary text-primary-foreground' : 'bg-white border border-border text-licet-indigo hover:bg-licet-cream/60'}`}>
              <Download className="w-4 h-4" /> NAAC / NBA Export
            </button>
          )}
        </div>
      )}

      {/* ── TAB: NAAC EXPORT (HOD ONLY) ── */}
      {isHOD && activeTab === 'NAAC' && (
        <div className="bg-card border border-border rounded-lg p-8 space-y-6 text-center max-w-2xl mx-auto mt-8">
          <Shield className="w-12 h-12 text-green-700 mx-auto" />
          <div>
            <h2 className="text-xl font-bold">Accreditation Readiness Report</h2>
            <p className="text-sm text-muted-foreground mt-2">Generate a pre-formatted Excel workbook containing data mapped for NAAC Criterion 2 (Teaching-Learning and Evaluation).</p>
          </div>
          <div className="bg-accent/30 rounded p-4 text-left font-mono text-xs space-y-2">
            <p className="text-primary font-bold">Included Sheets:</p>
            <p>✓ 2.4 - Teacher Profile and Quality (Workload mappings)</p>
            <p>✓ 2.6 - Student Performance and Learning Outcomes (CGPA/Risk)</p>
          </div>
          <button onClick={exportNAAC} disabled={analytics.length === 0}
            className="w-full flex items-center justify-center gap-2 h-12 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Download Complete NAAC Report
          </button>
          {analytics.length === 0 && <p className="font-mono text-xs text-red-700">Run the Student Performance analytics for a section first to populate data.</p>}
        </div>
      )}

      {/* ── TAB: FACULTY WORKLOAD ── */}
      {(isHOD || isFaculty) && activeTab === 'WORKLOAD' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Total Faculty</p>
              <p className="font-display text-[28px] font-bold tracking-[-0.03em] leading-none text-licet-indigo">{workload.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Overloaded (&gt; 16 cr)</p>
              <p className="text-2xl font-bold text-orange-700">{workload.filter(w => w.totalCredits > 16).length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Avg Credits / Faculty</p>
              <p className="font-display text-[28px] font-bold tracking-[-0.03em] leading-none text-licet-indigo">{workload.length ? (workload.reduce((s, w) => s + w.totalCredits, 0) / workload.length).toFixed(1) : 0}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Faculty Name</th>
                  <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Assigned Subjects</th>
                  <th className="p-4 font-mono text-xs text-muted-foreground font-normal text-center">Total Credits</th>
                  <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingWorkload ? (
                  <tr><td colSpan={4} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                ) : workload.map(w => (
                  <tr key={w.profile.id} className="hover:bg-accent/20">
                    <td className="p-4">
                      <p className="text-sm font-medium">{w.profile.full_name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{w.profile.employee_id || 'No ID'}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {w.subjects.length > 0 ? w.subjects.map(s => (
                          <span key={s.id} className="font-mono text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20" title={s.name}>
                            {s.code} ({s.section?.split(' ')[0] ?? '—'})
                          </span>
                        )) : <span className="font-mono text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono text-sm font-bold">{w.totalCredits}</td>
                    <td className="p-4">
                      {w.totalCredits > 16 ? (
                        <span className="font-mono text-[10px] text-orange-700 bg-orange-50 border border-orange-200 px-2 py-1 rounded">OVERLOADED</span>
                      ) : w.totalCredits < 12 ? (
                        <span className="font-mono text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">UNDERLOADED</span>
                      ) : (
                        <span className="font-mono text-[10px] text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">OPTIMAL</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: STUDENT PERFORMANCE ── */}
      {(!authUser || isStudent || activeTab === 'STUDENTS') && (
        <>
          {/* STUDENT INDIVIDUAL VIEW */}
          {isStudent && myData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'CGPA',        value: myData.cgpaResult.totalCredits ? myData.cgpaResult.cgpa.toFixed(2) : '—', sub: myData.cgpaResult.totalCredits ? `${myData.cgpaResult.totalCredits} credits earned` : 'No grades published yet' },
                  { label: 'Attendance',  value: pctText(myData.attendancePct), sub: myData.attendancePct === null ? 'No attendance recorded yet' : `${attendanceStatus(myData.attendancePct).code} · ${attendanceStatus(myData.attendancePct).label}` },
                  { label: 'Avg Marks',   value: pctText(myData.avgMarksPct), sub: myData.avgMarksPct === null ? 'No marks entered yet' : 'All subjects' },
                  { label: 'Risk Level',  value: riskStyle(myData.risk).label, sub: myData.risk.hasData ? `Score: ${myData.risk.riskScore}/100` : 'Nothing recorded yet' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-4">
                    <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">{label}</p>
                    <p className="font-display text-[28px] font-bold tracking-[-0.03em] leading-none text-licet-indigo">{value}</p>
                    <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">{sub}</p>
                  </div>
                ))}
              </div>
              
              {myData.risk.flags.length > 0 && (
                <div className={`rounded-lg border p-4 space-y-2 ${riskStyle(myData.risk).bg} ${riskStyle(myData.risk).border}`}>
                  <p className={`font-mono text-xs font-bold ${riskStyle(myData.risk).text}`}>⚠ Risk Flags</p>
                  {myData.risk.flags.map((f, i) => (
                    <p key={i} className="font-mono text-xs text-muted-foreground">• {f}</p>
                  ))}
                </div>
              )}

              {myData.cgpaResult.semesters.map(sem => (
                <div key={sem.semester} className="bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <span className="eyebrow">SEMESTER {sem.semester}</span>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="font-bold text-sm">GPA: {sem.gpa.toFixed(2)}</span>
                        <span className="font-mono text-xs text-muted-foreground">{sem.credits} credits</span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {sem.results.map(r => (
                      <div key={r.subjectId} className="flex items-center gap-4 px-6 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{r.subjectCode}</p>
                          <p className="text-sm font-medium truncate">{r.subjectName}</p>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="font-mono text-xs text-muted-foreground">Int</p>
                            <p className="font-mono text-xs font-bold">{r.internal}</p>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-muted-foreground">SEE</p>
                            <p className="font-mono text-xs font-bold">{r.semEnd}</p>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-muted-foreground">Total</p>
                            <p className="font-mono text-xs font-bold">{r.total}</p>
                          </div>
                          <div className="w-12 text-right">
                            <p className={`font-mono text-sm font-bold ${GRADE_COLORS[r.grade] ?? ''}`}>{r.grade}</p>
                            <p className="font-mono text-xs text-muted-foreground">{r.credits}cr</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* FACULTY / HOD STUDENT VIEW */}
          {(isHOD || isFaculty) && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Section</label>
                  <select value={section} onChange={e => { setSection(e.target.value); setAnalytics([]) }}
                    className="h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={runAnalytics} disabled={loading || !students.length}
                  className="flex items-center gap-2 h-10 px-4 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50 transition-colors">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                  {loading ? `Computing ${analytics.length}/${students.length}...` : 'Run Analytics'}
                </button>
                {analytics.length > 0 && (
                  <div className="flex gap-2">
                    {(['name','cgpa','attendance','risk'] as const).map(s => (
                      <button key={s} onClick={() => setSortBy(s)}
                        className={`font-mono text-xs px-3 h-10 rounded border transition-all ${sortBy === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                        Sort: {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {analytics.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Avg CGPA',    value: avgCGPA, color: 'text-foreground' },
                    { label: 'Avg Attendance', value: pctText(avgAtt), color: attTone(avgAtt) },
                    { label: 'At Risk',     value: (riskCounts['AT_RISK']??0) + (riskCounts['CRITICAL']??0), color: 'text-orange-700' },
                    { label: 'Critical',    value: riskCounts['CRITICAL'] ?? 0, color: 'text-red-700' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-card border border-border rounded-lg p-4">
                      <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">{label}</p>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {analytics.length > 0 && (
                <div className="bg-card border border-border rounded-lg">
                  <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
                    <span className="eyebrow">STUDENT ANALYTICS — {section}</span>
                    <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">{analytics.length} students</h2>
                    {noData > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {noData === analytics.length ? 'No attendance or marks have been recorded for this section yet.' : `${noData} with no attendance or marks recorded yet.`}
                      </p>
                    )}
                  </div>
                  <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                    {sorted.map((a, idx) => {
                      const { bg, border, text, icon: Icon, label } = riskStyle(a.risk)
                      const isExp = expanded === a.profile.id
                      return (
                        <div key={a.profile.id}>
                          <div
                            className="flex items-center gap-4 px-6 py-4 hover:bg-accent/30 cursor-pointer transition-colors"
                            onClick={() => setExpanded(isExp ? null : a.profile.id)}>
                            <span className="font-mono text-xs text-muted-foreground w-6 flex-shrink-0">{idx+1}</span>
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {a.profile.full_name.split(' ').map(n => n[0]).slice(0,2).join('')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{a.profile.full_name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{a.profile.email}</p>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <p className="font-mono text-xs text-muted-foreground">CGPA</p>
                                <p className="font-mono text-sm font-bold">{a.cgpaResult.totalCredits ? a.cgpaResult.cgpa.toFixed(2) : '—'}</p>
                              </div>
                              <div>
                                <p className="font-mono text-xs text-muted-foreground">Att%</p>
                                <p className={`font-mono text-sm font-bold ${attTone(a.attendancePct)}`}>
                                  {pctText(a.attendancePct)}
                                </p>
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded border font-mono text-xs ${bg} ${border} ${text}`}>
                                <Icon className="w-3 h-3" />
                                {label}
                              </div>
                              {isExp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </div>
                          {isExp && (
                            <div className="px-6 pb-4 space-y-3 border-t border-border bg-accent/20">
                              {a.risk.flags.length > 0 && (
                                <div className={`mt-3 rounded p-3 border space-y-1 ${bg} ${border}`}>
                                  <p className={`font-mono text-xs font-bold ${text}`}>Risk Flags</p>
                                  {a.risk.flags.map((f, i) => <p key={i} className="font-mono text-xs text-muted-foreground">• {f}</p>)}
                                </div>
                              )}
                              {a.cgpaResult.semesters.map(sem => (
                                <div key={sem.semester} className="space-y-1">
                                  <p className="font-mono text-xs text-primary mt-2">Sem {sem.semester} — GPA: {sem.gpa.toFixed(2)} ({sem.credits}cr)</p>
                                  {sem.results.map(r => (
                                    <div key={r.subjectId} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                                      <div className="flex-1 min-w-0">
                                        <span className="font-mono text-xs text-muted-foreground">{r.subjectCode} </span>
                                        <span className="font-mono text-xs truncate">{r.subjectName}</span>
                                      </div>
                                      <div className="flex items-center gap-3 font-mono text-xs ml-4">
                                        <span className="text-muted-foreground">Int: {r.internal}</span>
                                        <span className="text-muted-foreground">SEE: {r.semEnd}</span>
                                        <span className="font-bold">{r.total}</span>
                                        <span className={`font-bold w-6 text-right ${GRADE_COLORS[r.grade] ?? ''}`}>{r.grade}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
