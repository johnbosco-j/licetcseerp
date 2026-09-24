"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { attendanceStatus } from "@/lib/regulations"
import { loadDepartmentTotals, loadStudentStats } from "@/lib/cgpa"
import { academicYear } from "@/lib/utils"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { BarChart3, Download, Loader2, Users, BookOpen, Award, TrendingUp } from "lucide-react"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export default function ReportsPage() {
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

      const stats = await loadStudentStats(students.map(s => s.id))
      const results = students.map(s => ({
        name: s.full_name, email: s.email, section: s.section,
        attendance: stats[s.id].attendancePct, cgpa: stats[s.id].cgpa.totalCredits ? stats[s.id].cgpa.cgpa.toFixed(2) : '—',
        credits: stats[s.id].cgpa.totalCredits,
      }))
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
      const totals                = await loadDepartmentTotals()
      const { data: events }      = await supabase.from('announcements').select('*').like('audience', 'EVENT:%')
      const { data: placements }  = await supabase.from('placements').select('*')

      setStats({
        type: 'naac_data',
        data: {
          total_students:      allStudents?.length ?? 0,
          total_faculty:       allFaculty?.length ?? 0,
          total_subjects:      allSubjects?.length ?? 0,
          avg_attendance_pct:  totals.attendancePct,
          avg_marks_pct:       totals.marksPct,
          total_events:        events?.length ?? 0,
          total_placements:    placements?.length ?? 0,
          active_placements:   placements?.filter(p => p.is_active).length ?? 0,
          sections:            SECTIONS.length,
          academic_year:       academicYear(),
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
        'Section': s.section, 'Attendance %': s.attendance ?? 'No records',
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
      <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
        <BarChart3 className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
        <p className="font-mono text-sm text-muted-foreground">Reports are restricted to HOD only</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">REPORTS</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Reports & Analytics</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          Faculty workload, student performance, placement stats and NAAC/NBA data
        </p>
      </div>

      {/* Report selector */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="eyebrow">GENERATE REPORT</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground">Report Type</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setGenerated(false) }}
              className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
              <option value="student_performance">Student Performance Report</option>
              <option value="faculty_workload">Faculty Workload Report</option>
              <option value="placement_stats">Placement Statistics</option>
              <option value="naac_data">NAAC/NBA Data Summary</option>
            </select>
          </div>
          {reportType === 'student_performance' && (
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Section</label>
              <select value={section} onChange={e => setSection(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={generateReport} disabled={loading}
              className="flex items-center gap-2 h-10 px-4 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              {loading ? 'Generating...' : 'Generate'}
            </button>
            {generated && (
              <button onClick={exportReport}
                className="flex items-center gap-2 h-10 px-4 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
                <Download className="w-3 h-3" /> Export XLSX
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Report output */}
      {generated && stats && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
            <span className="eyebrow">REPORT OUTPUT</span>
            <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">
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
                  { label: 'Avg Attendance %',  value: stats.data.avg_attendance_pct !== null ? `${stats.data.avg_attendance_pct}%` : '—', icon: TrendingUp },
                  { label: 'Avg Marks %',       value: stats.data.avg_marks_pct !== null ? `${stats.data.avg_marks_pct}%` : '—',      icon: TrendingUp },
                  { label: 'Events Conducted',  value: stats.data.total_events,      icon: Award },
                  { label: 'Active Drives',     value: stats.data.active_placements, icon: Award },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3 h-3 text-primary" />
                      <p className="font-mono text-xs text-muted-foreground">{label}</p>
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
                  <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="font-mono text-xs text-muted-foreground">{label}</span>
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
                  <tr className="border-b border-border bg-accent/80">
                    {stats.type === 'student_performance' && ['#','Name','Email','Attendance %','CGPA','Credits'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">{h}</th>
                    ))}
                    {stats.type === 'faculty_workload' && ['#','Name','Email','Subjects','Sessions','Marks Entries'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">{h}</th>
                    ))}
                    {stats.type === 'placement_stats' && ['#','Company','Role','Package','Visit Date','Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.data.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-accent/30">
                      {stats.type === 'student_performance' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.email}</td>
                          <td className={`px-4 py-3 font-mono text-sm font-bold ${row.attendance === null ? 'text-muted-foreground' : { good: 'text-green-700', warn: 'text-amber-700', bad: 'text-red-700' }[attendanceStatus(row.attendance).tone]}`}>{row.attendance === null ? '—' : `${row.attendance}%`}</td>
                          <td className="px-4 py-3 font-mono text-sm font-bold">{row.cgpa}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.credits}</td>
                        </>
                      )}
                      {stats.type === 'faculty_workload' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.email}</td>
                          <td className="px-4 py-3 font-mono text-sm font-bold">{row.subjects_handled}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.attendance_sessions}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.marks_entries}</td>
                        </>
                      )}
                      {stats.type === 'placement_stats' && (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i+1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{row.company_name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.role_title}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.package_lpa ? `₹${row.package_lpa} LPA` : '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.visit_date ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`font-mono text-xs px-2 py-0.5 rounded border ${row.is_active ? 'text-green-700 bg-green-50 border-green-200' : 'text-muted-foreground bg-accent border-border'}`}>
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
