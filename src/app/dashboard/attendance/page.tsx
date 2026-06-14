"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, Calendar, Download, Lock, Unlock, Clock } from "lucide-react"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']
type AttRow  = Database['public']['Tables']['attendance']['Row']

const STATUS_COLORS = {
  PRESENT: 'text-green-500 bg-green-500/10 border-green-500/20',
  ABSENT:  'text-red-500 bg-red-500/10 border-red-500/20',
  LATE:    'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  EXCUSED: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
}

// 3-part attendance system
const PARTS = [
  { id: 1, label: 'Part I',   time: '8:00 AM',   periods: [1,2],   color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { id: 2, label: 'Part II',  time: '10:10 AM',  periods: [3,4,5], color: 'text-green-500 bg-green-500/10 border-green-500/20' },
  { id: 3, label: 'Part III', time: '1:30 PM',   periods: [6,7,8], color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
]

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']


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
export default function AttendancePage() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [subjects, setSubjects]     = useState<Subject[]>([])
  const [students, setStudents]     = useState<Profile[]>([])
  const [attendance, setAttendance] = useState<AttRow[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedDate, setSelectedDate]       = useState(new Date().toISOString().split('T')[0])
  const [selectedSection, setSelectedSection] = useState('')
  const [markingState, setMarkingState]       = useState<Record<string, 'PRESENT'|'ABSENT'|'LATE'|'EXCUSED'>>({})
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockReason, setLockReason]       = useState('')
  const [exportFrom, setExportFrom]       = useState('')
  const [exportTo, setExportTo]           = useState('')
  const [exporting, setExporting]         = useState(false)
  const [activeMode, setActiveMode]       = useState<'subject'|'day'>('subject')
  const [activePart, setActivePart]       = useState<1|2|3>(1)
  const [dayAttendance, setDayAttendance] = useState<Record<string, Record<number, 'PRESENT'|'ABSENT'>>>({})

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load profile for', au.data.email, error); return }
        if (data) setProfile(data)
      })
  }, [router])

  useEffect(() => {
    if (!authUser) return
    let query = supabase.from('subjects').select('*').order('semester').order('name')
    if (isStudent) {
      if (!profile) return // wait for live profile before querying with a possibly-stale section
      const section = profile.section ?? (authUser.data as any)?.section ?? ''
      query = query.eq('section', section).eq('semester', currentSem(section))
    } else if (selectedSection) {
      query = query.eq('section', selectedSection)
    }
    query.then(({ data, error }) => {
      if (error) { console.error('Failed to load subjects', error); return }
      if (data) setSubjects(data)
    })
  }, [authUser, profile, isStudent, selectedSection])

  useEffect(() => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || isStudent) return
    supabase.from('profiles').select('*').eq('role', 'STUDENT').eq('section', section).order('full_name')
      .then(({ data }) => { if (data) setStudents(data) })
  }, [selectedSubject, selectedSection, isStudent])

  // Check lock
  useEffect(() => {
    if (!selectedSubject) return
    ;(supabase.from('subject_locks' as any) as any)
      .select('*').eq('subject_id', selectedSubject.id).in('lock_type', ['ATTENDANCE','BOTH'])
      .then(({ data }: any) => setIsLocked(!!(data?.length)))
  }, [selectedSubject])

  // Load day attendance for selected section+date
  useEffect(() => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || !selectedDate || isStudent) return
    ;(supabase.from('day_attendance' as any) as any)
      .select('*').eq('section', section).eq('date', selectedDate)
      .then(({ data }: any) => {
        if (!data) return
        const map: Record<string, Record<number, 'PRESENT'|'ABSENT'>> = {}
        data.forEach((r: any) => {
          if (!map[r.student_id]) map[r.student_id] = {}
          map[r.student_id][r.part] = r.status
        })
        setDayAttendance(map)
      })
  }, [selectedSection, selectedSubject, selectedDate, isStudent])

  const loadAttendance = useCallback(async () => {
    if (!selectedSubject) return
    if (isStudent && profile) {
      const { data } = await supabase.from('attendance')
        .select('*').eq('student_id', profile.id).eq('subject_id', selectedSubject.id)
        .order('date', { ascending: false })
      if (data) setAttendance(data)
    } else {
      const { data } = await supabase.from('attendance')
        .select('*').eq('subject_id', selectedSubject.id).eq('date', selectedDate)
      if (data) {
        setAttendance(data)
        const state: Record<string, 'PRESENT'|'ABSENT'|'LATE'|'EXCUSED'> = {}
        data.forEach(a => { state[a.student_id] = a.status as any })
        setMarkingState(state)
      }
    }
  }, [selectedSubject, selectedDate, isStudent, profile])

  useEffect(() => { loadAttendance() }, [loadAttendance])

  useEffect(() => {
    if (!students.length || isStudent) return
    setMarkingState(prev => {
      const next = { ...prev }
      students.forEach(s => { if (!next[s.id]) next[s.id] = 'PRESENT' })
      return next
    })
  }, [students, isStudent])

  const saveDayAttendance = async () => {
    if (!profile) return
    const section = selectedSubject?.section ?? selectedSection
    if (!section) return
    setSaving(true)

    const records = students.map(s => ({
      student_id: s.id,
      section,
      date: selectedDate,
      part: activePart,
      status: dayAttendance[s.id]?.[activePart] ?? 'PRESENT',
      marked_by: profile.id
    }))

    // Upsert day attendance
    await (supabase.from('day_attendance' as any) as any)
      .upsert(records, { onConflict: 'student_id,date,part' })

    // Auto-apply to subject attendance for subjects in this part
    const partPeriods = PARTS.find(p => p.id === activePart)?.periods ?? []

    // Get timetable to know which subjects are in this part
    const { data: ttData } = await supabase.from('announcements').select('body')
      .eq('audience', `TIMETABLE:${section}`).limit(1)

    if (ttData?.[0]) {
      try {
        const tt = JSON.parse(ttData[0].body)
        const todayName = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })
        const daySlots = tt.timetable?.[todayName] ?? {}

        const subjectAbsent: Record<string, string[]> = {}
        partPeriods.forEach(periodNo => {
          const slot = daySlots[periodNo]
          if (slot?.subjectId) {
            students.forEach(s => {
              const partStatus = dayAttendance[s.id]?.[activePart] ?? 'PRESENT'
              if (partStatus === 'ABSENT') {
                if (!subjectAbsent[slot.subjectId]) subjectAbsent[slot.subjectId] = []
                subjectAbsent[slot.subjectId].push(s.id)
              }
            })
          }
        })

        // Mark absent students in subject attendance
        for (const [subjectId, absentIds] of Object.entries(subjectAbsent)) {
          for (const studentId of absentIds) {
            await supabase.from('attendance').upsert({
              student_id: studentId,
              subject_id: subjectId,
              faculty_id: profile.id,
              date: selectedDate,
              status: 'ABSENT',
              marked_via: 'DAY_ATTENDANCE'
            }, { onConflict: 'student_id,subject_id,date' })
          }
        }
      } catch {}
    }

    setSaving(false)
    setSaveMsg(`✓ Part ${activePart} attendance saved · Subjects auto-updated`)
    setTimeout(() => setSaveMsg(''), 5000)
  }

  const saveAttendance = async () => {
    if (!selectedSubject || !profile || isLocked) return
    setSaving(true)
    setSaveMsg('')
    const records = students.map(s => ({
      student_id: s.id, subject_id: selectedSubject.id,
      faculty_id: profile.id, date: selectedDate,
      status: markingState[s.id] ?? 'ABSENT', marked_via: 'MANUAL'
    }))
    const { error } = await supabase.from('attendance').upsert(records, {
      onConflict: 'student_id,subject_id,date'
    })
    setSaving(false)
    if (error) setSaveMsg('Error: ' + error.message)
    else { setSaveMsg(`✓ Saved for ${records.length} students`); loadAttendance(); setTimeout(() => setSaveMsg(''), 4000) }
  }

  const toggleLock = async () => {
    if (!selectedSubject || !profile) return
    if (isLocked) {
      await (supabase.from('subject_locks' as any) as any)
        .delete().eq('subject_id', selectedSubject.id).in('lock_type', ['ATTENDANCE','BOTH'])
      setIsLocked(false); setSaveMsg('✓ Unlocked')
    } else {
      await (supabase.from('subject_locks' as any) as any).insert({
        subject_id: selectedSubject.id, lock_type: 'ATTENDANCE',
        locked_by: profile.id, reason: lockReason || 'Locked by HOD'
      })
      setIsLocked(true); setShowLockModal(false); setSaveMsg('✓ Locked')
    }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const exportXLSX = async () => {
    if (!selectedSubject) return
    setExporting(true)
    let query = supabase.from('attendance').select('*, profiles!student_id(full_name, email)')
      .eq('subject_id', selectedSubject.id).order('date') as any
    if (exportFrom) query = query.gte('date', exportFrom)
    if (exportTo)   query = query.lte('date', exportTo)
    const { data } = await query
    if (!data?.length) { setExporting(false); setSaveMsg('No data'); return }

    const dates = [...new Set(data.map((r: any) => r.date as string))].sort()
    const studentMap: Record<string, string> = {}
    data.forEach((r: any) => { studentMap[r.student_id] = r.profiles?.full_name ?? r.student_id })

    const rows: any[] = []
    Object.entries(studentMap).forEach(([sid, name]) => {
      const row: any = { 'Student Name': name }
      let present = 0, total = dates.length
      dates.forEach(date => {
        const rec = data.find((r: any) => r.student_id === sid && r.date === date)
        const status = rec?.status ?? '—'
        row[date as string] = status
        if (status === 'PRESENT' || status === 'LATE') present++
      })
      row['Present'] = present; row['Total'] = total
      row['%'] = total > 0 ? Math.round(present / total * 100) + '%' : '—'
      rows.push(row)
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `Attendance_${selectedSubject.code}_${selectedSubject.section}.xlsx`)
    setExporting(false); setSaveMsg(`✓ Exported ${rows.length} students`)
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const calcPct = (subjectId: string) => {
    const rows = attendance.filter(a => a.subject_id === subjectId)
    if (!rows.length) return null
    return Math.round(rows.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length / rows.length * 100)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: ATTENDANCE</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Attendance</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          3-part day attendance · Subject-wise attendance · Auto-link between both
        </p>
      </div>

      {/* ── STUDENT VIEW ── */}
      {isStudent && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Classes', value: attendance.length },
              { label: 'Present',       value: attendance.filter(a => a.status === 'PRESENT').length },
              { label: 'Absent',        value: attendance.filter(a => a.status === 'ABSENT').length },
              { label: 'Overall %',     value: attendance.length ? Math.round(attendance.filter(a => a.status==='PRESENT'||a.status==='LATE').length/attendance.length*100)+'%' : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-mono text-xs text-primary">// SUBJECTS — CURRENT SEMESTER</span>
            </div>
            {subjects.map(subject => {
              const pct = calcPct(subject.id)
              const color = pct === null ? 'text-muted-foreground' : pct >= 75 ? 'text-green-500' : pct >= 65 ? 'text-yellow-500' : 'text-red-500'
              return (
                <div key={subject.id}
                  className={`flex items-center gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer ${selectedSubject?.id === subject.id ? 'bg-accent' : ''}`}
                  onClick={() => setSelectedSubject(prev => prev?.id === subject.id ? null : subject)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                    <p className="text-sm font-medium truncate">{subject.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold font-mono ${color}`}>{pct !== null ? `${pct}%` : '—'}</p>
                    <p className="font-mono text-xs text-muted-foreground">{attendance.filter(a => a.subject_id === subject.id).length} classes</p>
                  </div>
                </div>
              )
            })}
          </div>
          {selectedSubject && (
            <div className="bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="font-bold text-sm">{selectedSubject.name}</h2>
                <button onClick={() => setSelectedSubject(null)} className="font-mono text-xs text-muted-foreground">✕</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {attendance.filter(a => a.subject_id === selectedSubject.id).map(a => (
                  <div key={a.id} className="flex justify-between px-6 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{a.date}</span>
                    <span className={`font-mono text-xs px-2 py-1 rounded border ${STATUS_COLORS[a.status as keyof typeof STATUS_COLORS]}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FACULTY / HOD VIEW ── */}
      {(isFaculty || isHOD) && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 border-b border-border">
            <button onClick={() => setActiveMode('day')}
              className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs border-b-2 transition-all ${activeMode === 'day' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Clock className="w-3.5 h-3.5" /> Day Attendance (3-Part)
            </button>
            <button onClick={() => setActiveMode('subject')}
              className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs border-b-2 transition-all ${activeMode === 'subject' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Calendar className="w-3.5 h-3.5" /> Subject-wise Attendance
            </button>
          </div>

          {/* Controls */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {isHOD && (
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Section</label>
                  <select value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setSelectedSubject(null); setMarkingState({}) }}
                    className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    <option value="">All sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {activeMode === 'subject' && (
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Subject</label>
                  <select value={selectedSubject?.id ?? ''} onChange={e => {
                    const s = subjects.find(s => s.id === e.target.value) ?? null
                    setSelectedSubject(s); setMarkingState({})
                  }} className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    <option value="">Select subject...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>[{s.section}] {s.code} – {s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Date</label>
                <input type="date" value={selectedDate} max={new Date().toISOString().split('T')[0]}
                  onChange={e => { setSelectedDate(e.target.value); setMarkingState({}) }}
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>

            {/* Export + Lock (subject mode) */}
            {activeMode === 'subject' && selectedSubject && (
              <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border mt-3">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Export From</label>
                  <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                    className="h-9 px-2 bg-background border border-border rounded font-mono text-xs focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Export To</label>
                  <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                    className="h-9 px-2 bg-background border border-border rounded font-mono text-xs focus:border-primary focus:outline-none" />
                </div>
                <button onClick={exportXLSX} disabled={exporting}
                  className="flex items-center gap-2 h-9 px-3 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export XLSX
                </button>
                {isHOD && (
                  <button onClick={() => isLocked ? toggleLock() : setShowLockModal(true)}
                    className={`flex items-center gap-2 h-9 px-3 font-mono text-xs rounded transition-colors ${isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white'}`}>
                    {isLocked ? <><Unlock className="w-3 h-3" /> Unlock</> : <><Lock className="w-3 h-3" /> Lock</>}
                  </button>
                )}
                {isLocked && (
                  <div className="flex items-center gap-2 font-mono text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded">
                    <Lock className="w-3 h-3" /> Locked
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lock modal */}
          {showLockModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4">
                <span className="font-mono text-xs text-primary">// LOCK ATTENDANCE</span>
                <h2 className="font-bold text-sm">{selectedSubject?.name}</h2>
                <input type="text" value={lockReason} onChange={e => setLockReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
                <div className="flex gap-3">
                  <button onClick={toggleLock} className="flex-1 h-10 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" /> Confirm Lock
                  </button>
                  <button onClick={() => setShowLockModal(false)} className="flex-1 h-10 bg-accent font-mono text-xs rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── DAY ATTENDANCE MODE ── */}
          {activeMode === 'day' && (
            <div className="space-y-4">
              {/* Part selector */}
              <div className="flex gap-2">
                {PARTS.map(part => (
                  <button key={part.id} onClick={() => setActivePart(part.id as 1|2|3)}
                    className={`flex items-center gap-2 px-4 py-2 font-mono text-xs rounded border transition-all ${activePart === part.id ? part.color + ' font-bold' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    <Clock className="w-3 h-3" />
                    {part.label} · {part.time}
                    <span className="text-muted-foreground text-xs">P{part.periods[0]}–P{part.periods[part.periods.length-1]}</span>
                  </button>
                ))}
              </div>

              {students.length > 0 && (
                <div className="bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <span className="font-mono text-xs text-primary">// DAY ATTENDANCE — {PARTS.find(p => p.id === activePart)?.label}</span>
                      <p className="font-mono text-xs text-muted-foreground mt-1">
                        {selectedSection || selectedSubject?.section} · {selectedDate} · {students.length} students
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const next = { ...dayAttendance }
                        students.forEach(s => {
                          if (!next[s.id]) next[s.id] = {}
                          next[s.id][activePart] = 'PRESENT'
                        })
                        setDayAttendance(next)
                      }} className="font-mono text-xs px-3 py-1.5 rounded border border-green-500/30 text-green-500 hover:bg-green-500/10">All Present</button>
                      <button onClick={() => {
                        const next = { ...dayAttendance }
                        students.forEach(s => {
                          if (!next[s.id]) next[s.id] = {}
                          next[s.id][activePart] = 'ABSENT'
                        })
                        setDayAttendance(next)
                      }} className="font-mono text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10">All Absent</button>
                    </div>
                  </div>

                  <div className="px-6 py-2 border-b border-border flex gap-4 font-mono text-xs">
                    <span className="text-green-500">P: {students.filter(s => (dayAttendance[s.id]?.[activePart] ?? 'PRESENT') === 'PRESENT').length}</span>
                    <span className="text-red-500">A: {students.filter(s => dayAttendance[s.id]?.[activePart] === 'ABSENT').length}</span>
                    <span className="text-muted-foreground ml-auto text-xs">Absent → auto-marks absent in all Part {activePart} subjects</span>
                  </div>

                  <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                    {students.map((student, idx) => {
                      const status = dayAttendance[student.id]?.[activePart] ?? 'PRESENT'
                      return (
                        <div key={student.id} className="flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors">
                          <span className="font-mono text-xs text-muted-foreground w-6 text-right">{idx+1}</span>
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {student.full_name.split(' ').map(n => n[0]).slice(0,2).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{student.full_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setDayAttendance(prev => ({ ...prev, [student.id]: { ...(prev[student.id]??{}), [activePart]: 'PRESENT' } }))}
                              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${status === 'PRESENT' ? STATUS_COLORS.PRESENT + ' font-bold' : 'border-border text-muted-foreground hover:border-green-500/50'}`}>P</button>
                            <button onClick={() => setDayAttendance(prev => ({ ...prev, [student.id]: { ...(prev[student.id]??{}), [activePart]: 'ABSENT' } }))}
                              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${status === 'ABSENT' ? STATUS_COLORS.ABSENT + ' font-bold' : 'border-border text-muted-foreground hover:border-red-500/50'}`}>A</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                    <span className={`font-mono text-xs ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>{saveMsg}</span>
                    <button onClick={saveDayAttendance} disabled={saving || !students.length}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {saving ? 'Saving & Linking...' : `Save Part ${activePart} Attendance`}
                    </button>
                  </div>
                </div>
              )}

              {students.length === 0 && (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="font-mono text-sm text-muted-foreground">Select a section to mark day attendance</p>
                </div>
              )}
            </div>
          )}

          {/* ── SUBJECT ATTENDANCE MODE ── */}
          {activeMode === 'subject' && (
            selectedSubject ? (
              <div className="bg-card border border-border rounded-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <span className="font-mono text-xs text-primary">// SUBJECT ATTENDANCE</span>
                    <h2 className="font-bold text-sm mt-1">{selectedSubject.code} — {selectedSubject.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{selectedSubject.section} · {selectedDate}</p>
                  </div>
                  {!isLocked && (
                    <div className="flex gap-2">
                      <button onClick={() => { const n: Record<string,'PRESENT'> = {}; students.forEach(s => n[s.id]='PRESENT'); setMarkingState(n) }}
                        className="font-mono text-xs px-3 py-1.5 rounded border border-green-500/30 text-green-500 hover:bg-green-500/10">All Present</button>
                      <button onClick={() => { const n: Record<string,'ABSENT'> = {}; students.forEach(s => n[s.id]='ABSENT'); setMarkingState(n) }}
                        className="font-mono text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10">All Absent</button>
                    </div>
                  )}
                </div>
                <div className="px-6 py-2 border-b border-border flex gap-6 font-mono text-xs">
                  <span className="text-green-500">P: {Object.values(markingState).filter(v=>v==='PRESENT').length}</span>
                  <span className="text-red-500">A: {Object.values(markingState).filter(v=>v==='ABSENT').length}</span>
                  <span className="text-yellow-500">L: {Object.values(markingState).filter(v=>v==='LATE').length}</span>
                  <span className="text-blue-500">E: {Object.values(markingState).filter(v=>v==='EXCUSED').length}</span>
                </div>
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {students.map((student, idx) => {
                    const status = markingState[student.id] ?? null
                    return (
                      <div key={student.id} className="flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors">
                        <span className="font-mono text-xs text-muted-foreground w-6 text-right">{idx+1}</span>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {student.full_name.split(' ').map(n => n[0]).slice(0,2).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.full_name}</p>
                          <p className="font-mono text-xs text-muted-foreground truncate">{student.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {(['PRESENT','ABSENT','LATE','EXCUSED'] as const).map(s => (
                            <button key={s} disabled={isLocked}
                              onClick={() => !isLocked && setMarkingState(prev => ({ ...prev, [student.id]: s }))}
                              className={`font-mono text-xs px-2 py-1 rounded border transition-all ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${status === s ? STATUS_COLORS[s]+' font-bold' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                              {s[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <span className={`font-mono text-xs ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>{saveMsg}</span>
                  <button onClick={saveAttendance} disabled={saving || isLocked || !students.length}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {isLocked ? 'Locked' : saving ? 'Saving...' : 'Save Attendance'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-mono text-sm text-muted-foreground">Select a subject to mark attendance</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}