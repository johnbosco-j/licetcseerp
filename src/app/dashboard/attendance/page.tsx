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

type Status4 = 'PRESENT' | 'ABSENT_ON_INFO' | 'ABSENT_ON_NO_INFO' | 'LATE'

const STATUS_COLORS: Record<string, string> = {
  PRESENT:           'text-green-500 bg-green-500/10 border-green-500/20',
  ABSENT_ON_INFO:    'text-blue-500 bg-blue-500/10 border-blue-500/20',
  ABSENT_ON_NO_INFO: 'text-red-500 bg-red-500/10 border-red-500/20',
  LATE:              'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  ABSENT:  'text-red-500 bg-red-500/10 border-red-500/20',
  EXCUSED: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
}

const STATUS_LABELS: Record<Status4, string> = {
  PRESENT:           'Present',
  ABSENT_ON_INFO:    'Absent (Informed)',
  ABSENT_ON_NO_INFO: 'Absent (No Info)',
  LATE:              'Late',
}

const STATUS_SHORT: Record<Status4, string> = {
  PRESENT:           'P',
  ABSENT_ON_INFO:    'AI',
  ABSENT_ON_NO_INFO: 'AN',
  LATE:              'L',
}

// Maps UI status values → DB-accepted check constraint values for day_attendance
// DB constraint accepts: PRESENT | ABSENT | LATE
function toDbStatus(s: Status4): string {
  if (s === 'PRESENT') return 'PRESENT'
  if (s === 'LATE')    return 'LATE'
  // Both ABSENT_ON_INFO and ABSENT_ON_NO_INFO → ABSENT in DB
  return 'ABSENT'
}

