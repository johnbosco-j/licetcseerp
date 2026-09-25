"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, BarChart3, Download, Lock, Unlock } from "lucide-react"
import * as XLSX from "xlsx"
import { courseResult, courseType as regulationCourseType, labIntegratedWeights, markSplit, type MarkMap } from "@/lib/regulations"
import { getActiveSemester } from "@/lib/semester"

type Profile = Database['public']['Tables']['profiles']['Row']
type Subject = Database['public']['Tables']['subjects']['Row']

// Course type from the R2024 curriculum (projects use the lab-style CIA components)
type CourseType = 'THEORY' | 'LAB_INTEGRATED' | 'LAB' | 'FORMATION'

function getCourseType(subject: Subject): CourseType {
  const t = regulationCourseType(subject.code)
  return t === 'PROJECT' ? 'LAB' : t
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

const TYPE_LABEL: Record<CourseType, string> = {
  THEORY: 'Theory · 40 / 60',
  LAB_INTEGRATED: 'Lab-integrated · 50 / 50',
  LAB: 'Laboratory · 60 / 40',
  FORMATION: 'Formation · 100 internal',
}

function entryToMarks(e: MarksEntry, includeSee: boolean): MarkMap {
  const m: MarkMap = {
    CIA1_CT: e.cia1.ct, CIA1_CAT: e.cia1.cat, CIA1_ACTIVITY: e.cia1.activity,
    CIA2_CT: e.cia2.ct, CIA2_CAT: e.cia2.cat, CIA2_ACTIVITY: e.cia2.activity,
    CIA1_EXP: e.labCia1?.experiments, CIA1_RECORD: e.labCia1?.record, CIA1_VIVA: e.labCia1?.viva, CIA1_LAB: e.labCia1?.labAssessment,
    CIA2_EXP: e.labCia2?.experiments, CIA2_RECORD: e.labCia2?.record, CIA2_VIVA: e.labCia2?.viva, CIA2_LAB: e.labCia2?.labAssessment,
  }
  if (includeSee) m.SEM_END = e.semesterEnd
  return m
}

const GRADE_COLORS: Record<string, string> = {
  'O':  'text-green-700 bg-green-50',
  'A+': 'text-emerald-700 bg-emerald-50',
  'A':  'text-blue-700 bg-blue-50',
  'B+': 'text-cyan-700 bg-cyan-50',
  'B':  'text-amber-700 bg-amber-50',
  'C':  'text-orange-700 bg-orange-50',
  'U':  'text-red-700 bg-red-50',
}

const FIELD_EXAM_TYPE: Record<string, string> = {
  'cia1.ct': 'CIA1_CT', 'cia1.cat': 'CIA1_CAT', 'cia1.activity': 'CIA1_ACTIVITY',
  'cia2.ct': 'CIA2_CT', 'cia2.cat': 'CIA2_CAT', 'cia2.activity': 'CIA2_ACTIVITY',
  'labCia1.experiments': 'CIA1_EXP', 'labCia1.record': 'CIA1_RECORD', 'labCia1.viva': 'CIA1_VIVA', 'labCia1.labAssessment': 'CIA1_LAB',
  'labCia2.experiments': 'CIA2_EXP', 'labCia2.record': 'CIA2_RECORD', 'labCia2.viva': 'CIA2_VIVA', 'labCia2.labAssessment': 'CIA2_LAB',
  semesterEnd: 'SEM_END',
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
  // `${studentId}|${exam_type}` for marks that exist in the DB or were typed in;
  // only these are saved, so untouched fields are not stored as zeros.
  const [entered, setEntered]       = useState<Set<string>>(new Set())
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [isLocked, setIsLocked]     = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockReason, setLockReason]   = useState('')
  const [exporting, setExporting]     = useState(false)
  const [exportingStudent, setExportingStudent] = useState(false)
  const [exportStudentId, setExportStudentId]   = useState('')
  const [activeTab, setActiveTab]   = useState<'cia1'|'cia2'|'sem'|'summary'>('cia1')

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'

  const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
  const currentSem = (section: string): number => getActiveSemester(section)

  // Auth
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

  // Load subjects
  useEffect(() => {
    if (!authUser) return
    let query = supabase.from('subjects').select('*').order('semester').order('name')
    if (isStudent) {
      if (!profile) return // wait for live profile before querying with a possibly-stale section
      const section = profile.section ?? (authUser.data as { section?: string })?.section ?? ''
      query = query.eq('section', section).eq('semester', currentSem(section))
    } else if (selectedSection) {
      query = query.eq('section', selectedSection)
    }
    // Faculty/HOD with no section selected — load all subjects
    query.then(({ data, error }) => {
      if (error) { console.error('Failed to load subjects', error); return }
      if (data) setSubjects(data)
    })
  }, [authUser, profile, isStudent, selectedSection])

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
    setEntered(new Set(data.map(m => `${m.student_id}|${m.exam_type}`)))
    // Group by student
    students.forEach(s => {
      const studentMarks = data.filter(m => m.student_id === s.id)
      // numeric columns arrive as strings ("45.00")
      const get = (type: string) => Number(studentMarks.find(m => m.exam_type === type)?.marks_obtained ?? 0)

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
      const hasSee = marksRaw.some((m: any) => m.student_id === s.id && m.exam_type === 'SEM_END')
      const { internal, total, grade, gradePoint } = computeTotals(entry, selectedSubject.code, hasSee)
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

  // Export all-subject marks for a single student (student-wise report)
  const exportStudentXLSX = async () => {
    const student = students.find(s => s.id === exportStudentId)
    if (!student) return
    setExportingStudent(true)

    // All subjects for this student's section + current semester
    const sem = currentSem(student.section ?? '')
    const { data: subs } = await supabase.from('subjects').select('*')
      .eq('section', student.section ?? '').eq('semester', sem).order('code')

    if (!subs || !subs.length) {
      setExportingStudent(false); setSaveMsg('No subjects found for this student'); return
    }

    const { data: marksRaw } = await supabase.from('marks')
      .select('*').eq('student_id', student.id)
      .in('subject_id', subs.map(s => s.id)) as any

    const rows = subs.map(sub => {
      const ct = getCourseType(sub)
      const subjectMarks = (marksRaw ?? []).filter((m: any) => m.subject_id === sub.id)
      const get = (type: string) => Number(subjectMarks.find((m: any) => m.exam_type === type)?.marks_obtained ?? 0)

      const entry: MarksEntry = {
        studentId: student.id,
        cia1: { ct: get('CIA1_CT'), cat: get('CIA1_CAT'), activity: get('CIA1_ACTIVITY') },
        cia2: { ct: get('CIA2_CT'), cat: get('CIA2_CAT'), activity: get('CIA2_ACTIVITY') },
        labCia1: { experiments: get('CIA1_EXP'), record: get('CIA1_RECORD'), viva: get('CIA1_VIVA'), labAssessment: get('CIA1_LAB') },
        labCia2: { experiments: get('CIA2_EXP'), record: get('CIA2_RECORD'), viva: get('CIA2_VIVA'), labAssessment: get('CIA2_LAB') },
        semesterEnd: get('SEM_END')
      }
      const hasSee = subjectMarks.some((m: any) => m.exam_type === 'SEM_END')
      const { internal, total, grade, gradePoint } = computeTotals(entry, sub.code, hasSee)
      return {
        'Code': sub.code,
        'Subject': sub.name,
        'Credits': sub.credits,
        'Internal': internal,
        'SEE': entry.semesterEnd,
        'Total': total,
        'Grade': grade,
        'Grade Point': gradePoint,
      }
    })

    const totalCredits = subs.reduce((s, x) => s + (x.credits ?? 0), 0)
    const gpa = totalCredits > 0
      ? Math.round(rows.reduce((s, r, i) => s + r['Grade Point'] * (subs[i].credits ?? 0), 0) / totalCredits * 100) / 100
      : 0

    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 })
    XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', '', 'GPA', gpa]], { origin: -1 })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }]
    const filename = `Marks_${student.full_name.replace(/\s+/g, '_')}_Sem${sem}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, filename)
    setExportingStudent(false)
    setSaveMsg(`✓ Exported report for ${student.full_name}`)
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

  // Compute totals (Regulations 2024, clauses 11–13)
  const computeTotals = (entry: MarksEntry, subjectCode: string, includeSee: boolean) => {
    const r = courseResult(subjectCode, entryToMarks(entry, includeSee))
    return { internal: r.internal, total: r.total, grade: r.grade, gradePoint: r.gradePoint, reason: r.reason, pending: r.pending }
  }

  const updateMark = (studentId: string, field: string, value: number) => {
    const examType = FIELD_EXAM_TYPE[field]
    if (examType) setEntered(prev => new Set(prev).add(`${studentId}|${examType}`))
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

  const clearMark = (studentId: string, field: string) => {
    const key = `${studentId}|${FIELD_EXAM_TYPE[field]}`
    setEntered(prev => { const next = new Set(prev); next.delete(key); return next })
    updateMark(studentId, field, 0)
    setEntered(prev => { const next = new Set(prev); next.delete(key); return next })
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
        max_marks: courseType === 'FORMATION' ? 100 : markSplit(regulationCourseType(selectedSubject.code)).see })
    })

    const toSave = records.filter(r => entered.has(`${r.student_id}|${r.exam_type}`))
    if (!toSave.length) {
      setSaving(false)
      setSaveMsg('Nothing to save — enter some marks first')
      setTimeout(() => setSaveMsg(''), 4000)
      return
    }
    const { error } = await supabase.from('marks').upsert(toSave, {
      onConflict: 'student_id,subject_id,exam_type'
    })

    setSaving(false)
    if (error) setSaveMsg('Error: ' + error.message)
    else {
      const count = new Set(toSave.map(r => r.student_id)).size
      setSaveMsg(`✓ Marks saved for ${count} student${count === 1 ? '' : 's'}`)
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
        <span className="eyebrow">MARKS</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Marks & Grades</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          LICET Regulations 2024 · Pass: total ≥ 50% with ≥ 45% in both internal and semester-end · Theory 40/60 · Lab-integrated 50/50 · Lab 60/40 · Formation 100 internal
        </p>
      </div>

      {/* ── STUDENT VIEW ── */}
      {isStudent && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
              <span className="eyebrow">YOUR MARKS</span>
              <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">Current Semester Performance</h2>
            </div>
            {subjects.length === 0 ? (
              <div className="px-6 py-12 text-center font-mono text-sm text-muted-foreground">No subjects found</div>
            ) : subjects.map(subject => {
              const sm = myMarks[subject.id] ?? {}
              const ct = getCourseType(subject)
              const result = courseResult(subject.code, sm)
              const { internal, total, grade } = result
              const semEnd = result.see ?? 0
              const split = markSplit(regulationCourseType(subject.code))
              const hasData = Object.keys(sm).length > 0

              return (
                <div key={subject.id} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                    <p className="text-sm font-medium truncate">{subject.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{TYPE_LABEL[ct]} · {subject.credits} credits</p>
                  </div>
                  {hasData ? (
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">Internal</p>
                        <p className="font-mono text-sm font-bold">{internal}/{split.internal}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">SEE</p>
                        <p className="font-mono text-sm font-bold">{result.see === null ? '—' : semEnd}/{split.see}</p>
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
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
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
                }} className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                  <option value="">Select subject...</option>
                  {[...subjects].sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code)).map(s => <option key={s.id} value={s.id}>Sem {s.semester} · {s.code} – {s.name}{selectedSection ? '' : ` (${s.section})`}</option>)}
                </select>
              </div>
            </div>

            {/* Student-wise export */}
            {students.length > 0 && (
              <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border mt-3">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <label className="font-mono text-xs text-muted-foreground">Student-wise report</label>
                  <select value={exportStudentId} onChange={e => setExportStudentId(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                    <option value="">Select student...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({(s as any).roll_number ?? s.email})</option>)}
                  </select>
                </div>
                <button onClick={exportStudentXLSX} disabled={exportingStudent || !exportStudentId}
                  className="flex items-center gap-2 h-10 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50 transition-colors">
                  {exportingStudent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export Student Report
                </button>
              </div>
            )}

            {/* Export + Lock bar */}
            {selectedSubject && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
                <button onClick={exportXLSX} disabled={exporting || !students.length}
                  className="flex items-center gap-2 h-9 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50 transition-colors">
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export XLSX
                </button>
                {isHOD && (
                  <button onClick={() => isLocked ? toggleLock() : setShowLockModal(true)}
                    className={`flex items-center gap-2 h-9 px-3 font-mono text-xs rounded transition-colors ${isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-licet-cream text-licet-indigo border border-licet-gold hover:bg-licet-gold/50'}`}>
                    {isLocked ? <><Unlock className="w-3 h-3" /> Unlock Marks</> : <><Lock className="w-3 h-3" /> Lock Marks</>}
                  </button>
                )}
                {isLocked && (
                  <div className="flex items-center gap-2 font-mono text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded">
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
                  <span className="eyebrow">LOCK MARKS</span>
                  <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">Lock {selectedSubject?.name}</h2>
                  <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">Faculty cannot edit marks after locking.</p>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Reason (optional)</label>
                  <input type="text" value={lockReason} onChange={e => setLockReason(e.target.value)}
                    placeholder="e.g. CIA 1 finalized"
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={toggleLock}
                    className="flex-1 h-10 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" /> Confirm Lock
                  </button>
                  <button onClick={() => setShowLockModal(false)}
                    className="flex-1 h-10 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedSubject && (
            <div className="bg-card border border-border rounded-lg">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="eyebrow">MARKS ENTRY</span>
                    <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">{selectedSubject.code} — {selectedSubject.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selectedSubject.section} · Semester {selectedSubject.semester} · {students.length} students
                    </p>
                  </div>
                  <div className="font-mono text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded">
                    {TYPE_LABEL[courseType]}{courseType === 'LAB_INTEGRATED' ? ` · ${labIntegratedWeights(selectedSubject.code).theory} + ${labIntegratedWeights(selectedSubject.code).lab}` : ''}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                  {(['cia1','cia2','sem','summary'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-licet-indigo/70 hover:text-licet-indigo hover:bg-licet-cream/60'}`}>
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
                        {courseType === 'THEORY' && <span className="w-16 text-center">Act /10</span>}
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
                    {courseType === 'FORMATION' ? 'Assessment /100' : `SEE /${markSplit(regulationCourseType(selectedSubject?.code)).see}`}
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
                  const { internal, total, grade, gradePoint, reason } = computeTotals(entry, selectedSubject!.code, entered.has(`${student.id}|SEM_END`))

                  const cia = activeTab === 'cia1' ? entry.cia1 : entry.cia2
                  const labCia = activeTab === 'cia1' ? (entry.labCia1 ?? defaultLabCIA()) : (entry.labCia2 ?? defaultLabCIA())
                  const ciaPrefix = activeTab === 'cia1' ? 'cia1' : 'cia2'
                  const labPrefix = activeTab === 'cia1' ? 'labCia1' : 'labCia2'

                  // Table 6 (theory: CT 20 + CAT 40 + activity 40); Table 8 (lab-integrated: CT + CAT only)
                  const ciaSubtotal = courseType === 'LAB_INTEGRATED'
                    ? Math.round(((cia.ct / 30 * 20) + (cia.cat / 60 * 40)) / 60 * 100)
                    : Math.round((cia.ct / 30 * 20) + (cia.cat / 60 * 40) + (cia.activity / 10 * 40))
                  const labSubtotal = labCia.experiments + labCia.record + labCia.viva + labCia.labAssessment

                  const numInput = (field: string, value: number, max: number) => (
                    <input type="number" min={0} max={max} step="0.5"
                      value={entered.has(`${student.id}|${FIELD_EXAM_TYPE[field]}`) ? value : ''}
                      onChange={e => e.target.value === ''
                        ? clearMark(student.id, field)
                        : updateMark(student.id, field, Math.min(max, Math.max(0, Number(e.target.value))))}
                      className="w-full h-7 px-1 bg-background border border-border rounded font-mono text-xs text-center focus:border-primary focus:outline-none"
                      placeholder="–"
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
                              {courseType === 'THEORY' && <div className="w-16">{numInput(`${ciaPrefix}.activity`, cia.activity, 10)}</div>}
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
                            courseType === 'FORMATION' ? 100 : markSplit(regulationCourseType(selectedSubject?.code)).see)}
                        </div>
                      )}

                      {activeTab === 'summary' && (
                        <>
                          <div className="w-16 text-center font-mono text-xs font-bold">{internal}</div>
                          <div className="w-16 text-center font-mono text-xs">{entry.semesterEnd}</div>
                          <div className="w-16 text-center font-mono text-xs font-bold">{total}</div>
                          <div title={reason} className={`w-12 text-center font-mono text-xs font-bold px-1 py-0.5 rounded ${GRADE_COLORS[grade] ?? ''}`}>{grade}</div>
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
                  {saveMsg && <span className={`font-mono text-xs ${saveMsg.startsWith('Error') ? 'text-red-700' : 'text-green-700'}`}>{saveMsg}</span>}
                  {activeTab === 'summary' && students.length > 0 && (
                    <div className="font-mono text-xs text-muted-foreground">
                      Class avg: {Math.round(
                        students.reduce((sum, s) => sum + (computeTotals(marksData[s.id] ?? { studentId: s.id, cia1: defaultCIA(), cia2: defaultCIA(), labCia1: defaultLabCIA(), labCia2: defaultLabCIA(), semesterEnd: 0 }, selectedSubject!.code, entered.has(`${s.id}|SEM_END`)).total), 0) / students.length
                      )}/100
                    </div>
                  )}
                </div>
                <button onClick={saveMarks} disabled={saving || !students.length || isLocked}
                  className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {isLocked ? 'Locked' : saving ? 'Saving...' : 'Save Marks'}
                </button>
              </div>
            </div>
          )}

          {!selectedSubject && (
            <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
              <BarChart3 className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
              <p className="font-mono text-sm text-muted-foreground">Select a subject to enter marks</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
// Export and lock functionality added below — see exportXLSX and lock handlers