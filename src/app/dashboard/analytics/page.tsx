"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { computeCGPA, computeRisk, type RiskScore, type CGPAResult } from "@/lib/cgpa"
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
  attendancePct: number
  avgMarksPct:   number
}

interface FacultyWorkload {
  profile: Profile
  subjects: Subject[]
  totalCredits: number
}

const RISK_COLORS = {
  SAFE:     { bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-500',  icon: Shield },
  WATCH:    { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-500', icon: Eye },
  AT_RISK:  { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-500', icon: ShieldAlert },
  CRITICAL: { bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-500',    icon: ShieldX },
}

const GRADE_COLORS: Record<string, string> = {
  'O': 'text-green-500', 'A+': 'text-emerald-500', 'A': 'text-blue-500',
  'B+': 'text-cyan-500', 'B': 'text-yellow-500', 'C': 'text-orange-500', 'U': 'text-red-500',
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

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
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
    if (!students.length) return
    setLoading(true)
    setAnalytics([])
    const results: StudentAnalytics[] = []

    for (const student of students) {
      const { data: attData } = await supabase.from('attendance').select('status').eq('student_id', student.id)
      const attTotal   = attData?.length ?? 0
      const attPresent = attData?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length ?? 0
      const attendancePct = attTotal > 0 ? Math.round(attPresent / attTotal * 100) : 0

      const { data: marksData } = await supabase.from('marks').select('marks_obtained, max_marks').eq('student_id', student.id)
      const totalObtained = marksData?.reduce((s, m) => s + Number(m.marks_obtained), 0) ?? 0
      const totalMax      = marksData?.reduce((s, m) => s + Number(m.max_marks), 0) ?? 0
      const avgMarksPct   = totalMax > 0 ? Math.round(totalObtained / totalMax * 100) : 0

      const cgpaResult = await computeCGPA(student.id)
      const risk = await computeRisk(student.id, attendancePct, avgMarksPct, cgpaResult.cgpa)
      results.push({ profile: student, cgpaResult, risk, attendancePct, avgMarksPct })
    }
    setAnalytics(results)
    setLoading(false)
  }

  useEffect(() => {
    if (!isStudent || !profile) return
    const run = async () => {
      setLoading(true)
      const { data: attData } = await supabase.from('attendance').select('status').eq('student_id', profile.id)
      const attTotal   = attData?.length ?? 0
      const attPresent = attData?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length ?? 0
      const attendancePct = attTotal > 0 ? Math.round(attPresent / attTotal * 100) : 0

      const { data: marksData } = await supabase.from('marks').select('marks_obtained, max_marks').eq('student_id', profile.id)
      const totalObtained = marksData?.reduce((s, m) => s + Number(m.marks_obtained), 0) ?? 0
      const totalMax      = marksData?.reduce((s, m) => s + Number(m.max_marks), 0) ?? 0
      const avgMarksPct   = totalMax > 0 ? Math.round(totalObtained / totalMax * 100) : 0

      const cgpaResult = await computeCGPA(profile.id)
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
      'CGPA': a.cgpaResult.cgpa.toFixed(2),
      'Total Credits Earned': a.cgpaResult.totalCredits,
      'Attendance %': `${a.attendancePct}%`,
      'Risk Classification': a.risk.riskLevel
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
    if (sortBy === 'attendance') return b.attendancePct - a.attendancePct
    if (sortBy === 'risk')       return b.risk.riskScore - a.risk.riskScore
    return a.profile.full_name.localeCompare(b.profile.full_name)
  })

  const riskCounts = analytics.reduce((acc, a) => {
    acc[a.risk.riskLevel] = (acc[a.risk.riskLevel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const avgCGPA = analytics.length ? (analytics.reduce((s, a) => s + a.cgpaResult.cgpa, 0) / analytics.length).toFixed(2) : '—'
  const avgAtt = analytics.length ? Math.round(analytics.reduce((s, a) => s + a.attendancePct, 0) / analytics.length) : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: ANALYTICS & REPORTS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Department Reports</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          {isStudent ? 'Your CGPA, grade history and risk assessment' : 'Performance, Faculty Workload, and Accreditation Exports'}
        </p>
      </div>

      {/* ── HOD / FACULTY TABS ── */}
      {(isHOD || isFaculty) && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-4">
          <button onClick={() => setActiveTab('STUDENTS')} className={`flex items-center gap-2 font-mono text-xs px-4 py-2 rounded transition-all ${activeTab === 'STUDENTS' ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-muted-foreground hover:bg-accent'}`}>
            <Users className="w-4 h-4" /> Student Performance
          </button>
          <button onClick={() => setActiveTab('WORKLOAD')} className={`flex items-center gap-2 font-mono text-xs px-4 py-2 rounded transition-all ${activeTab === 'WORKLOAD' ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-muted-foreground hover:bg-accent'}`}>
            <Briefcase className="w-4 h-4" /> Faculty Workload
          </button>
          {isHOD && (
            <button onClick={() => setActiveTab('NAAC')} className={`flex items-center gap-2 font-mono text-xs px-4 py-2 rounded transition-all ${activeTab === 'NAAC' ? 'bg-green-600 text-white' : 'bg-accent/50 text-muted-foreground hover:bg-accent'}`}>
              <Download className="w-4 h-4" /> NAAC / NBA Export
            </button>
          )}
        </div>
      )}

      {/* ── TAB: NAAC EXPORT (HOD ONLY) ── */}
      {isHOD && activeTab === 'NAAC' && (
        <div className="bg-card border border-border rounded-lg p-8 space-y-6 text-center max-w-2xl mx-auto mt-8">
          <Shield className="w-12 h-12 text-green-500 mx-auto" />
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
            className="w-full flex items-center justify-center gap-2 h-12 bg-green-600 text-white font-mono text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Download Complete NAAC Report
          </button>
          {analytics.length === 0 && <p className="font-mono text-xs text-red-500">Run the Student Performance analytics for a section first to populate data.</p>}
        </div>
      )}

      {/* ── TAB: FACULTY WORKLOAD ── */}
      {(isHOD || isFaculty) && activeTab === 'WORKLOAD' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="font-mono text-xs text-muted-foreground mb-1">Total Faculty</p>
              <p className="text-2xl font-bold">{workload.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="font-mono text-xs text-muted-foreground mb-1">Overloaded (&gt; 16 cr)</p>
              <p className="text-2xl font-bold text-orange-500">{workload.filter(w => w.totalCredits > 16).length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="font-mono text-xs text-muted-foreground mb-1">Avg Credits / Faculty</p>
              <p className="text-2xl font-bold">{workload.length ? (workload.reduce((s, w) => s + w.totalCredits, 0) / workload.length).toFixed(1) : 0}</p>
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
                        <span className="font-mono text-[10px] text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded">OVERLOADED</span>
                      ) : w.totalCredits < 12 ? (
                        <span className="font-mono text-[10px] text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded">UNDERLOADED</span>
                      ) : (
                        <span className="font-mono text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded">OPTIMAL</span>
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
                  { label: 'CGPA',        value: myData.cgpaResult.cgpa.toFixed(2), sub: `× 10 = ${(myData.cgpaResult.cgpa * 10).toFixed(1)}%` },
                  { label: 'Attendance',  value: `${myData.attendancePct}%`, sub: myData.attendancePct >= 75 ? 'Eligible' : 'Below 75%' },
                  { label: 'Avg Marks',   value: `${myData.avgMarksPct}%`, sub: 'All subjects' },
                  { label: 'Risk Level',  value: myData.risk.riskLevel, sub: `Score: ${myData.risk.riskScore}/100` },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-4">
                    <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="font-mono text-xs text-muted-foreground mt-1">{sub}</p>
                  </div>
                ))}
              </div>
              
              {myData.risk.flags.length > 0 && (
                <div className={`rounded-lg border p-4 space-y-2 ${RISK_COLORS[myData.risk.riskLevel].bg} ${RISK_COLORS[myData.risk.riskLevel].border}`}>
                  <p className={`font-mono text-xs font-bold ${RISK_COLORS[myData.risk.riskLevel].text}`}>⚠ Risk Flags</p>
                  {myData.risk.flags.map((f, i) => (
                    <p key={i} className="font-mono text-xs text-muted-foreground">• {f}</p>
                  ))}
                </div>
              )}

              {myData.cgpaResult.semesters.map(sem => (
                <div key={sem.semester} className="bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <span className="font-mono text-xs text-primary">// SEMESTER {sem.semester}</span>
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
                    className="h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={runAnalytics} disabled={loading || !students.length}
                  className="flex items-center gap-2 h-10 px-4 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
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
                    { label: 'Avg Attendance', value: `${avgAtt}%`, color: avgAtt >= 75 ? 'text-green-500' : 'text-red-500' },
                    { label: 'At Risk',     value: (riskCounts['AT_RISK']??0) + (riskCounts['CRITICAL']??0), color: 'text-orange-500' },
                    { label: 'Critical',    value: riskCounts['CRITICAL'] ?? 0, color: 'text-red-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-card border border-border rounded-lg p-4">
                      <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {analytics.length > 0 && (
                <div className="bg-card border border-border rounded-lg">
                  <div className="px-6 py-4 border-b border-border">
                    <span className="font-mono text-xs text-primary">// STUDENT ANALYTICS — {section}</span>
                    <h2 className="font-bold text-sm mt-1">{analytics.length} students computed</h2>
                  </div>
                  <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                    {sorted.map((a, idx) => {
                      const { bg, border, text, icon: Icon } = RISK_COLORS[a.risk.riskLevel]
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
                                <p className="font-mono text-sm font-bold">{a.cgpaResult.cgpa.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="font-mono text-xs text-muted-foreground">Att%</p>
                                <p className={`font-mono text-sm font-bold ${a.attendancePct >= 75 ? 'text-green-500' : 'text-red-500'}`}>
                                  {a.attendancePct}%
                                </p>
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded border font-mono text-xs ${bg} ${border} ${text}`}>
                                <Icon className="w-3 h-3" />
                                {a.risk.riskLevel}
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
