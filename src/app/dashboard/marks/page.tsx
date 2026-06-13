"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, BarChart3, Download, Lock, Unlock } from "lucide-react"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']

// Course type detection
type CourseType = 'THEORY' | 'LAB_INTEGRATED' | 'LAB' | 'FORMATION'

function getCourseType(subject: Subject): CourseType {
  const code = subject.code
  // Lab only courses end in 21,22 etc with 0 credits theory
  if (code.startsWith('CS24321') || code.startsWith('CS24322') ||
      code.startsWith('CS24421') || code.startsWith('CS24422') ||
      code.startsWith('CY24121') || code.startsWith('PH24121') ||
      code.startsWith('GE24121') || code.startsWith('GE24122') ||
      code.startsWith('CS24221') || code.startsWith('CS24721') ||
      code.startsWith('CS24821')) return 'LAB'
  // Lab integrated (has both theory and lab periods)
  if (code.startsWith('GE24112') || code.startsWith('GE24111') ||
      code.startsWith('CS24311') || code.startsWith('CS24312') ||
      code.startsWith('CS24411') || code.startsWith('CS24412') ||
      code.startsWith('CS24413') || code.startsWith('CS24511') ||
      code.startsWith('CS24512') || code.startsWith('CS24611') ||
      code.startsWith('CS24612') || code.startsWith('CS24613') ||
      code.startsWith('CS24711')) return 'LAB_INTEGRATED'
  // Formation courses
  if (code.startsWith('FC') || code.startsWith('BS24321') ||
      code.startsWith('GE24503') || code.startsWith('BS24502') ||
      code.startsWith('GE24622') || code.startsWith('CS24423') ||
      code.startsWith('GE24621') || code.startsWith('CS24722') ||
      code.startsWith('HS24321')) return 'FORMATION'
  return 'THEORY'
}

// CIA component structure per course type
interface CIAComponents {
  ct: number        // Concept Test /30
  cat: number       // Continuous Assessment Test /60
  activity: number  // Activity based /10 (assignment/seminar etc)
}

interface LabCIAComponents {
  experiments: number  // /25
  record: number       // /25
  viva: number         // /25
  labAssessment: number // /25
}

interface MarksEntry {
  studentId: string
  cia1: CIAComponents
  cia2: CIAComponents
  labCia1?: LabCIAComponents
  labCia2?: LabCIAComponents
  semesterEnd: number
  // Computed
  cia1Total?: number
  cia2Total?: number
  internalTotal?: number
  total?: number
  grade?: string
  gradePoint?: number
}

// Grade computation
function computeGrade(total: number): { grade: string; point: number } {
  if (total >= 91) return { grade: 'O',  point: 10 }
  if (total >= 81) return { grade: 'A+', point: 9 }
  if (total >= 71) return { grade: 'A',  point: 8 }
  if (total >= 61) return { grade: 'B+', point: 7 }
  if (total >= 56) return { grade: 'B',  point: 6 }
  if (total >= 50) return { grade: 'C',  point: 5 }
  return { grade: 'U', point: 0 }
}

// Theory: CIA = (CIA1_total + CIA2_total) / 200 * 40
function computeTheoryCIA(cia1: CIAComponents, cia2: CIAComponents): number {
  const cia1Total = (cia1.ct / 30 * 20) + (cia1.cat / 60 * 40) + (cia1.activity / 10 * 40)
  const cia2Total = (cia2.ct / 30 * 20) + (cia2.cat / 60 * 40) + (cia2.activity / 10 * 40)
  return Math.round((cia1Total + cia2Total) / 2 / 100 * 40)
}

// Lab: CIA = (Lab1 + Lab2) / 200 * 60
function computeLabCIA(lab1: LabCIAComponents, lab2: LabCIAComponents): number {
  const lab1Total = (lab1.experiments + lab1.record + lab1.viva + lab1.labAssessment)
  const lab2Total = (lab2.experiments + lab2.record + lab2.viva + lab2.labAssessment)
  return Math.round((lab1Total + lab2Total) / 2 / 100 * 60)
}

const GRADE_COLORS: Record<string, string> = {
  'O':  'text-green-500 bg-green-500/10',
  'A+': 'text-emerald-500 bg-emerald-500/10',
  'A':  'text-blue-500 bg-blue-500/10',
  'B+': 'text-cyan-500 bg-cyan-500/10',
  'B':  'text-yellow-500 bg-yellow-500/10',
  'C':  'text-orange-500 bg-orange-500/10',
  'U':  'text-red-500 bg-red-500/10',
}

