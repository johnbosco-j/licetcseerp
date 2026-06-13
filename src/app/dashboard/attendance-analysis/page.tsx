"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { Users, AlertTriangle, CheckCircle2, Clock, Download, Loader2 } from "lucide-react"
import * as XLSX from "xlsx"

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
const PARTS = [
  { id: 1, label: 'Part I',   time: '8:00 AM',  periods: 'P1–P2' },
  { id: 2, label: 'Part II',  time: '10:10 AM', periods: 'P3–P5' },
  { id: 3, label: 'Part III', time: '1:30 PM',  periods: 'P6–P8' },
]

interface StudentDayStatus {
  id: string
  name: string
  email: string
  part1: 'PRESENT' | 'ABSENT' | 'NOT_MARKED'
  part2: 'PRESENT' | 'ABSENT' | 'NOT_MARKED'
  part3: 'PRESENT' | 'ABSENT' | 'NOT_MARKED'
  fullDayAbsent: boolean
  partialAbsent: boolean
}


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
export default function AttendanceAnalysisPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [section, setSection]     = useState('II CSE-A')
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading]     = useState(false)
  const [students, setStudents]   = useState<StudentDayStatus[]>([])
  const [filter, setFilter]       = useState<'ALL'|'FULL_ABSENT'|'PARTIAL'|'PRESENT'>('ALL')
  const [subjectStats, setSubjectStats] = useState<any[]>([])

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type === 'student') { router.push('/dashboard/attendance'); return }
  }, [router])

  const loadAnalysis = async () => {
    setLoading(true)
    setStudents([])
    setSubjectStats([])

    // Load all students in section
    const { data: studs } = await supabase.from('profiles')
      .select('id, full_name, email').eq('role', 'STUDENT').eq('section', section).order('full_name')
    if (!studs) { setLoading(false); return }

    // Load day attendance for this section + date
    const { data: dayAtt } = await (supabase.from('day_attendance' as any) as any)
      .select('*').eq('section', section).eq('date', date)

    // Build student day status
    const result: StudentDayStatus[] = studs.map((s: any) => {
      const getStatus = (part: number) => {
        const rec = dayAtt?.find((r: any) => r.student_id === s.id && r.part === part)
        if (!rec) return 'NOT_MARKED'
        return rec.status as 'PRESENT' | 'ABSENT'
      }
      const p1 = getStatus(1)
      const p2 = getStatus(2)
      const p3 = getStatus(3)
      const absents = [p1,p2,p3].filter(x => x === 'ABSENT').length
      const marked  = [p1,p2,p3].filter(x => x !== 'NOT_MARKED').length

      return {
        id: s.id, name: s.full_name, email: s.email,
        part1: p1, part2: p2, part3: p3,
        fullDayAbsent: marked > 0 && absents === marked && marked === 3,
        partialAbsent: absents > 0 && absents < 3,
      }
    })
    setStudents(result)

    // Load subject-wise attendance for this date
    const currentSem = (sec: string) => getActiveSemester(sec)
    const { data: subs } = await supabase.from('subjects')
      .select('id, code, name').eq('section', section).eq('semester', currentSem(section))

    if (subs) {
      const stats = await Promise.all(subs.map(async (sub: any) => {
        const { data: att } = await supabase.from('attendance')
          .select('status, student_id').eq('subject_id', sub.id).eq('date', date)
        const present = att?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length ?? 0
        const absent  = att?.filter(a => a.status === 'ABSENT').length ?? 0
        const total   = studs.length
        const pct     = att?.length ? Math.round(present / att.length * 100) : null
        const absentNames = att
          ?.filter(a => a.status === 'ABSENT')
          .map((a: any) => studs.find((s: any) => s.id === a.student_id)?.full_name)
          .filter(Boolean) ?? []
        return { ...sub, present, absent, total, pct, marked: att?.length ?? 0, absentNames }
      }))
      setSubjectStats(stats)
    }

    setLoading(false)
  }

  const filtered = students.filter(s => {
    if (filter === 'FULL_ABSENT') return s.fullDayAbsent
    if (filter === 'PARTIAL')     return s.partialAbsent
    if (filter === 'PRESENT')     return !s.fullDayAbsent && !s.partialAbsent && s.part1 !== 'NOT_MARKED'
    return true
  })

  const stats = {
    total:       students.length,
    fullPresent: students.filter(s => !s.fullDayAbsent && !s.partialAbsent && s.part1 !== 'NOT_MARKED').length,
    partial:     students.filter(s => s.partialAbsent).length,
    fullAbsent:  students.filter(s => s.fullDayAbsent).length,
    notMarked:   students.filter(s => s.part1 === 'NOT_MARKED' && s.part2 === 'NOT_MARKED' && s.part3 === 'NOT_MARKED').length,
  }

  const exportXLSX = () => {
    const rows = students.map((s, i) => ({
      'S.No': i+1, 'Name': s.name, 'Email': s.email,
      'Part I (8AM)':   s.part1 === 'NOT_MARKED' ? '—' : s.part1,
      'Part II (10AM)': s.part2 === 'NOT_MARKED' ? '—' : s.part2,
      'Part III (1PM)': s.part3 === 'NOT_MARKED' ? '—' : s.part3,
      'Status': s.fullDayAbsent ? 'FULL DAY ABSENT' : s.partialAbsent ? 'PARTIAL ABSENT' : 'PRESENT',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Day Attendance')
    XLSX.writeFile(wb, `DayAttendance_${section}_${date}.xlsx`)
  }

  const partColor = (status: string) => {
    if (status === 'PRESENT')     return 'text-green-500 bg-green-500/10 border-green-500/20'
    if (status === 'ABSENT')      return 'text-red-500 bg-red-500/10 border-red-500/20'
    return 'text-muted-foreground bg-accent border-border'
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: DAILY ATTENDANCE ANALYSIS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Daily Attendance Analysis</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          3-part day attendance · Full absent · Partial absent · Subject-wise stats
        </p>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground">Section</label>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground">Date</label>
            <input type="date" value={date} max={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              className="h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
          </div>
          <button onClick={loadAnalysis} disabled={loading}
            className="flex items-center gap-2 h-10 px-4 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
            {loading ? 'Loading...' : 'Load Analysis'}
          </button>
          {students.length > 0 && (
            <button onClick={exportXLSX}
              className="flex items-center gap-2 h-10 px-3 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700">
              <Download className="w-3 h-3" /> Export
            </button>
          )}
        </div>
      </div>

      {students.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total',        value: stats.total,       color: 'text-foreground',   bg: '' },
              { label: 'Full Present', value: stats.fullPresent, color: 'text-green-500',    bg: 'bg-green-500/5 border-green-500/20' },
              { label: 'Partial Abs',  value: stats.partial,     color: 'text-yellow-500',   bg: 'bg-yellow-500/5 border-yellow-500/20' },
              { label: 'Full Absent',  value: stats.fullAbsent,  color: 'text-red-500',      bg: 'bg-red-500/5 border-red-500/20' },
              { label: 'Not Marked',   value: stats.notMarked,   color: 'text-muted-foreground', bg: '' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`border border-border rounded-lg p-4 ${bg}`}>
                <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Part-wise summary */}
          <div className="grid grid-cols-3 gap-4">
            {PARTS.map(part => {
              const present = students.filter(s => (s as any)[`part${part.id}`] === 'PRESENT').length
              const absent  = students.filter(s => (s as any)[`part${part.id}`] === 'ABSENT').length
              const marked  = present + absent
              const pct     = marked > 0 ? Math.round(present / marked * 100) : null
              return (
                <div key={part.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-mono text-xs font-bold">{part.label}</p>
                      <p className="font-mono text-xs text-muted-foreground">{part.time} · {part.periods}</p>
                    </div>
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-2xl font-bold text-green-500">{present}</p>
                      <p className="font-mono text-xs text-muted-foreground">present</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-500">{absent}</p>
                      <p className="font-mono text-xs text-muted-foreground">absent</p>
                    </div>
                    {pct !== null && (
                      <div className="ml-auto text-right">
                        <p className={`text-xl font-bold ${pct >= 75 ? 'text-green-500' : 'text-red-500'}`}>{pct}%</p>
                        <p className="font-mono text-xs text-muted-foreground">attendance</p>
                      </div>
                    )}
                  </div>
                  {marked === 0 && (
                    <p className="font-mono text-xs text-muted-foreground mt-2">Not marked yet</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'ALL',         label: `All (${students.length})` },
              { key: 'PRESENT',     label: `Full Present (${stats.fullPresent})` },
              { key: 'PARTIAL',     label: `Partial Absent (${stats.partial})` },
              { key: 'FULL_ABSENT', label: `Full Absent (${stats.fullAbsent})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${filter === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Student list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-mono text-xs text-primary">// STUDENT DAY ATTENDANCE — {section} · {date}</span>
            </div>
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-6 py-8 text-center font-mono text-sm text-muted-foreground">No students match this filter</div>
              ) : filtered.map((s, idx) => (
                <div key={s.id} className={`flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors ${s.fullDayAbsent ? 'bg-red-500/3' : s.partialAbsent ? 'bg-yellow-500/3' : ''}`}>
                  <span className="font-mono text-xs text-muted-foreground w-6 text-right flex-shrink-0">{idx+1}</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {s.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    {s.fullDayAbsent && (
                      <p className="font-mono text-xs text-red-500 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3" /> Full day absent
                      </p>
                    )}
                    {s.partialAbsent && !s.fullDayAbsent && (
                      <p className="font-mono text-xs text-yellow-500 mt-0.5">
                        Partial absent — {[s.part1 === 'ABSENT' && 'Part I', s.part2 === 'ABSENT' && 'Part II', s.part3 === 'ABSENT' && 'Part III'].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {[s.part1, s.part2, s.part3].map((status, i) => (
                      <span key={i} className={`font-mono text-xs px-2 py-0.5 rounded border ${partColor(status)}`}>
                        P{i+1}: {status === 'NOT_MARKED' ? '—' : status[0]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject-wise stats */}
          {subjectStats.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <span className="font-mono text-xs text-primary">// SUBJECT-WISE ATTENDANCE — {date}</span>
                <p className="font-mono text-xs text-muted-foreground mt-1">Based on subject attendance records for this date</p>
              </div>
              <div className="divide-y divide-border">
                {subjectStats.map(sub => (
                  <div key={sub.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{sub.code}</span>
                          {sub.pct !== null && (
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${sub.pct >= 75 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
                              {sub.pct}%
                            </span>
                          )}
                          {sub.marked === 0 && (
                            <span className="font-mono text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded">Not marked</span>
                          )}
                        </div>
                        <p className="font-medium text-sm">{sub.name}</p>
                        {sub.marked > 0 && (
                          <p className="font-mono text-xs text-muted-foreground mt-1">
                            {sub.present} present · {sub.absent} absent · {sub.total - sub.marked} unmarked
                          </p>
                        )}
                      </div>
                      {sub.absent > 0 && (
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-xs text-red-500 font-bold mb-1">Absent students:</p>
                          <div className="space-y-0.5">
                            {sub.absentNames.slice(0, 5).map((name: string, i: number) => (
                              <p key={i} className="font-mono text-xs text-muted-foreground">{name}</p>
                            ))}
                            {sub.absentNames.length > 5 && (
                              <p className="font-mono text-xs text-muted-foreground">+{sub.absentNames.length - 5} more</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Attendance bar */}
                    {sub.marked > 0 && (
                      <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${sub.pct ?? 0}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {students.length === 0 && !loading && (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground">Select section and date, then click Load Analysis</p>
        </div>
      )}
    </div>
  )
}
