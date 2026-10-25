"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, BarChart3, Download, Lock, Unlock, ChevronDown, ChevronRight } from "lucide-react"
import * as XLSX from "xlsx"
import { loadTerms, loadCourseRoster, type Term } from "@/lib/academic"
import { MyMarkObjections } from "@/components/mark-objections"
import { MarksImport } from "@/components/marks-import"
import { SchemeEditor } from "@/components/marks/scheme-editor"
import { courseResult, courseType as regulationCourseType, internalSplit, type CourseType } from "@/lib/regulations"
import { schemeOf, computeInternal, examType, SP_KEY, SP_MAX, type Scheme, type MarkRow } from "@/lib/cia-scheme"
import { getActiveSemester } from "@/lib/semester"
import { Portal } from "@/components/ui/portal"

type Profile = Database['public']['Tables']['profiles']['Row']
type Subject = Database['public']['Tables']['subjects']['Row'] & { cia_scheme?: unknown }
/** one cell: the number as typed, or AB */
type Cell = { v: string; absent: boolean; max: number }
type Grid = Record<string, Record<string, Cell>>      // student → exam_type → cell
type Tab = 'cia1' | 'cia2' | 'sp' | 'sem' | 'summary' | 'scheme'

const TYPE_LABEL: Record<CourseType, string> = {
  THEORY: 'Theory · 40 / 60', LAB_INTEGRATED: 'Lab-integrated · 50 / 50', LAB: 'Laboratory · 60 / 40',
  PROJECT: 'Project · 60 / 40', FORMATION: 'Formation · 100 internal',
}
const GRADE_COLORS: Record<string, string> = {
  'O': 'text-green-700 bg-green-50', 'A+': 'text-emerald-700 bg-emerald-50', 'A': 'text-blue-700 bg-blue-50',
  'B+': 'text-cyan-700 bg-cyan-50', 'B': 'text-amber-700 bg-amber-50', 'C': 'text-orange-700 bg-orange-50', 'U': 'text-red-700 bg-red-50',
}
const SECTIONS = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B']
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)

/** Rows of one student, as the engine wants them (cells being typed included). */
function rowsOf(cells: Record<string, Cell> | undefined): MarkRow[] {
  return Object.entries(cells ?? {}).filter(([, c]) => c.absent || c.v.trim() !== '')
    .map(([exam_type, c]) => ({ exam_type, marks_obtained: c.absent ? 0 : Number(c.v), max_marks: c.max, absent: c.absent }))
}

