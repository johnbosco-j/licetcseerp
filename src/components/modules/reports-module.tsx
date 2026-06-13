"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { computeCGPA } from "@/lib/cgpa"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { BarChart3, Download, Loader2, Users, BookOpen, Award, TrendingUp } from "lucide-react"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export function ReportsModule() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [loading, setLoading]     = useState(false)
  const [reportType, setReportType] = useState<string>('student_performance')
  const [section, setSection]     = useState('II CSE-A')
  const [generated, setGenerated] = useState(false)
  const [stats, setStats]         = useState<any>(null)

  const isHOD = authUser?.type === 'staff' && authUser.data.role === 'HOD'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff') { router.push('/dashboard'); return }
  }, [router])

  const generateReport = async () => {
    setLoading(true)
    setGenerated(false)

    if (reportType === 'student_performance') {
      const { data: students } = await supabase.from('profiles').select('*')
        .eq('role', 'STUDENT').eq('section', section)

      if (!students) { setLoading(false); return }

      const results = []
      for (const s of students) {
        const { data: att } = await supabase.from('attendance').select('status').eq('student_id', s.id)
        const total   = att?.length ?? 0
        const present = att?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length ?? 0
        const attPct  = total > 0 ? Math.round(present / total * 100) : 0

        const cgpa = await computeCGPA(s.id)
        results.push({
          name: s.full_name, email: s.email, section: s.section,
          attendance: attPct, cgpa: cgpa.cgpa.toFixed(2),
          credits: cgpa.totalCredits
        })
      }
      setStats({ type: 'student_performance', section, data: results })
    }

    else if (reportType === 'faculty_workload') {
      const { data: faculty } = await supabase.from('profiles').select('*').eq('role', 'PROFESSOR')
      if (!faculty) { setLoading(false); return }

      const results = []
      for (const f of faculty) {
        const { data: marked } = await supabase.from('attendance')
          .select('subject_id').eq('faculty_id', f.id)
        const { data: marksEntered } = await supabase.from('marks')
          .select('subject_id').eq('faculty_id', f.id)
        const subjects = [...new Set(marked?.map(m => m.subject_id) ?? [])]
        results.push({
          name: f.full_name, email: f.email,
          subjects_handled: subjects.length,
          attendance_sessions: marked?.length ?? 0,
          marks_entries: marksEntered?.length ?? 0,
        })
      }
      setStats({ type: 'faculty_workload', data: results })
    }

    else if (reportType === 'placement_stats') {
      const { data: placements } = await supabase.from('placements')
        .select('*').eq('department_id', '00000000-0000-0000-0000-000000000001')
      setStats({ type: 'placement_stats', data: placements ?? [] })
    }

    else if (reportType === 'naac_data') {
      // NAAC/NBA data aggregation
      const { data: allStudents } = await supabase.from('profiles').select('*').eq('role', 'STUDENT')
      const { data: allFaculty }  = await supabase.from('profiles').select('*').eq('role', 'PROFESSOR')
      const { data: allSubjects } = await supabase.from('subjects').select('*')
      const { data: allAtt }      = await supabase.from('attendance').select('status')
      const { data: allMarks }    = await supabase.from('marks').select('marks_obtained, max_marks')
      const { data: events }      = await supabase.from('announcements').select('*').like('audience', 'EVENT:%')
      const { data: placements }  = await supabase.from('placements').select('*')

      const attPct = allAtt && allAtt.length > 0
        ? Math.round(allAtt.filter(a => a.status === 'PRESENT').length / allAtt.length * 100)
        : 0

      const marksPct = allMarks && allMarks.length > 0
        ? Math.round(allMarks.reduce((s, m) => s + Number(m.marks_obtained), 0) /
            allMarks.reduce((s, m) => s + Number(m.max_marks), 0) * 100)
        : 0

      setStats({
        type: 'naac_data',
        data: {
          total_students:      allStudents?.length ?? 0,
          total_faculty:       allFaculty?.length ?? 0,
          total_subjects:      allSubjects?.length ?? 0,
          avg_attendance_pct:  attPct,
          avg_marks_pct:       marksPct,
          total_events:        events?.length ?? 0,
          total_placements:    placements?.length ?? 0,
          active_placements:   placements?.filter(p => p.is_active).length ?? 0,
          sections:            SECTIONS.length,
          academic_year:       '2025-2026',
          programme:           'B.E. Computer Science and Engineering',
          regulation:          'R2024',
          institution:         'LICET, Chennai',
        }
      })
    }

    setGenerated(true)
    setLoading(false)
  }

  const exportReport = () => {
    if (!stats) return
    let rows: any[] = []
    let sheetName = 'Report'

    if (stats.type === 'student_performance') {
      rows = stats.data.map((s: any, i: number) => ({
        'S.No': i+1, 'Name': s.name, 'Email': s.email,
        'Section': s.section, 'Attendance %': s.attendance,
        'CGPA': s.cgpa, 'Credits Earned': s.credits
      }))
      sheetName = 'Student Performance'
    } else if (stats.type === 'faculty_workload') {
      rows = stats.data.map((f: any, i: number) => ({
        'S.No': i+1, 'Name': f.name, 'Email': f.email,
        'Subjects Handled': f.subjects_handled,
        'Attendance Sessions': f.attendance_sessions,
        'Marks Entries': f.marks_entries,
      }))
      sheetName = 'Faculty Workload'
    } else if (stats.type === 'placement_stats') {
      rows = stats.data.map((p: any, i: number) => ({
        'S.No': i+1, 'Company': p.company_name, 'Role': p.role_title,
        'Package (LPA)': p.package_lpa ?? '—',
        'Visit Date': p.visit_date ?? '—',
        'Status': p.is_active ? 'Active' : 'Closed'
      }))
      sheetName = 'Placements'
    } else if (stats.type === 'naac_data') {
      rows = Object.entries(stats.data).map(([k, v]) => ({
        'Parameter': k.replace(/_/g, ' ').toUpperCase(),
        'Value': v
      }))
      sheetName = 'NAAC Data'
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    ws['!cols'] = Array(Object.keys(rows[0] ?? {}).length).fill({ wch: 25 })
    XLSX.writeFile(wb, `${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (!isHOD) return (
    <div className="p-6">
      <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
        <BarChart3 className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="font-mono text-sm text-slate-400">Reports are restricted to HOD only</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-cyan-400">// SECTION: REPORTS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Reports & Analytics</h1>
        <p className="font-mono text-xs text-slate-400 mt-1">
          Faculty workload, student performance, placement stats and NAAC/NBA data
        </p>
      </div>

      {/* Report selector */}
      <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-6 space-y-4">
        <span className="font-mono text-xs text-cyan-400">// GENERATE REPORT</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="font-mono text-xs text-slate-400">Report Type</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setGenerated(false) }}
              className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
              <option value="student_performance">Student Performance Report</option>
              <option value="faculty_workload">Faculty Workload Report</option>
              <option value="placement_stats">Placement Statistics</option>
              <option value="naac_data">NAAC/NBA Data Summary</option>
            </select>
          </div>
          {reportType === 'student_performance' && (
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Section</label>
              <select value={section} onChange={e => setSection(e.target.value)}
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={generateReport} disabled={loading}
              className="flex items-center gap-2 h-10 px-4 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              {loading ? 'Generating...' : 'Generate'}
            </button>
            {generated && (
              <button onClick={exportReport}
                className="flex items-center gap-2 h-10 px-4 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-green-700">
                <Download className="w-3 h-3" /> Export XLSX
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Report output */}
      {generated && stats && (
        <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg">
          <div className="px-6 py-4 border-b border-white/10">
            <span className="font-mono text-xs text-cyan-400">// REPORT OUTPUT</span>
            <h2 className="font-bold text-sm mt-1">
              {stats.type === 'student_performance' && `Student Performance — ${stats.section}`}
              {stats.type === 'faculty_workload' && 'Faculty Workload Report'}
              {stats.type === 'placement_stats' && 'Placement Statistics'}
              {stats.type === 'naac_data' && 'NAAC/NBA Data Summary — CSE Dept'}
            </h2>
          </div>

          {/* NAAC summary cards */}
          {stats.type === 'naac_data' && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Students',   value: stats.data.total_students,    icon: Users },
                  { label: 'Total Faculty',     value: stats.data.total_faculty,     icon: Users },
                  { label: 'Total Subjects',    value: stats.data.total_subjects,    icon: BookOpen },
                  { label: 'Placement Drives',  value: stats.data.total_placements,  icon: Award },
                  { label: 'Avg Attendance %',  value: `${stats.data.avg_attendance_pct}%`, icon: TrendingUp },
                  { label: 'Avg Marks %',       value: `${stats.data.avg_marks_pct}%`,      icon: TrendingUp },
                  { label: 'Events Conducted',  value: stats.data.total_events,      icon: Award },
                  { label: 'Active Drives',     value: stats.data.active_placements, icon: Award },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3 h-3 text-cyan-400" />
                      <p className="font-mono text-xs text-slate-400">{label}</p>
                    </div>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Institution',    value: stats.data.institution },
                  { label: 'Programme',      value: stats.data.programme },
                  { label: 'Regulation',     value: stats.data.regulation },
                  { label: 'Academic Year',  value: stats.data.academic_year },
                  { label: 'Sections',       value: `${stats.data.sections} sections` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-2 border-b border-white/10 last:border-0">
                    <span className="font-mono text-xs text-slate-400">{label}</span>
                    <span className="font-mono text-xs font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table reports */}
          {(stats.type === 'student_performance' || stats.type === 'faculty_workload' || stats.type === 'placement_stats') && (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr className="border-b border-white/10 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80">
                    {stats.type === 'student_performance' && ['#','Name','Email','Attendance %','CGPA','Credits'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate-400">{h}</th>
                    ))}
                    {stats.type === 'faculty_workload' && ['#','Name','Email','Subjects','Sessions','Marks Entries'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate-400">{h}</th>
                    ))}
                    {stats.type === 'placement_stats' && ['#','Company','Role','Package','Visit Date','Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.data.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/30">
                      {stats.type === 'student_performance' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.email}</td>
                          <td className={`px-4 py-3 font-mono text-sm font-bold ${row.attendance >= 75 ? 'text-green-500' : 'text-red-500'}`}>{row.attendance}%</td>
                          <td className="px-4 py-3 font-mono text-sm font-bold">{row.cgpa}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.credits}</td>
                        </>
                      )}
                      {stats.type === 'faculty_workload' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.email}</td>
                          <td className="px-4 py-3 font-mono text-sm font-bold">{row.subjects_handled}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.attendance_sessions}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.marks_entries}</td>
                        </>
                      )}
                      {stats.type === 'placement_stats' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.company_name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.role_title}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.package_lpa ? `₹${row.package_lpa} LPA` : '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.visit_date ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`font-mono text-xs px-2 py-0.5 rounded border ${row.is_active ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors border-white/10'}`}>
                              {row.is_active ? 'Active' : 'Closed'}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