const defaultCIA = (): CIAComponents => ({ ct: 0, cat: 0, activity: 0 })
const defaultLabCIA = (): LabCIAComponents => ({ experiments: 0, record: 0, viva: 0, labAssessment: 0 })

export default function MarksPage() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [subjects, setSubjects]     = useState<Subject[]>([])
  const [students, setStudents]     = useState<Profile[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const [marksData, setMarksData]   = useState<Record<string, MarksEntry>>({})
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [isLocked, setIsLocked]     = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockReason, setLockReason]   = useState('')
  const [exporting, setExporting]     = useState(false)
  const [activeTab, setActiveTab]   = useState<'cia1'|'cia2'|'sem'|'summary'>('cia1')

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'

  const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
  const currentSem = (section: string) =>
    section.startsWith('I ') ? 2 : section.startsWith('II ') ? 4 : 6

  // Auth
  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  // Load subjects
  useEffect(() => {
    if (!authUser) return
    let query = supabase.from('subjects').select('*').order('semester').order('name')
    if (isStudent) {
      const section = (authUser.data as { section?: string })?.section ?? ''
      query = query.eq('section', section).eq('semester', currentSem(section))
    } else if (selectedSection) {
      query = query.eq('section', selectedSection)
    }
    // Faculty/HOD with no section selected — load all subjects
    query.then(({ data }) => { if (data) setSubjects(data) })
  }, [authUser, isStudent, selectedSection])

  // Load students
  useEffect(() => {
    const section = selectedSubject?.section ?? selectedSection
    if (!section || isStudent) return
    supabase.from('profiles').select('*').eq('role', 'STUDENT').eq('section', section).order('full_name')
      .then(({ data }) => { if (data) setStudents(data) })
  }, [selectedSubject, selectedSection, isStudent])

  // Load existing marks from DB
  const loadMarks = useCallback(async () => {
    if (!selectedSubject) return
    const { data } = await supabase.from('marks').select('*').eq('subject_id', selectedSubject.id)
    if (!data) return

    const entries: Record<string, MarksEntry> = {}
    // Group by student
    students.forEach(s => {
      const studentMarks = data.filter(m => m.student_id === s.id)
      const get = (type: string) => studentMarks.find(m => m.exam_type === type)?.marks_obtained ?? 0

      const cia1: CIAComponents = {
        ct: get('CIA1_CT'), cat: get('CIA1_CAT'), activity: get('CIA1_ACTIVITY')
      }
      const cia2: CIAComponents = {
        ct: get('CIA2_CT'), cat: get('CIA2_CAT'), activity: get('CIA2_ACTIVITY')
      }
      const labCia1: LabCIAComponents = {
        experiments: get('CIA1_EXP'), record: get('CIA1_RECORD'),
        viva: get('CIA1_VIVA'), labAssessment: get('CIA1_LAB')
      }
      const labCia2: LabCIAComponents = {
        experiments: get('CIA2_EXP'), record: get('CIA2_RECORD'),
        viva: get('CIA2_VIVA'), labAssessment: get('CIA2_LAB')
      }
      const semesterEnd = get('SEM_END')
      entries[s.id] = { studentId: s.id, cia1, cia2, labCia1, labCia2, semesterEnd }
    })
    setMarksData(entries)
  }, [selectedSubject, students])

  useEffect(() => { loadMarks() }, [loadMarks])

  // Check lock status
  useEffect(() => {
    if (!selectedSubject) return
    supabase.from('subject_locks' as any)
      .select('*')
      .eq('subject_id', selectedSubject.id)
      .in('lock_type', ['MARKS', 'BOTH'])
      .then(({ data }: { data: any[] | null }) => {
        setIsLocked(!!(data && data.length > 0))
      })
  }, [selectedSubject])

  // Toggle lock
  const toggleLock = async () => {
    if (!selectedSubject || !profile) return
    if (isLocked) {
      await (supabase.from('subject_locks' as any) as any)
        .delete()
        .eq('subject_id', selectedSubject.id)
        .in('lock_type', ['MARKS', 'BOTH'])
      setIsLocked(false)
      setSaveMsg('✓ Marks unlocked')
    } else {
      await (supabase.from('subject_locks' as any) as any).insert({
        subject_id: selectedSubject.id,
        lock_type: 'MARKS',
        locked_by: profile.id,
        reason: lockReason || 'Locked by HOD'
      })
      setIsLocked(true)
      setShowLockModal(false)
      setSaveMsg('✓ Marks locked — faculty cannot edit')
    }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  // Export XLSX
  const exportXLSX = async () => {
    if (!selectedSubject) return
    setExporting(true)
    const ct = getCourseType(selectedSubject)

    const { data: marksRaw } = await supabase.from('marks')
      .select('*, profiles!student_id(full_name, email)')
      .eq('subject_id', selectedSubject.id) as any

    if (!marksRaw || !marksRaw.length) {
      setExporting(false); setSaveMsg('No marks data to export'); return
    }

    const rows: any[] = students.map((s, idx) => {
      const entry = marksData[s.id] ?? {
        studentId: s.id, cia1: defaultCIA(), cia2: defaultCIA(),
        labCia1: defaultLabCIA(), labCia2: defaultLabCIA(), semesterEnd: 0
      }
      const { internal, total, grade, gradePoint } = computeTotals(entry, ct)
      const row: any = {
        'S.No': idx + 1,
        'Student Name': s.full_name,
        'Email': s.email,
      }
      if (ct === 'THEORY' || ct === 'LAB_INTEGRATED') {
        row['CIA1 CT(/30)']       = entry.cia1.ct
        row['CIA1 CAT(/60)']      = entry.cia1.cat
        row['CIA1 Activity(/10)'] = entry.cia1.activity
        row['CIA2 CT(/30)']       = entry.cia2.ct
        row['CIA2 CAT(/60)']      = entry.cia2.cat
        row['CIA2 Activity(/10)'] = entry.cia2.activity
      }
      if (ct === 'LAB' || ct === 'LAB_INTEGRATED') {
        const l1 = entry.labCia1 ?? defaultLabCIA()
        const l2 = entry.labCia2 ?? defaultLabCIA()
        row['CIA1 Exp(/25)']  = l1.experiments
        row['CIA1 Rec(/25)']  = l1.record
        row['CIA1 Viva(/25)'] = l1.viva
        row['CIA1 Lab(/25)']  = l1.labAssessment
        row['CIA2 Exp(/25)']  = l2.experiments
        row['CIA2 Rec(/25)']  = l2.record
        row['CIA2 Viva(/25)'] = l2.viva
        row['CIA2 Lab(/25)']  = l2.labAssessment
      }
      row['Internal']    = internal
      row['SEE']         = entry.semesterEnd
      row['Total']       = total
      row['Grade']       = grade
      row['Grade Point'] = gradePoint
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    ws['!cols'] = [
      { wch: 5 }, { wch: 25 }, { wch: 30 },
      ...Array(Object.keys(rows[0] ?? {}).length - 3).fill({ wch: 14 })
    ]
    const filename = `Marks_${selectedSubject.code}_${selectedSubject.section}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, filename)
    setExporting(false)
    setSaveMsg(`✓ Exported ${rows.length} students`)
    setTimeout(() => setSaveMsg(''), 4000)
  }

  // Initialize empty entries for new students
  useEffect(() => {
    if (!students.length || isStudent) return
    setMarksData(prev => {
      const next = { ...prev }
      students.forEach(s => {
        if (!next[s.id]) {
          next[s.id] = {
            studentId: s.id,
            cia1: defaultCIA(), cia2: defaultCIA(),
            labCia1: defaultLabCIA(), labCia2: defaultLabCIA(),
            semesterEnd: 0
          }
        }
      })
      return next
    })
  }, [students, isStudent])

  // Compute totals
  const computeTotals = (entry: MarksEntry, courseType: CourseType) => {
    if (courseType === 'THEORY') {
      const internal = computeTheoryCIA(entry.cia1, entry.cia2)
      const total = internal + entry.semesterEnd
      const { grade, point: gradePoint } = computeGrade(total)
      return { internal, total, grade, gradePoint }
    }
    if (courseType === 'LAB') {
      const internal = computeLabCIA(entry.labCia1 ?? defaultLabCIA(), entry.labCia2 ?? defaultLabCIA())
      const total = internal + entry.semesterEnd
      const { grade, point: gradePoint } = computeGrade(total)
      return { internal, total, grade, gradePoint }
    }
    if (courseType === 'LAB_INTEGRATED') {
      const theoryInternal = computeTheoryCIA(entry.cia1, entry.cia2)
      const labInternal = computeLabCIA(entry.labCia1 ?? defaultLabCIA(), entry.labCia2 ?? defaultLabCIA())
      const internal = Math.round((theoryInternal + labInternal) / 2)
      const total = internal + entry.semesterEnd
      const { grade, point: gradePoint } = computeGrade(total)
      return { internal, total, grade, gradePoint }
    }
    return { internal: 0, total: 0, grade: '—', gradePoint: 0 }
  }

  const updateMark = (studentId: string, field: string, value: number) => {
    setMarksData(prev => {
      const entry = prev[studentId] ?? {
        studentId, cia1: defaultCIA(), cia2: defaultCIA(),
        labCia1: defaultLabCIA(), labCia2: defaultLabCIA(), semesterEnd: 0
      }
      const parts = field.split('.')
      if (parts.length === 2) {
        const [group, key] = parts
        return {
          ...prev,
          [studentId]: {
            ...entry,
            [group]: { ...(entry[group as keyof MarksEntry] as object), [key]: value }
          }
        }
      }
      return { ...prev, [studentId]: { ...entry, [field]: value } }
    })
  }

  const saveMarks = async () => {
    if (!selectedSubject || !profile) return
    setSaving(true)
    setSaveMsg('')
    const courseType = getCourseType(selectedSubject)

    const records: Array<{
      student_id: string; subject_id: string; faculty_id: string;
      exam_type: string; marks_obtained: number; max_marks: number
    }> = []

    students.forEach(s => {
      const entry = marksData[s.id]
      if (!entry) return
      const base = { student_id: s.id, subject_id: selectedSubject.id, faculty_id: profile.id }

      if (courseType === 'THEORY' || courseType === 'LAB_INTEGRATED') {
        records.push({ ...base, exam_type: 'CIA1_CT',       marks_obtained: entry.cia1.ct,       max_marks: 30 })
        records.push({ ...base, exam_type: 'CIA1_CAT',      marks_obtained: entry.cia1.cat,      max_marks: 60 })
        records.push({ ...base, exam_type: 'CIA1_ACTIVITY', marks_obtained: entry.cia1.activity, max_marks: 10 })
        records.push({ ...base, exam_type: 'CIA2_CT',       marks_obtained: entry.cia2.ct,       max_marks: 30 })
        records.push({ ...base, exam_type: 'CIA2_CAT',      marks_obtained: entry.cia2.cat,      max_marks: 60 })
        records.push({ ...base, exam_type: 'CIA2_ACTIVITY', marks_obtained: entry.cia2.activity, max_marks: 10 })
      }
      if (courseType === 'LAB' || courseType === 'LAB_INTEGRATED') {
        const l1 = entry.labCia1 ?? defaultLabCIA()
        const l2 = entry.labCia2 ?? defaultLabCIA()
        records.push({ ...base, exam_type: 'CIA1_EXP',    marks_obtained: l1.experiments,  max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA1_RECORD', marks_obtained: l1.record,        max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA1_VIVA',   marks_obtained: l1.viva,          max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA1_LAB',    marks_obtained: l1.labAssessment, max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA2_EXP',    marks_obtained: l2.experiments,  max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA2_RECORD', marks_obtained: l2.record,        max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA2_VIVA',   marks_obtained: l2.viva,          max_marks: 25 })
        records.push({ ...base, exam_type: 'CIA2_LAB',    marks_obtained: l2.labAssessment, max_marks: 25 })
      }
      records.push({ ...base, exam_type: 'SEM_END', marks_obtained: entry.semesterEnd,
        max_marks: courseType === 'THEORY' ? 60 : courseType === 'LAB' ? 40 : 50 })
    })

    const { error } = await supabase.from('marks').upsert(records, {
      onConflict: 'student_id,subject_id,exam_type'
    })

    setSaving(false)
    if (error) setSaveMsg('Error: ' + error.message)
    else {
      setSaveMsg(`✓ Marks saved for ${students.length} students`)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  // Student view — load own marks
  const [myMarks, setMyMarks] = useState<Record<string, Record<string, number>>>({})
  useEffect(() => {
    if (!isStudent || !profile) return
    supabase.from('marks').select('*, subjects(*)').eq('student_id', profile.id)
      .then(({ data }) => {
        if (!data) return
        const grouped: Record<string, Record<string, number>> = {}
        data.forEach((m: { subject_id: string; exam_type: string; marks_obtained: number }) => {
          if (!grouped[m.subject_id]) grouped[m.subject_id] = {}
          grouped[m.subject_id][m.exam_type] = Number(m.marks_obtained)
        })
        setMyMarks(grouped)
      })
  }, [isStudent, profile])

  const courseType = selectedSubject ? getCourseType(selectedSubject) : 'THEORY'

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: MARKS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Marks & Grades</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          LICET R2024 — CT(/30)→20% · CAT(/60)→40% · Activity(/10)→40% · CIA×2→40 · SEE→60
        </p>
      </div>

      {/* ── STUDENT VIEW ── */}
      {isStudent && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-mono text-xs text-primary">// YOUR MARKS</span>
              <h2 className="font-bold text-sm mt-1">Current Semester Performance</h2>
            </div>
            {subjects.length === 0 ? (
              <div className="px-6 py-12 text-center font-mono text-sm text-muted-foreground">No subjects found</div>
            ) : subjects.map(subject => {
              const sm = myMarks[subject.id] ?? {}
              const ct = getCourseType(subject)
              let internal = 0, semEnd = sm['SEM_END'] ?? 0, total = 0

              if (ct === 'THEORY') {
                const cia1: CIAComponents = { ct: sm['CIA1_CT']??0, cat: sm['CIA1_CAT']??0, activity: sm['CIA1_ACTIVITY']??0 }
                const cia2: CIAComponents = { ct: sm['CIA2_CT']??0, cat: sm['CIA2_CAT']??0, activity: sm['CIA2_ACTIVITY']??0 }
                internal = computeTheoryCIA(cia1, cia2)
              } else if (ct === 'LAB') {
                const l1: LabCIAComponents = { experiments: sm['CIA1_EXP']??0, record: sm['CIA1_RECORD']??0, viva: sm['CIA1_VIVA']??0, labAssessment: sm['CIA1_LAB']??0 }
                const l2: LabCIAComponents = { experiments: sm['CIA2_EXP']??0, record: sm['CIA2_RECORD']??0, viva: sm['CIA2_VIVA']??0, labAssessment: sm['CIA2_LAB']??0 }
                internal = computeLabCIA(l1, l2)
              }
              total = internal + semEnd
              const hasData = Object.keys(sm).length > 0
              const { grade } = computeGrade(total)

              return (
                <div key={subject.id} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                    <p className="text-sm font-medium truncate">{subject.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{ct} · {subject.credits}cr</p>
                  </div>
                  {hasData ? (
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">Internal</p>
                        <p className="font-mono text-sm font-bold">{internal}/{ct==='LAB'?60:40}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">SEE</p>
                        <p className="font-mono text-sm font-bold">{semEnd}/{ct==='THEORY'?60:ct==='LAB'?40:50}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">Total</p>
                        <p className="font-mono text-sm font-bold">{total}</p>
                      </div>
                      <span className={`font-mono text-sm font-bold px-2 py-1 rounded ${GRADE_COLORS[grade] ?? ''}`}>{grade}</span>
                    </div>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">No marks entered</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── FACULTY / HOD VIEW ── */}
      {(isFaculty || isHOD) && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isHOD && (
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Section</label>
                  <select value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setSelectedSubject(null) }}
                    className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    <option value="">All sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Subject</label>
                <select value={selectedSubject?.id ?? ''} onChange={e => {
                  const s = subjects.find(s => s.id === e.target.value) ?? null
                  setSelectedSubject(s); setMarksData({})
                }} className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                  <option value="">Select subject...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>[{s.section}] {s.code} – {s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Export + Lock bar */}
            {selectedSubject && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
                <button onClick={exportXLSX} disabled={exporting || !students.length}
                  className="flex items-center gap-2 h-9 px-3 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export XLSX
                </button>
                {isHOD && (
                  <button onClick={() => isLocked ? toggleLock() : setShowLockModal(true)}
                    className={`flex items-center gap-2 h-9 px-3 font-mono text-xs rounded transition-colors ${isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white'}`}>
                    {isLocked ? <><Unlock className="w-3 h-3" /> Unlock Marks</> : <><Lock className="w-3 h-3" /> Lock Marks</>}
                  </button>
                )}
                {isLocked && (
                  <div className="flex items-center gap-2 font-mono text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded">
                    <Lock className="w-3 h-3" /> Marks locked — editing disabled
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lock modal */}
          {showLockModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4">
                <div>
                  <span className="font-mono text-xs text-primary">// LOCK MARKS</span>
                  <h2 className="font-bold text-sm mt-1">Lock {selectedSubject?.name}</h2>
                  <p className="font-mono text-xs text-muted-foreground mt-1">Faculty cannot edit marks after locking.</p>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Reason (optional)</label>
                  <input type="text" value={lockReason} onChange={e => setLockReason(e.target.value)}
                    placeholder="e.g. CIA 1 finalized"
                    className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={toggleLock}
                    className="flex-1 h-10 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" /> Confirm Lock
                  </button>
                  <button onClick={() => setShowLockModal(false)}
                    className="flex-1 h-10 bg-accent font-mono text-xs rounded hover:bg-accent/80">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedSubject && (
            <div className="bg-card border border-border rounded-lg">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs text-primary">// MARKS ENTRY</span>
                    <h2 className="font-bold text-sm mt-1">{selectedSubject.code} — {selectedSubject.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selectedSubject.section} · {courseType} · {students.length} students
                    </p>
                  </div>
                  <div className="font-mono text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded">
                    {courseType}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                  {(['cia1','cia2','sem','summary'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`font-mono text-xs px-3 py-1.5 rounded transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                      {tab === 'cia1' ? 'CIA 1' : tab === 'cia2' ? 'CIA 2' : tab === 'sem' ? 'SEE' : 'Summary'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column headers */}
              <div className="px-6 py-2 border-b border-border bg-accent/30 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className="w-6">#</span>
                <span className="flex-1">Student</span>
                {activeTab === 'cia1' || activeTab === 'cia2' ? (
                  <>
                    {(courseType === 'THEORY' || courseType === 'LAB_INTEGRATED') && (
                      <>
                        <span className="w-16 text-center">CT /30</span>
                        <span className="w-16 text-center">CAT /60</span>
                        <span className="w-16 text-center">Act /10</span>
                        <span className="w-16 text-center">→/100</span>
                      </>
                    )}
                    {(courseType === 'LAB' || courseType === 'LAB_INTEGRATED') && (
                      <>
                        <span className="w-14 text-center">Exp /25</span>
                        <span className="w-14 text-center">Rec /25</span>
                        <span className="w-14 text-center">Viva /25</span>
                        <span className="w-14 text-center">Lab /25</span>
                        <span className="w-16 text-center">→/100</span>
                      </>
                    )}
                  </>
                ) : activeTab === 'sem' ? (
                  <span className="w-24 text-center">
                    SEE /{courseType === 'THEORY' ? 60 : courseType === 'LAB' ? 40 : 50}
                  </span>
                ) : (
                  <>
                    <span className="w-16 text-center">Internal</span>
                    <span className="w-16 text-center">SEE</span>
                    <span className="w-16 text-center">Total</span>
                    <span className="w-12 text-center">Grade</span>
                    <span className="w-12 text-center">GP</span>
                  </>
                )}
              </div>

              {/* Student rows */}
              <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                {students.length === 0 ? (
                  <div className="px-6 py-12 text-center font-mono text-sm text-muted-foreground">No students found</div>
                ) : students.map((student, idx) => {
                  const entry = marksData[student.id] ?? {
                    studentId: student.id, cia1: defaultCIA(), cia2: defaultCIA(),
                    labCia1: defaultLabCIA(), labCia2: defaultLabCIA(), semesterEnd: 0
                  }
                  const { internal, total, grade, gradePoint } = computeTotals(entry, courseType)

                  const cia = activeTab === 'cia1' ? entry.cia1 : entry.cia2
                  const labCia = activeTab === 'cia1' ? (entry.labCia1 ?? defaultLabCIA()) : (entry.labCia2 ?? defaultLabCIA())
                  const ciaPrefix = activeTab === 'cia1' ? 'cia1' : 'cia2'
                  const labPrefix = activeTab === 'cia1' ? 'labCia1' : 'labCia2'

                  const ciaSubtotal = Math.round((cia.ct / 30 * 20) + (cia.cat / 60 * 40) + (cia.activity / 10 * 40))
                  const labSubtotal = labCia.experiments + labCia.record + labCia.viva + labCia.labAssessment

                  const numInput = (field: string, value: number, max: number) => (
                    <input type="number" min={0} max={max} value={value || ''}
                      onChange={e => updateMark(student.id, field, Math.min(max, Math.max(0, Number(e.target.value))))}
                      className="w-full h-7 px-1 bg-background border border-border rounded font-mono text-xs text-center focus:border-primary focus:outline-none"
                      placeholder="0"
                    />
                  )

                  return (
                    <div key={student.id} className="flex items-center gap-2 px-6 py-2 hover:bg-accent/20 transition-colors">
                      <span className="font-mono text-xs text-muted-foreground w-6 text-right flex-shrink-0">{idx+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{student.full_name}</p>
                      </div>

                      {(activeTab === 'cia1' || activeTab === 'cia2') && (
                        <>
                          {(courseType === 'THEORY' || courseType === 'LAB_INTEGRATED') && (
                            <>
                              <div className="w-16">{numInput(`${ciaPrefix}.ct`, cia.ct, 30)}</div>
                              <div className="w-16">{numInput(`${ciaPrefix}.cat`, cia.cat, 60)}</div>
                              <div className="w-16">{numInput(`${ciaPrefix}.activity`, cia.activity, 10)}</div>
                              <div className="w-16 text-center font-mono text-xs font-bold text-primary">{ciaSubtotal}</div>
                            </>
                          )}
                          {(courseType === 'LAB' || courseType === 'LAB_INTEGRATED') && (
                            <>
                              <div className="w-14">{numInput(`${labPrefix}.experiments`, labCia.experiments, 25)}</div>
                              <div className="w-14">{numInput(`${labPrefix}.record`, labCia.record, 25)}</div>
                              <div className="w-14">{numInput(`${labPrefix}.viva`, labCia.viva, 25)}</div>
                              <div className="w-14">{numInput(`${labPrefix}.labAssessment`, labCia.labAssessment, 25)}</div>
                              <div className="w-16 text-center font-mono text-xs font-bold text-primary">{labSubtotal}</div>
                            </>
                          )}
                        </>
                      )}

                      {activeTab === 'sem' && (
                        <div className="w-24">
                          {numInput('semesterEnd', entry.semesterEnd,
                            courseType === 'THEORY' ? 60 : courseType === 'LAB' ? 40 : 50)}
                        </div>
                      )}

                      {activeTab === 'summary' && (
                        <>
                          <div className="w-16 text-center font-mono text-xs font-bold">{internal}</div>
                          <div className="w-16 text-center font-mono text-xs">{entry.semesterEnd}</div>
                          <div className="w-16 text-center font-mono text-xs font-bold">{total}</div>
                          <div className={`w-12 text-center font-mono text-xs font-bold px-1 py-0.5 rounded ${GRADE_COLORS[grade] ?? ''}`}>{grade}</div>
                          <div className="w-12 text-center font-mono text-xs">{gradePoint}</div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Save bar */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <div className="space-y-0.5">
                  {saveMsg && <span className={`font-mono text-xs ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>{saveMsg}</span>}
                  {activeTab === 'summary' && students.length > 0 && (
                    <div className="font-mono text-xs text-muted-foreground">
                      Class avg: {Math.round(
                        students.reduce((sum, s) => sum + (computeTotals(marksData[s.id] ?? { studentId: s.id, cia1: defaultCIA(), cia2: defaultCIA(), labCia1: defaultLabCIA(), labCia2: defaultLabCIA(), semesterEnd: 0 }, courseType).total), 0) / students.length
                      )}/100
                    </div>
                  )}
                </div>
                <button onClick={saveMarks} disabled={saving || !students.length || isLocked}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {isLocked ? 'Locked' : saving ? 'Saving...' : 'Save Marks'}
                </button>
              </div>
            </div>
          )}

          {!selectedSubject && (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-mono text-sm text-muted-foreground">Select a subject to enter marks</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
// Export and lock functionality added below — see exportXLSX and lock handlers