export default function MarksPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [grid, setGrid] = useState<Grid>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())     // `${student}|${exam_type}` stored in the DB
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportingStudent, setExportingStudent] = useState(false)
  const [exportStudentId, setExportStudentId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('cia1')

  const isHOD = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const scheme: Scheme | null = useMemo(() => selectedSubject ? schemeOf(selectedSubject) : null, [selectedSubject])
  const ctype: CourseType = selectedSubject ? regulationCourseType(selectedSubject.code) : 'THEORY'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single().then(({ data }) => { if (data) setProfile(data) })
  }, [router])
  useEffect(() => { loadTerms().then(ts => { setTerms(ts); setTermId(ts.find(t => t.is_current)?.id ?? ts[0]?.id ?? 'none') }) }, [])

  // courses of the chosen term: a section's own courses plus the combined courses of its batch
  useEffect(() => {
    if (!authUser || !termId) return
    let cancelled = false
    ;(async () => {
      let query = supabase.from('subjects').select('*').order('semester').order('name')
      query = termId === 'none' ? query.is('term_id', null) : query.eq('term_id', termId)
      const section = isStudent ? (profile?.section ?? null) : selectedSection || null
      if (isStudent && !profile) return
      if (section && termId !== 'none') {
        const { data: grad } = await supabase.rpc('section_grad_year', { p_section: section, p_term: termId })
        query = query.or(`section.eq.${section},and(section.is.null,cohort_grad_year.eq.${Number(grad) || 0})`)
      } else if (section) query = query.eq('section', section)
      const { data } = await query
      if (cancelled) return
      let list = (data ?? []) as Subject[]
      if (isStudent) list = list.filter(s => s.section || s.audience !== 'VERTICAL' || s.audience_value === profile?.vertical)
      setSubjects(list)
    })()
    return () => { cancelled = true }
  }, [authUser, profile, isStudent, selectedSection, termId])

  useEffect(() => {
    if (!selectedSubject || isStudent) return
    let cancelled = false
    loadCourseRoster(selectedSubject).then(list => { if (!cancelled) setStudents(list as unknown as Profile[]) })
    supabase.rpc('can_edit_subject', { p_subject: selectedSubject.id, p_kind: 'MARKS' }).then(({ data }) => { if (!cancelled) setCanEdit(!!data) })
    return () => { cancelled = true }
  }, [selectedSubject, isStudent])

  const loadMarks = useCallback(async () => {
    if (!selectedSubject) return
    const { data } = await supabase.from('marks').select('student_id, exam_type, marks_obtained, max_marks, absent').eq('subject_id', selectedSubject.id).range(0, 9999)
    const g: Grid = {}
    for (const m of (data ?? []) as { student_id: string; exam_type: string; marks_obtained: number; max_marks: number; absent: boolean }[]) {
      g[m.student_id] = { ...(g[m.student_id] ?? {}), [m.exam_type]: { v: m.absent ? '' : String(Number(m.marks_obtained)), absent: !!m.absent, max: Number(m.max_marks) } }
    }
    setGrid(g); setDirty(new Set())
    setSaved(new Set(((data ?? []) as { student_id: string; exam_type: string }[]).map(m => `${m.student_id}|${m.exam_type}`)))
  }, [selectedSubject])
  useEffect(() => { loadMarks() }, [loadMarks])

  useEffect(() => {
    if (!selectedSubject) return
    supabase.from('subject_locks' as never).select('*').eq('subject_id', selectedSubject.id).in('lock_type', ['MARKS', 'BOTH'])
      .then(({ data }: { data: unknown[] | null }) => setIsLocked(!!data?.length))
  }, [selectedSubject])

  const toggleLock = async () => {
    if (!selectedSubject || !profile) return
    const locks = supabase.from('subject_locks' as never) as unknown as { delete: () => { eq: (a: string, b: string) => { in: (a: string, b: string[]) => Promise<unknown> } }; insert: (r: unknown) => Promise<unknown> }
    if (isLocked) { await locks.delete().eq('subject_id', selectedSubject.id).in('lock_type', ['MARKS', 'BOTH']); setIsLocked(false); setSaveMsg('✓ Marks unlocked') }
    else { await locks.insert({ subject_id: selectedSubject.id, lock_type: 'MARKS', locked_by: profile.id, reason: lockReason || 'Locked by HOD' }); setIsLocked(true); setShowLockModal(false); setSaveMsg('✓ Marks locked — faculty cannot edit') }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const resultOf = (studentId: string, s: Subject = selectedSubject!, g: Grid = grid) => {
    const sch = schemeOf(s), rows = rowsOf(g[studentId])
    return { cia: computeInternal(sch, rows), res: courseResult(s.code, rows, s.cia_scheme) }
  }

  const setCell = (studentId: string, type: string, raw: string, max: number) => {
    const t = raw.trim()
    const absent = /^(ab|a|abs)$/i.test(t)
    setGrid(g => ({ ...g, [studentId]: { ...(g[studentId] ?? {}), [type]: { v: absent ? '' : t, absent, max } } }))
    setDirty(d => new Set(d).add(`${studentId}|${type}`))
  }

  const saveMarks = async () => {
    if (!selectedSubject || !profile) return
    const up: { student_id: string; subject_id: string; faculty_id: string; exam_type: string; marks_obtained: number; max_marks: number; absent: boolean }[] = []
    const del: { student: string; type: string }[] = []
    const bad: string[] = []
    for (const key of dirty) {
      const [student, type] = key.split('|')
      const c = grid[student]?.[type]
      if (!c || (!c.absent && c.v === '')) { if (saved.has(key)) del.push({ student, type }); continue }
      const n = c.absent ? 0 : Number(c.v)
      if (!c.absent && (!Number.isFinite(n) || n < 0 || n > c.max)) { bad.push(`${students.find(s => s.id === student)?.full_name ?? student}: ${type} "${c.v}" (out of ${c.max})`); continue }
      up.push({ student_id: student, subject_id: selectedSubject.id, faculty_id: profile.id, exam_type: type, marks_obtained: Math.round(n * 100) / 100, max_marks: c.max, absent: c.absent })
    }
    if (bad.length) { setSaveMsg(`Error: fix these first — ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` and ${bad.length - 4} more` : ''}`); return }
    if (!up.length && !del.length) { setSaveMsg('Nothing to save — enter some marks first'); setTimeout(() => setSaveMsg(''), 4000); return }
    setSaving(true); setSaveMsg('')
    const { error } = up.length ? await supabase.from('marks').upsert(up, { onConflict: 'student_id,subject_id,exam_type' }) : { error: null }
    let delErr: string | null = null
    for (const d of del) { const { error: e } = await supabase.from('marks').delete().eq('subject_id', selectedSubject.id).eq('student_id', d.student).eq('exam_type', d.type); if (e) delErr = e.message }
    setSaving(false)
    if (error || delErr) setSaveMsg('Error: ' + (error?.message ?? delErr))
    else {
      const n = new Set([...up.map(r => r.student_id), ...del.map(d => d.student)]).size
      setSaveMsg(`✓ Marks saved for ${n} student${n === 1 ? '' : 's'}`); loadMarks()
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  // ── Excel in the department's IA workbook format (Namelist, course sheet, Upload 1 / 2) ──
  const KIND: Record<CourseType, string> = { THEORY: 'Theory Course', LAB_INTEGRATED: 'Laboratory Integrated Theory Course', LAB: 'Laboratory Course', PROJECT: 'Project', FORMATION: 'Formation Course' }
  const iaClassOf = async (section: string, courses: Subject[], roster: Profile[]) => {
    const term = terms.find(t => t.id === termId)
    const grad = term ? Number(term.academic_year.split('-')[1]) + ({ I: 3, II: 2, III: 1, IV: 0 } as Record<string, number>)[section.split(' ')[0]] : 0
    const [{ data: mk }, { data: adv }] = await Promise.all([
      supabase.from('marks').select('student_id, subject_id, exam_type, marks_obtained, max_marks, absent').in('subject_id', courses.map(c => c.id)).range(0, 49999),
      supabase.from('profiles').select('full_name').eq('advisor_section', section).in('role', ['HOD', 'PROFESSOR']),
    ])
    const marks = new Map<string, Map<string, MarkRow[]>>()
    for (const m of (mk ?? []) as (MarkRow & { student_id: string; subject_id: string })[]) {
      const c = marks.get(m.subject_id) ?? new Map<string, MarkRow[]>(); c.set(m.student_id, [...(c.get(m.student_id) ?? []), m]); marks.set(m.subject_id, c)
    }
    const { iaWorkbook } = await import('@/lib/xlsx-formats/ia')
    return iaWorkbook({
      section, semester: courses[0]?.semester ?? 0, batch: grad ? `${grad - 4} - ${grad}` : '', termLabel: term?.label ?? '',
      advisor: ((adv ?? []) as { full_name: string }[]).map(a => a.full_name).join(' & '),
      students: roster.map(s => ({ id: s.id, roll: s.roll_number ?? '', reg: s.register_number ?? '', name: s.full_name })),
      courses: courses.map(c => ({ code: c.code, name: c.name, short: c.short_name || c.code, kindLabel: KIND[regulationCourseType(c.code)], faculty: c.faculty_names ?? '',
        scheme: schemeOf(c), marks: marks.get(c.id) ?? new Map() })),
    })
  }
  const exportXLSX = async () => {
    if (!selectedSubject) return
    setExporting(true)
    try {
      const wb = await iaClassOf(selectedSubject.section ?? 'Combined', [selectedSubject], students)
      const { download } = await import('@/lib/xlsx-formats/common')
      await download(wb, `IA_${selectedSubject.code}_${(selectedSubject.section ?? 'combined').replace(/\s+/g, '_')}.xlsx`)
      setSaveMsg(`✓ Exported ${students.length} students`)
    } catch (e) { setSaveMsg('Error: ' + (e instanceof Error ? e.message : 'export failed')) }
    setExporting(false); setTimeout(() => setSaveMsg(''), 4000)
  }
  /** the whole class: every course of the section this term (HOD and class advisors) */
  const exportClassXLSX = async () => {
    const section = selectedSection || profile?.advisor_section
    if (!section) return
    setExporting(true)
    try {
      const own = subjects.filter(s => s.section === section)
      const { data: roster } = await supabase.from('profiles').select('*').eq('role', 'STUDENT').eq('section', section).eq('is_active', true).order('roll_number')
      const wb = await iaClassOf(section, own, (roster ?? []) as Profile[])
      const { download } = await import('@/lib/xlsx-formats/common')
      await download(wb, `IA_${section.replace(/\s+/g, '_')}_${terms.find(t => t.id === termId)?.label.replace(/\s+/g, '_') ?? ''}.xlsx`)
      setSaveMsg(`✓ Class IA workbook: ${own.length} courses`)
    } catch (e) { setSaveMsg('Error: ' + (e instanceof Error ? e.message : 'export failed')) }
    setExporting(false); setTimeout(() => setSaveMsg(''), 5000)
  }

  const exportStudentXLSX = async () => {
    const student = students.find(s => s.id === exportStudentId)
    if (!student) return
    setExportingStudent(true)
    const sem = getActiveSemester(student.section ?? '')
    const { data: subs } = await supabase.from('subjects').select('*').eq('section', student.section ?? '').eq('semester', sem).order('code')
    if (!subs?.length) { setExportingStudent(false); setSaveMsg('No subjects found for this student'); return }
    const { data: mk } = await supabase.from('marks').select('subject_id, exam_type, marks_obtained, max_marks, absent').eq('student_id', student.id).in('subject_id', subs.map(s => s.id))
    const rows = (subs as Subject[]).map(sub => {
      const r = courseResult(sub.code, ((mk ?? []) as (MarkRow & { subject_id: string })[]).filter(m => m.subject_id === sub.id), sub.cia_scheme)
      return { 'Code': sub.code, 'Subject': sub.name, 'Credits': sub.credits, 'Internal': r.internal, 'Internal out of': r.internalMax, 'SEE': r.see ?? '', 'Total': r.total, 'Grade': r.grade, 'Grade Point': r.gradePoint, credits: sub.credits ?? 0 }
    })
    const credits = rows.reduce((s, r) => s + r.credits, 0)
    const gpa = credits ? Math.round(rows.reduce((s, r) => s + r['Grade Point'] * r.credits, 0) / credits * 100) / 100 : 0
    const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'credits'))))
    XLSX.utils.sheet_add_aoa(ws, [[], ['', '', '', '', '', '', 'GPA', gpa]], { origin: -1 })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    XLSX.writeFile(wb, `Marks_${student.full_name.replace(/\s+/g, '_')}_Sem${sem}_${new Date().toISOString().split('T')[0]}.xlsx`)
    setExportingStudent(false); setSaveMsg(`✓ Exported report for ${student.full_name}`); setTimeout(() => setSaveMsg(''), 4000)
  }

  // ── student view ──
  type Mine = MarkRow & { subject_id: string }
  const [myRows, setMyRows] = useState<Mine[]>([])
  const [openCourse, setOpenCourse] = useState('')
  useEffect(() => {
    if (!isStudent || !profile) return
    supabase.from('marks').select('subject_id, exam_type, marks_obtained, max_marks, absent').eq('student_id', profile.id)
      .then(({ data }) => setMyRows((data ?? []) as Mine[]))
  }, [isStudent, profile])
  const myMarks = useMemo(() => {
    const g: Record<string, Record<string, number>> = {}
    for (const m of myRows) g[m.subject_id] = { ...(g[m.subject_id] ?? {}), [m.exam_type]: Number(m.marks_obtained) }
    return g
  }, [myRows])

  const editable = canEdit && !isLocked
  const tabs = (['cia1', 'cia2', ...(scheme?.sp !== false && ctype !== 'FORMATION' ? ['sp'] : []), ...(ctype !== 'FORMATION' ? ['sem'] : []), 'summary', 'scheme'] as Tab[])
    .filter(t => !(t === 'cia2' && scheme && !scheme.comps.some(c => c.cia === 2)))
  const TAB_LABEL: Record<string, string> = { cia1: 'CIA 1', cia2: 'CIA 2', sp: 'Special test', sem: 'SEE', summary: 'Summary', scheme: 'Assessment scheme' }
  const inputCls = (bad: boolean) => `w-full h-7 px-1 bg-background border rounded font-mono text-xs text-center focus:outline-none ${bad ? 'border-red-500 text-red-700' : 'border-border focus:border-primary'}`

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">MARKS</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Marks & Grades</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          Each course follows its assessment scheme — the same CT / CAT / ABA / assignment / lab split as the department’s IA sheets. Type <b>AB</b> for absent. Pass: total ≥ 50% with ≥ 45% in internal and semester-end.
        </p>
      </div>

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
              const rows = myRows.filter(m => m.subject_id === subject.id)
              const sch = schemeOf(subject)
              const r = courseResult(subject.code, rows, subject.cia_scheme)
              const ci = computeInternal(sch, rows)
              const ct = regulationCourseType(subject.code)
              const open = openCourse === subject.id
              return (
                <div key={subject.id} className="border-b border-border last:border-0">
                  <button onClick={() => setOpenCourse(open ? '' : subject.id)} disabled={!rows.length} className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-accent/30">
                    {rows.length ? (open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />) : <span className="w-4" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{subject.code}</p>
                      <p className="text-sm font-medium truncate">{subject.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{TYPE_LABEL[ct]} · {subject.credits} credits</p>
                    </div>
                    {rows.length ? (
                      <div className="flex items-center gap-4 text-right">
                        <div><p className="font-mono text-xs text-muted-foreground">Internal</p><p className="font-mono text-sm font-bold">{r.internal}/{r.internalMax}</p></div>
                        {ct !== 'FORMATION' && <div><p className="font-mono text-xs text-muted-foreground">SEE</p><p className="font-mono text-sm font-bold">{r.see ?? '—'}/{r.seeMax}</p></div>}
                        <div><p className="font-mono text-xs text-muted-foreground">Total</p><p className="font-mono text-sm font-bold">{r.total}</p></div>
                        <span className={`font-mono text-sm font-bold px-2 py-1 rounded ${GRADE_COLORS[r.grade] ?? ''}`}>{r.grade}</span>
                      </div>
                    ) : <span className="font-mono text-xs text-muted-foreground">No marks entered</span>}
                  </button>
                  {open && (
                    <div className="px-6 pb-4 pl-14 space-y-1.5 text-[12.5px]">
                      {([1, 2] as const).filter(c => sch.comps.some(x => x.cia === c)).map(c => (
                        <p key={c}><b>CIA {c}:</b> {sch.comps.filter(x => x.cia === c).map(x => {
                          const m = rows.find(y => y.exam_type === examType(x))
                          return `${x.label} ${m ? (m.absent ? 'AB' : fmt(Number(m.marks_obtained))) : '—'}/${m ? Number(m.max_marks) : x.max}`
                        }).join(' · ')}{sch.parts.map(p => ci.cia[c][p.key] ? ` → ${p.label} ${fmt(ci.cia[c][p.key].got)}/${ci.cia[c][p.key].of}` : '').join('')}</p>
                      ))}
                      {ci.spUsed && <p>Special test replaces the absent CAT of CIA {ci.spUsed}.</p>}
                      {sch.parts.length > 1 && <p>{ci.parts.map(p => `${p.label} ${p.value}/${p.out_of}`).join(' + ')} = {r.internal}/{r.internalMax}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <MyMarkObjections courses={subjects} myMarks={myMarks} />
        </div>
      )}

      {(isFaculty || isHOD) && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Term</label>
                <select data-filter value={termId} onChange={e => { setTermId(e.target.value); setSelectedSubject(null); setGrid({}) }}
                  className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                  {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
                  <option value="none">Older records (before terms)</option>
                </select>
              </div>
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
                <select value={selectedSubject?.id ?? ''} onChange={e => { setSelectedSubject(subjects.find(s => s.id === e.target.value) ?? null); setGrid({}); setActiveTab('cia1') }}
                  className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                  <option value="">Select subject...</option>
                  {[...subjects].sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code)).map(s => <option key={s.id} value={s.id}>Sem {s.semester} · {s.code} – {s.name}{selectedSection ? '' : ` (${s.section ?? 'combined'})`}</option>)}
                </select>
              </div>
            </div>

            {students.length > 0 && (
              <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border mt-3">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <label className="font-mono text-xs text-muted-foreground">Student-wise report</label>
                  <select value={exportStudentId} onChange={e => setExportStudentId(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                    <option value="">Select student...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.roll_number ?? s.email})</option>)}
                  </select>
                </div>
                <button onClick={exportStudentXLSX} disabled={exportingStudent || !exportStudentId}
                  className="flex items-center gap-2 h-10 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50">
                  {exportingStudent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Export Student Report
                </button>
              </div>
            )}

            {selectedSubject && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border mt-3">
                <button onClick={exportXLSX} disabled={exporting || !students.length}
                  className="flex items-center gap-2 h-9 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Export XLSX
                </button>
                {(isHOD || (profile?.advisor_section && (!selectedSection || selectedSection === profile.advisor_section))) && (selectedSection || profile?.advisor_section) && (
                  <button onClick={exportClassXLSX} disabled={exporting}
                    className="flex items-center gap-2 h-9 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50">
                    <Download className="w-3 h-3" /> Class IA workbook ({selectedSection || profile?.advisor_section})
                  </button>
                )}
                {editable && scheme && <MarksImport subjectId={selectedSubject.id} code={selectedSubject.code} students={students as never} scheme={scheme} onDone={loadMarks} />}
                {isHOD && (
                  <button onClick={() => isLocked ? toggleLock() : setShowLockModal(true)}
                    className={`flex items-center gap-2 h-9 px-3 font-mono text-xs rounded ${isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-licet-cream text-licet-indigo border border-licet-gold hover:bg-licet-gold/50'}`}>
                    {isLocked ? <><Unlock className="w-3 h-3" /> Unlock Marks</> : <><Lock className="w-3 h-3" /> Lock Marks</>}
                  </button>
                )}
                {isLocked && <div className="flex items-center gap-2 font-mono text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded"><Lock className="w-3 h-3" /> Marks locked — editing disabled</div>}
                {!canEdit && !isLocked && <span className="text-[12.5px] text-muted-foreground">You can view these marks; only the course’s teachers, its class advisor and the HOD can change them.</span>}
              </div>
            )}
          </div>

          {showLockModal && (
            <Portal>
            <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-4">
                <div>
                  <span className="eyebrow">LOCK MARKS</span>
                  <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">Lock {selectedSubject?.name}</h2>
                  <p className="text-[13.5px] text-muted-foreground mt-1.5">Faculty cannot edit marks after locking.</p>
                </div>
                <input type="text" value={lockReason} onChange={e => setLockReason(e.target.value)} placeholder="Reason, e.g. CIA 1 finalized"
                  className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
                <div className="flex gap-3">
                  <button onClick={toggleLock} className="flex-1 h-10 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 flex items-center justify-center gap-2"><Lock className="w-3 h-3" /> Confirm Lock</button>
                  <button onClick={() => setShowLockModal(false)} className="flex-1 h-10 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">Cancel</button>
                </div>
              </div>
            </div>
            </Portal>
          )}

          {selectedSubject && scheme && (
            <div className="bg-card border border-border rounded-lg">
              <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="eyebrow">MARKS ENTRY</span>
                    <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">{selectedSubject.code} — {selectedSubject.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{selectedSubject.section ?? 'Combined (both sections)'} · Semester {selectedSubject.semester} · {students.length} students</p>
                  </div>
                  <div className="font-mono text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-right">
                    {TYPE_LABEL[ctype]}<br />internal {scheme.parts.map(p => `${p.label} ${p.out_of}`).join(' + ')}{selectedSubject.cia_scheme ? ' · own scheme' : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-4">
                  {tabs.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-licet-indigo/70 hover:text-licet-indigo hover:bg-licet-cream/60'}`}>
                      {TAB_LABEL[tab]}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'scheme' ? (
                <SchemeEditor subject={selectedSubject} scheme={scheme} canEdit={editable} onSaved={s => { setSelectedSubject({ ...selectedSubject, cia_scheme: s }); setSubjects(list => list.map(x => x.id === selectedSubject.id ? { ...x, cia_scheme: s } : x)) }} />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-accent/30 font-mono text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left w-8">#</th>
                          <th className="px-2 py-2 text-left min-w-[180px]">Student</th>
                          {(activeTab === 'cia1' || activeTab === 'cia2') && <>
                            {scheme.comps.filter(c => c.cia === (activeTab === 'cia1' ? 1 : 2)).map(c => (
                              <th key={c.key} className="px-1 py-2 text-center w-20" title={`counts ${c.weight}${c.pool ? ` (pooled: ${c.pool})` : ''}`}>{c.label}<br />/{c.max}</th>
                            ))}
                            {scheme.parts.map(p => <th key={p.key} className="px-1 py-2 text-center w-20">{p.label}</th>)}
                          </>}
                          {activeTab === 'sp' && <th className="px-1 py-2 text-center w-28">Special test /{SP_MAX}</th>}
                          {activeTab === 'sp' && <th className="px-2 py-2 text-left">Used for</th>}
                          {activeTab === 'sem' && <th className="px-1 py-2 text-center w-28">SEE /{internalSplit(selectedSubject.code, selectedSubject.cia_scheme).see}</th>}
                          {activeTab === 'summary' && <>
                            {scheme.parts.length > 1 && scheme.parts.map(p => <th key={p.key} className="px-1 py-2 text-center w-16">{p.label} /{p.out_of}</th>)}
                            <th className="px-1 py-2 text-center w-20">Internal /{internalSplit(selectedSubject.code, selectedSubject.cia_scheme).internal}</th>
                            {ctype !== 'FORMATION' && <><th className="px-1 py-2 text-center w-16">SEE</th><th className="px-1 py-2 text-center w-16">Total</th></>}
                            <th className="px-1 py-2 text-center w-14">Grade</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {students.length === 0 && <tr><td colSpan={20} className="px-6 py-12 text-center font-mono text-sm text-muted-foreground">No students found</td></tr>}
                        {students.map((s, idx) => {
                          const cells = grid[s.id] ?? {}
                          const { cia, res } = resultOf(s.id)
                          const input = (type: string, max: number) => {
                            const c = cells[type]
                            const val = c?.absent ? 'AB' : c?.v ?? ''
                            const n = Number(c?.v)
                            const bad = !!c && !c.absent && c.v !== '' && (!Number.isFinite(n) || n < 0 || n > (c.max ?? max))
                            return <input value={val} disabled={!editable} inputMode="decimal" placeholder="–" title={`out of ${c?.max ?? max}; AB = absent`}
                              onChange={e => setCell(s.id, type, e.target.value, c?.max ?? max)} className={inputCls(bad)} />
                          }
                          return (
                            <tr key={s.id} className="hover:bg-accent/20">
                              <td className="px-3 py-1.5 font-mono text-muted-foreground text-right">{idx + 1}</td>
                              <td className="px-2 py-1.5"><p className="font-medium truncate">{s.full_name}</p><p className="font-mono text-[10.5px] text-muted-foreground">{s.roll_number ?? s.register_number ?? ''}</p></td>
                              {(activeTab === 'cia1' || activeTab === 'cia2') && (() => {
                                const n = activeTab === 'cia1' ? 1 : 2
                                return <>
                                  {scheme.comps.filter(c => c.cia === n).map(c => <td key={c.key} className="px-1 py-1.5">{input(examType(c), c.max)}</td>)}
                                  {scheme.parts.map(p => <td key={p.key} className="px-1 py-1.5 text-center font-mono font-bold text-primary">{cia.cia[n][p.key] ? `${fmt(cia.cia[n][p.key].got)}/${cia.cia[n][p.key].of}` : '–'}{cia.spUsed === n && p.key === scheme.comps.find(c => c.key === 'CAT')?.part ? ' *' : ''}</td>)}
                                </>
                              })()}
                              {activeTab === 'sp' && <>
                                <td className="px-1 py-1.5">{input(SP_KEY, SP_MAX)}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">{cia.spUsed ? `replaces the absent CAT of CIA ${cia.spUsed}` : cells[SP_KEY] ? 'not used — no CAT is marked AB' : ''}</td>
                              </>}
                              {activeTab === 'sem' && <td className="px-1 py-1.5">{input('SEM_END', internalSplit(selectedSubject.code, selectedSubject.cia_scheme).see)}</td>}
                              {activeTab === 'summary' && <>
                                {scheme.parts.length > 1 && cia.parts.map(p => <td key={p.key} className="px-1 py-1.5 text-center font-mono">{p.value}</td>)}
                                <td className="px-1 py-1.5 text-center font-mono font-bold">{res.internal}{!cia.complete && cia.entered ? '*' : ''}</td>
                                {ctype !== 'FORMATION' && <><td className="px-1 py-1.5 text-center font-mono">{res.see ?? '—'}</td><td className="px-1 py-1.5 text-center font-mono font-bold">{res.total}</td></>}
                                <td className="px-1 py-1.5 text-center"><span title={res.reason} className={`font-mono font-bold px-1 py-0.5 rounded ${GRADE_COLORS[res.grade] ?? ''}`}>{res.grade}</span></td>
                              </>}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
                    <div className="space-y-0.5 text-xs font-mono">
                      {saveMsg && <p className={saveMsg.startsWith('Error') ? 'text-red-700' : 'text-green-700'}>{saveMsg}</p>}
                      {activeTab === 'summary' && <p className="text-muted-foreground">* = not all components entered yet · the special test replaces an absent CAT</p>}
                      {dirty.size > 0 && <p className="text-amber-700">{dirty.size} unsaved change{dirty.size === 1 ? '' : 's'}</p>}
                    </div>
                    <button onClick={saveMarks} disabled={saving || !students.length || !editable || !dirty.size}
                      className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {isLocked ? 'Locked' : saving ? 'Saving...' : 'Save Marks'}
                    </button>
                  </div>
                </>
              )}
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