const PARTS = [
  { id: 1, label: 'Part I',   time: '8:00 AM',  periods: [1,2],   color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { id: 2, label: 'Part II',  time: '10:10 AM', periods: [3,4,5], color: 'text-green-500 bg-green-500/10 border-green-500/20' },
  { id: 3, label: 'Part III', time: '1:30 PM',  periods: [6,7,8], color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
]

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

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
  const [markingState, setMarkingState]       = useState<Record<string, Status4>>({})
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
  const [dayAttendance, setDayAttendance] = useState<Record<string, Record<number, Status4>>>({})
  const [dayLocked, setDayLocked]         = useState(false)
  const [showDayLockModal, setShowDayLockModal] = useState(false)
  const [dayLockReason, setDayLockReason] = useState('')

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('licet_user') || localStorage.getItem('excelsior_user')
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
      if (!profile) return
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

  useEffect(() => {
    if (!selectedSubject) return
    ;(supabase.from('subject_locks' as any) as any)
      .select('*').eq('subject_id', selectedSubject.id).in('lock_type', ['ATTENDANCE','BOTH'])
      .then(({ data }: any) => setIsLocked(!!(data?.length)))
  }, [selectedSubject])

  useEffect(() => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || isStudent) { setDayLocked(false); return }
    ;(supabase.from('subject_locks' as any) as any)
      .select('*').is('subject_id', null).eq('lock_type', 'DAY_ATTENDANCE').eq('section', section)
      .then(({ data }: any) => setDayLocked(!!(data?.length)))
  }, [selectedSection, selectedSubject, isStudent])

  useEffect(() => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || !selectedDate || isStudent) return
    ;(supabase.from('day_attendance' as any) as any)
      .select('*').eq('section', section).eq('date', selectedDate)
      .then(({ data }: any) => {
        if (!data) return
        const map: Record<string, Record<number, Status4>> = {}
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
        const state: Record<string, Status4> = {}
        data.forEach(a => { state[a.student_id] = a.status as Status4 })
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

  const raiseAlertIfNeeded = async (studentId: string, section: string, date: string, missedParts: number[], alertType: string) => {
    const { data: existing } = await (supabase.from('attendance_alerts' as any) as any)
      .select('id').eq('student_id', studentId).eq('date', date).eq('alert_type', alertType).limit(1)
    if (existing?.length) return
    await (supabase.from('attendance_alerts' as any) as any).insert({
      student_id: studentId, section, date, missed_parts: missedParts, alert_type: alertType,
    })
  }

  const processAlerts = async (
    statuses: { studentId: string; status: Status4; part?: number }[],
    section: string,
    date: string
  ) => {
    try {
      const noInfo = statuses.filter(s => s.status === 'ABSENT_ON_NO_INFO')
      for (const s of noInfo) {
        await raiseAlertIfNeeded(s.studentId, section, date, s.part ? [s.part] : [1, 2, 3], 'ABSENT_ON_NO_INFO')
      }
      const lateOnes = statuses.filter(s => s.status === 'LATE')
      if (!lateOnes.length) return
      const monthStart = date.slice(0, 7) + '-01'
      const monthEnd   = date.slice(0, 7) + '-31'
      for (const s of lateOnes) {
        const [{ count: dayLateCount }, { count: subjLateCount }] = await Promise.all([
          (supabase.from('day_attendance' as any) as any)
            .select('*', { count: 'exact', head: true })
            .eq('student_id', s.studentId).eq('status', 'LATE')
            .gte('date', monthStart).lte('date', monthEnd),
          supabase.from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', s.studentId).eq('status', 'LATE' as any)
            .gte('date', monthStart).lte('date', monthEnd),
        ])
        const total = (dayLateCount ?? 0) + (subjLateCount ?? 0)
        if (total >= 3) {
          await raiseAlertIfNeeded(s.studentId, section, date, s.part ? [s.part] : [], 'LATE_THRESHOLD')
        }
      }
    } catch (err) {
      console.error('processAlerts error (non-fatal):', err)
    }
  }

  const saveDayAttendance = async () => {
    if (dayLocked) return
    const section = selectedSubject?.section ?? selectedSection
    if (!section || !students.length) return

    const currentProfile = profile
    if (!currentProfile) {
      setSaveMsg('Still loading profile, please try again.')
      return
    }

    setSaving(true)
    setSaveMsg('')

    try {
      const records = students.map(s => ({
        student_id: s.id, section, date: selectedDate, part: activePart,
        status: toDbStatus(dayAttendance[s.id]?.[activePart] ?? 'PRESENT'),
        marked_by: currentProfile.id
      }))

      const { error: upsertError } = await (supabase.from('day_attendance' as any) as any)
        .upsert(records, { onConflict: 'student_id,date,part' })

      if (upsertError) {
        setSaveMsg('Error saving: ' + upsertError.message)
        return
      }

      processAlerts(
        students.map(s => ({ studentId: s.id, status: (dayAttendance[s.id]?.[activePart] ?? 'PRESENT') as Status4, part: activePart })),
        section, selectedDate
      ).catch(console.error)

      try {
        const { data: ttData } = await Promise.race([
          supabase.from('announcements').select('body')
            .eq('audience', `TIMETABLE:${section}`).limit(1),
          new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 3000))
        ])
        if (ttData?.[0]) {
          const tt = JSON.parse(ttData[0].body)
          const todayName = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })
          const daySlots = tt.timetable?.[todayName] ?? {}
          const partPeriods = PARTS.find(p => p.id === activePart)?.periods ?? []
          const subjectAbsent: Record<string, { id: string, status: Status4 }[]> = {}
          partPeriods.forEach(periodNo => {
            const slot = daySlots[periodNo]
            if (slot?.subjectId) {
              students.forEach(s => {
                const partStatus = (dayAttendance[s.id]?.[activePart] ?? 'PRESENT') as Status4
                if (partStatus !== 'PRESENT') {
                  if (!subjectAbsent[slot.subjectId]) subjectAbsent[slot.subjectId] = []
                  subjectAbsent[slot.subjectId].push({ id: s.id, status: partStatus })
                }
              })
            }
          })
          for (const [subjectId, entries] of Object.entries(subjectAbsent)) {
            for (const { id: studentId, status } of entries) {
              await supabase.from('attendance').upsert({
                student_id: studentId, subject_id: subjectId, faculty_id: currentProfile.id,
                date: selectedDate, status: toDbStatus(status), marked_via: 'DAY_ATTENDANCE'
              }, { onConflict: 'student_id,subject_id,date' })
            }
          }
        }
      } catch (ttErr) {
        console.warn('Timetable auto-link skipped:', ttErr)
      }

      setSaveMsg(`✓ Part ${activePart} attendance saved · Subjects auto-updated`)
      setTimeout(() => setSaveMsg(''), 5000)
    } catch (err: any) {
      setSaveMsg('Error: ' + (err?.message ?? 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const saveAttendance = async () => {
    if (!selectedSubject || !profile || isLocked) return
    setSaving(true); setSaveMsg('')
    const records = students.map(s => ({
      student_id: s.id, subject_id: selectedSubject.id, faculty_id: profile.id,
      date: selectedDate, status: toDbStatus(markingState[s.id] ?? 'ABSENT_ON_NO_INFO'), marked_via: 'MANUAL'
    }))
    const { error } = await supabase.from('attendance').upsert(records, { onConflict: 'student_id,subject_id,date' })
    if (!error) {
      processAlerts(
        students.map(s => ({ studentId: s.id, status: (markingState[s.id] ?? 'ABSENT_ON_NO_INFO') as Status4 })),
        selectedSubject.section ?? '', selectedDate
      ).catch(console.error)
    }
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

  const toggleDayLock = async () => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || !profile) return
    if (dayLocked) {
      await (supabase.from('subject_locks' as any) as any)
        .delete().is('subject_id', null).eq('lock_type', 'DAY_ATTENDANCE').eq('section', section)
      setDayLocked(false); setSaveMsg('✓ Day attendance unlocked')
    } else {
      await (supabase.from('subject_locks' as any) as any).insert({
        subject_id: null, lock_type: 'DAY_ATTENDANCE', section,
        locked_by: profile.id, reason: dayLockReason || 'Locked by HOD'
      })
      setDayLocked(true); setShowDayLockModal(false); setSaveMsg('✓ Day attendance locked')
    }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const exportDayXLSX = async () => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section) return
    setExporting(true)
    setSaveMsg('')
    try {
      let attQuery = (supabase.from('day_attendance' as any) as any)
        .select('*').eq('section', section).order('date')
      if (exportFrom) attQuery = attQuery.gte('date', exportFrom)
      if (exportTo)   attQuery = attQuery.lte('date', exportTo)
      const { data, error } = await attQuery

      if (error) { setSaveMsg('Export error: ' + error.message); return }
      if (!data?.length) { setSaveMsg('No data found for selected range'); return }

      const { data: studentData } = await supabase
        .from('profiles').select('id, full_name').eq('role', 'STUDENT').eq('section', section)
      const nameMap: Record<string, string> = {}
      studentData?.forEach((s: any) => { nameMap[s.id] = s.full_name })

      const dateParts: string[] = Array.from(new Set<string>(data.map((r: any) => `${r.date}__${r.part}`)))
        .sort((a: string, b: string) => {
          const [da, pa] = a.split('__'); const [db, pb] = b.split('__')
          return da === db ? Number(pa) - Number(pb) : da.localeCompare(db)
        })

      const studentIds: string[] = Array.from(new Set<string>(data.map((r: any) => r.student_id as string)))
      const rows: Record<string, string | number>[] = []

      studentIds.forEach(sid => {
        const row: Record<string, string | number> = { 'Student Name': nameMap[sid] ?? sid }
        let present = 0; const total = dateParts.length
        dateParts.forEach(dp => {
          const [date, part] = dp.split('__')
          const rec = data.find((r: any) => r.student_id === sid && r.date === date && String(r.part) === part)
          const status: string = (rec?.status as string) ?? '—'
          const partLabel = PARTS.find(p => p.id === Number(part))?.label ?? `Part ${part}`
          row[`${date} ${partLabel}`] = status
          if (status === 'PRESENT') present++
        })
        row['Present'] = present; row['Total'] = total
        row['%'] = total > 0 ? Math.round(present / total * 100) + '%' : '—'
        rows.push(row)
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Day Attendance')
      XLSX.writeFile(wb, `DayAttendance_${section}.xlsx`)
      setSaveMsg(`✓ Exported ${rows.length} students`)
    } catch (err: any) {
      setSaveMsg('Export failed: ' + (err?.message ?? 'Unknown error'))
    } finally {
      setExporting(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  const exportXLSX = async () => {
    if (!selectedSubject) return
    setExporting(true)
    setSaveMsg('')
    try {
      let query = supabase.from('attendance').select('*')
        .eq('subject_id', selectedSubject.id).order('date') as any
      if (exportFrom) query = query.gte('date', exportFrom)
      if (exportTo)   query = query.lte('date', exportTo)
      const { data, error } = await query

      if (error) { setSaveMsg('Export error: ' + error.message); return }
      if (!data?.length) { setSaveMsg('No data found for selected range'); return }

      const studentIds: string[] = Array.from(new Set<string>(data.map((r: any) => r.student_id as string)))
      const { data: profileData } = await supabase
        .from('profiles').select('id, full_name').in('id', studentIds)
      const nameMap: Record<string, string> = {}
      profileData?.forEach((p: any) => { nameMap[p.id] = p.full_name })

      const dates: string[] = [...new Set<string>(data.map((r: any) => r.date as string))].sort()
      const rows: Record<string, string | number>[] = []

      studentIds.forEach(sid => {
        const row: Record<string, string | number> = { 'Student Name': nameMap[sid] ?? sid }
        let present = 0; const total = dates.length
        dates.forEach(date => {
          const rec = data.find((r: any) => r.student_id === sid && r.date === date)
          const status: string = (rec?.status as string) ?? '—'
          row[date] = status
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
      setSaveMsg(`✓ Exported ${rows.length} students`)
    } catch (err: any) {
      setSaveMsg('Export failed: ' + (err?.message ?? 'Unknown error'))
    } finally {
      setExporting(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
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
              { label: 'Absent',        value: attendance.filter(a => (a.status as string) === 'ABSENT_ON_NO_INFO' || (a.status as string) === 'ABSENT').length },
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
                    <span className={`font-mono text-xs px-2 py-1 rounded border ${STATUS_COLORS[a.status as keyof typeof STATUS_COLORS] ?? ''}`}>{a.status}</span>
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
                  <span className="flex items-center gap-2 font-mono text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>
            )}

            {/* Export + Lock (day mode) */}
            {activeMode === 'day' && (selectedSubject?.section ?? selectedSection) && (
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
                <button onClick={exportDayXLSX} disabled={exporting}
                  className="flex items-center gap-2 h-9 px-3 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export XLSX
                </button>
                {isHOD && (
                  <button onClick={() => dayLocked ? toggleDayLock() : setShowDayLockModal(true)}
                    className={`flex items-center gap-2 h-9 px-3 font-mono text-xs rounded transition-colors ${dayLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white'}`}>
                    {dayLocked ? <><Unlock className="w-3 h-3" /> Unlock</> : <><Lock className="w-3 h-3" /> Lock</>}
                  </button>
                )}
                {dayLocked && (
                  <span className="flex items-center gap-2 font-mono text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Lock modal (subject mode) */}
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

          {/* Lock modal (day mode) */}
          {showDayLockModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4">
                <span className="font-mono text-xs text-primary">// LOCK DAY ATTENDANCE</span>
                <h2 className="font-bold text-sm">{selectedSubject?.section ?? selectedSection}</h2>
                <input type="text" value={dayLockReason} onChange={e => setDayLockReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
                <div className="flex gap-3">
                  <button onClick={toggleDayLock} className="flex-1 h-10 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" /> Confirm Lock
                  </button>
                  <button onClick={() => setShowDayLockModal(false)} className="flex-1 h-10 bg-accent font-mono text-xs rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── DAY ATTENDANCE MODE ── */}
          {activeMode === 'day' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {PARTS.map(part => (
                  <button key={part.id} onClick={() => setActivePart(part.id as 1|2|3)}
                    className={`flex items-center gap-2 px-4 py-2 font-mono text-xs rounded border transition-all ${activePart === part.id ? part.color + ' font-bold' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    <Clock className="w-3 h-3" />
                    {part.label} · {part.time}
                    <span className="text-muted-foreground text-xs">P{part.periods[0]}–P{part.periods[part.periods.length-1]}</span>
                  </button>
                ))}
              </div>

              {students.length > 0 ? (
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
                        students.forEach(s => { if (!next[s.id]) next[s.id] = {}; next[s.id][activePart] = 'PRESENT' })
                        setDayAttendance(next)
                      }} className="font-mono text-xs px-3 py-1.5 rounded border border-green-500/30 text-green-500 hover:bg-green-500/10">All Present</button>
                      <button onClick={() => {
                        const next = { ...dayAttendance }
                        students.forEach(s => { if (!next[s.id]) next[s.id] = {}; next[s.id][activePart] = 'ABSENT_ON_NO_INFO' })
                        setDayAttendance(next)
                      }} className="font-mono text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10">All Absent</button>
                    </div>
                  </div>

                  <div className="px-6 py-2 border-b border-border flex gap-4 font-mono text-xs">
                    <span className="text-green-500">P: {students.filter(s => (dayAttendance[s.id]?.[activePart] ?? 'PRESENT') === 'PRESENT').length}</span>
                    <span className="text-blue-500">AI: {students.filter(s => dayAttendance[s.id]?.[activePart] === 'ABSENT_ON_INFO').length}</span>
                    <span className="text-red-500">AN: {students.filter(s => dayAttendance[s.id]?.[activePart] === 'ABSENT_ON_NO_INFO').length}</span>
                    <span className="text-yellow-500">L: {students.filter(s => dayAttendance[s.id]?.[activePart] === 'LATE').length}</span>
                    <span className="text-muted-foreground ml-auto text-xs">AN → alert to meet HOD · 3 Late/month → alert</span>
                  </div>

                  <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                    {students.map((student, idx) => {
                      const status = dayAttendance[student.id]?.[activePart] ?? 'PRESENT'
                      return (
                        <div key={student.id} className="flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors">
                          <span className="font-mono text-xs text-muted-foreground w-6 text-right">{idx+1}</span>
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {student.full_name.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{student.full_name}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {(['PRESENT','ABSENT_ON_INFO','ABSENT_ON_NO_INFO','LATE'] as const).map(s => (
                              <button key={s} title={STATUS_LABELS[s]}
                                onClick={() => setDayAttendance(prev => ({ ...prev, [student.id]: { ...(prev[student.id]??{}), [activePart]: s } }))}
                                className={`font-mono text-xs px-2.5 py-1.5 rounded border transition-all ${status === s ? STATUS_COLORS[s] + ' font-bold' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                                {STATUS_SHORT[s]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                    <span className={`font-mono text-xs ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>{saveMsg}</span>
                    <button onClick={saveDayAttendance} disabled={saving || !students.length || dayLocked}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {dayLocked ? 'Locked' : saving ? 'Saving...' : `Save Part ${activePart} Attendance`}
                    </button>
                  </div>
                </div>
              ) : (
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
                      <button onClick={() => { const n: Record<string, Status4> = {}; students.forEach(s => n[s.id]='PRESENT'); setMarkingState(n) }}
                        className="font-mono text-xs px-3 py-1.5 rounded border border-green-500/30 text-green-500 hover:bg-green-500/10">All Present</button>
                      <button onClick={() => { const n: Record<string, Status4> = {}; students.forEach(s => n[s.id]='ABSENT_ON_NO_INFO'); setMarkingState(n) }}
                        className="font-mono text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10">All Absent</button>
                    </div>
                  )}
                </div>

                <div className="px-6 py-2 border-b border-border flex gap-4 font-mono text-xs">
                  <span className="text-green-500">P: {Object.values(markingState).filter(v=>v==='PRESENT').length}</span>
                  <span className="text-blue-500">AI: {Object.values(markingState).filter(v=>v==='ABSENT_ON_INFO').length}</span>
                  <span className="text-red-500">AN: {Object.values(markingState).filter(v=>v==='ABSENT_ON_NO_INFO').length}</span>
                  <span className="text-yellow-500">L: {Object.values(markingState).filter(v=>v==='LATE').length}</span>
                  <span className="text-muted-foreground ml-auto text-xs">AN → alert to meet HOD · 3 Late/month → alert</span>
                </div>

                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {students.map((student, idx) => {
                    const status = markingState[student.id] ?? null
                    return (
                      <div key={student.id} className="flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors">
                        <span className="font-mono text-xs text-muted-foreground w-6 text-right">{idx+1}</span>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {student.full_name.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.full_name}</p>
                          <p className="font-mono text-xs text-muted-foreground truncate">{student.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {(['PRESENT','ABSENT_ON_INFO','ABSENT_ON_NO_INFO','LATE'] as const).map(s => (
                            <button key={s} disabled={isLocked} title={STATUS_LABELS[s]}
                              onClick={() => !isLocked && setMarkingState(prev => ({ ...prev, [student.id]: s }))}
                              className={`font-mono text-xs px-2.5 py-1.5 rounded border transition-all ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${status === s ? STATUS_COLORS[s]+' font-bold' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                              {STATUS_SHORT[s]}
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