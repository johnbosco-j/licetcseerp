"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { RichEditor } from "@/components/rich-editor"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { getActiveSemester } from '@/lib/semester';
import {
  FileText, Plus, X, Check, Clock, Loader2,
  Calendar, BarChart3, BookOpen, AlertTriangle, Download
} from "lucide-react"
import { FileUpload, FileList, type UploadedFile } from "@/components/file-upload"
import * as XLSX from "xlsx"

type Profile  = Database['public']['Tables']['profiles']['Row']
type Subject  = Database['public']['Tables']['subjects']['Row']

type QPStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
type TabType  = 'question_papers' | 'exam_schedule' | 'analysis'

const EXAM_TYPES = ['CIA 1 – CT','CIA 1 – CAT','CIA 2 – CT','CIA 2 – CAT','Semester End Exam','Lab Practical']
const SECTIONS   = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

const STATUS_COLORS: Record<QPStatus, string> = {
  DRAFT:     'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors border-white/10',
  SUBMITTED: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  APPROVED:  'text-green-500 bg-green-500/10 border-green-500/20',
  REJECTED:  'text-red-500 bg-red-500/10 border-red-500/20',
}

const QP_TEMPLATE = `<h1 style="text-align:center">LOYOLA-ICAM COLLEGE OF ENGINEERING AND TECHNOLOGY</h1>
<h2 style="text-align:center">Department of Computer Science and Engineering</h2>
<p style="text-align:center">B.E. CSE – R2024 | Even Semester 2025-2026</p>
<hr/>
<table>
<tr><th>Course Code</th><th>Course Title</th><th>Date</th><th>Duration</th><th>Max Marks</th></tr>
<tr><td></td><td></td><td></td><td>3 Hours</td><td>100</td></tr>
</table>
<p><strong>Instructions to Candidates:</strong></p>
<ol>
<li>Answer ALL questions in Part A, any FIVE from Part B, and ONE from Part C.</li>
<li>Use of approved scientific calculators is permitted.</li>
</ol>
<hr/>
<h2>PART A – (10 × 2 = 20 Marks) – Answer ALL Questions</h2>
<ol>
<li><p></p></li><li><p></p></li><li><p></p></li><li><p></p></li><li><p></p></li>
<li><p></p></li><li><p></p></li><li><p></p></li><li><p></p></li><li><p></p></li>
</ol>
<hr/>
<h2>PART B – (5 × 13 = 65 Marks) – Answer any FIVE Questions</h2>
<ol start="11">
<li><p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(13)</p></li>
<li><p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(13)</p></li>
<li><p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(13)</p></li>
</ol>
<hr/>
<h2>PART C – (1 × 15 = 15 Marks)</h2>
<ol start="18">
<li><p>(a)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(15)</p>
<p style="text-align:center">(OR)</p>
<p>(b)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(15)</p></li>
</ol>`

export function ExaminationModule() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [tab, setTab]           = useState<TabType>('question_papers')
  const [papers, setPapers]     = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])
  const [editing, setEditing]   = useState<any | null>(null)
  const [content, setContent]   = useState(QP_TEMPLATE)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [qpFiles, setQpFiles]   = useState<UploadedFile[]>([])
  const [section, setSection]   = useState('II CSE-A')
  const [showForm, setShowForm] = useState(false)
  const [schedForm, setSchedForm] = useState({
    subject_code: '', subject_name: '', exam_type: 'Semester End Exam',
    date: '', time: '09:00', venue: '', section: 'ALL', duration: '3 Hours'
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  useEffect(() => {
    if (!authUser) return
    supabase.from('subjects').select('*').eq('section', section).eq('semester', currentSem(section)).order('code')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [section, authUser])

  const loadData = async () => {
    const { data: qpData } = await supabase.from('announcements').select('*')
      .like('audience', 'QP:%').order('created_at', { ascending: false })
    if (qpData) {
      setPapers(qpData.map(a => {
        try { return { id: a.id, ...JSON.parse(a.body), created_at: a.created_at, created_by: a.created_by } }
        catch { return null }
      }).filter(Boolean))
    }

    const { data: schedData } = await supabase.from('announcements').select('*')
      .like('audience', 'EXAM_SCHED:%').order('created_at', { ascending: false })
    if (schedData) {
      setSchedule(schedData.map(a => {
        try { return { id: a.id, ...JSON.parse(a.body), created_at: a.created_at } }
        catch { return null }
      }).filter(Boolean))
    }
  }

  useEffect(() => { if (profile) loadData() }, [profile])

  const saveQP = async () => {
    if (!profile) return
    setSaving(true)
    const body = JSON.stringify({
      title: editing?.title ?? 'Question Paper',
      subject_code: editing?.subject_code ?? '',
      subject_name: editing?.subject_name ?? '',
      exam_type: editing?.exam_type ?? 'Semester End Exam',
      section: editing?.section ?? section,
      academic_year: '2025-2026',
      status: editing?.status ?? 'DRAFT',
      content
    })
    if (editing?.id) {
      await supabase.from('announcements').update({ body }).eq('id', editing.id)
    } else {
      await supabase.from('announcements').insert({
        title: `QP: ${editing?.subject_code ?? ''} – ${editing?.exam_type ?? ''}`,
        body,
        audience: `QP:${section}`,
        is_urgent: false,
        created_by: profile.id,
        department_id: '00000000-0000-0000-0000-000000000001'
      })
    }
    setSaving(false)
    setSaveMsg('✓ Saved')
    loadData()
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const updateQPStatus = async (id: string, status: QPStatus, currentBody: string) => {
    try {
      const parsed = JSON.parse(currentBody)
      await supabase.from('announcements').update({
        body: JSON.stringify({ ...parsed, status })
      }).eq('id', id)
      loadData()
    } catch {}
  }

  const printQP = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Question Paper</title>
    <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:2.5cm;line-height:1.7}
    h1{font-size:14pt;text-align:center}h2{font-size:12pt}table{border-collapse:collapse;width:100%;margin:.5cm 0}
    th,td{border:1px solid #000;padding:4px 8px;font-size:10pt}th{background:#f0f0f0}
    @media print{body{margin:1.5cm}}</style></head><body>${content}</body></html>`)
    win.document.close()
    win.print()
  }

  const addSchedule = async () => {
    if (!profile || !schedForm.subject_code || !schedForm.date) return
    setSaving(true)
    await supabase.from('announcements').insert({
      title: `SCHED: ${schedForm.subject_code} – ${schedForm.exam_type}`,
      body: JSON.stringify(schedForm),
      audience: `EXAM_SCHED:${schedForm.section}`,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    setSaving(false)
    setShowForm(false)
    setSchedForm({ subject_code:'', subject_name:'', exam_type:'Semester End Exam', date:'', time:'09:00', venue:'', section:'ALL', duration:'3 Hours' })
    loadData()
  }

  const exportSchedule = () => {
    const rows = schedule.map((s, i) => ({
      'S.No': i+1, 'Subject Code': s.subject_code, 'Subject Name': s.subject_name,
      'Exam Type': s.exam_type, 'Date': s.date, 'Time': s.time,
      'Duration': s.duration, 'Venue': s.venue, 'Section': s.section
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Exam Schedule')
    XLSX.writeFile(wb, `Exam_Schedule_CSE_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-cyan-400">// SECTION: EXAMINATION</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Examination Module</h1>
        <p className="font-mono text-xs text-slate-400 mt-1">
          Question paper submission & approval · Exam schedules · Marks analysis
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {([
          { key: 'question_papers', label: 'Question Papers', icon: FileText },
          { key: 'exam_schedule',   label: 'Exam Schedule',   icon: Calendar },
          { key: 'analysis',        label: 'Marks Analysis',  icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs border-b-2 transition-all ${tab === key ? 'border-primary text-cyan-400' : 'border-transparent text-slate-400 hover:text-foreground'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── QUESTION PAPERS ── */}
      {tab === 'question_papers' && (
        <div className="space-y-4">
          {!editing ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <select value={section} onChange={e => setSection(e.target.value)}
                    className="h-9 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {isFaculty && (
                  <button onClick={() => setEditing({ title: 'New Question Paper', subject_code: '', subject_name: '', exam_type: 'Semester End Exam', section, status: 'DRAFT' })}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90">
                    <Plus className="w-3 h-3" /> New Question Paper
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(['DRAFT','SUBMITTED','APPROVED','REJECTED'] as QPStatus[]).map(s => (
                  <div key={s} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
                    <p className="font-mono text-xs text-slate-400 mb-1">{s}</p>
                    <p className="text-2xl font-bold">{papers.filter(p => p.status === s).length}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg">
                <div className="px-6 py-4 border-b border-white/10">
                  <span className="font-mono text-xs text-cyan-400">// ALL QUESTION PAPERS</span>
                </div>
                {papers.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <p className="font-mono text-sm text-slate-400">No question papers yet</p>
                  </div>
                ) : papers.map(paper => (
                  <div key={paper.id} className="flex items-center gap-4 px-6 py-4 border-b border-white/10 last:border-0 hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`font-mono text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[paper.status as QPStatus]}`}>{paper.status}</span>
                        <span className="font-mono text-xs text-slate-400">{paper.exam_type}</span>
                        <span className="font-mono text-xs text-slate-400">{paper.section}</span>
                      </div>
                      <p className="font-medium text-sm">{paper.subject_code} — {paper.subject_name || paper.title}</p>
                      <p className="font-mono text-xs text-slate-400">{new Date(paper.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => { setEditing(paper); setContent(paper.content ?? QP_TEMPLATE) }}
                        className="font-mono text-xs px-3 py-1.5 border border-white/10 rounded hover:border-cyan-500/50 transition-colors">
                        Open
                      </button>
                      {isHOD && paper.status === 'SUBMITTED' && (
                        <>
                          <button onClick={() => updateQPStatus(paper.id, 'APPROVED', JSON.stringify(paper))}
                            className="flex items-center gap-1 font-mono text-xs px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:text-white transition-all rounded hover:bg-green-700">
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => updateQPStatus(paper.id, 'REJECTED', JSON.stringify(paper))}
                            className="flex items-center gap-1 font-mono text-xs px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/40 hover:text-white transition-all rounded hover:bg-red-700">
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Editor view */
            <div className="space-y-4">
              <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-cyan-400">// QUESTION PAPER EDITOR</span>
                  <button onClick={() => setEditing(null)} className="font-mono text-xs text-slate-400 hover:text-foreground">← Back to list</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="font-mono text-xs text-slate-400">Subject Code</label>
                    <select value={editing.subject_code}
                      onChange={e => {
                        const sub = subjects.find(s => s.code === e.target.value)
                        setEditing({ ...editing, subject_code: e.target.value, subject_name: sub?.name ?? '' })
                      }}
                      className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                      <option value="">Select...</option>
                      {subjects.map(s => <option key={s.id} value={s.code}>{s.code} – {s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-xs text-slate-400">Exam Type</label>
                    <select value={editing.exam_type} onChange={e => setEditing({ ...editing, exam_type: e.target.value })}
                      className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                      {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-xs text-slate-400">Section</label>
                    <select value={editing.section} onChange={e => setEditing({ ...editing, section: e.target.value })}
                      className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                      {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-xs text-slate-400">Status</label>
                    <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}
                      className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                      <option value="DRAFT">Draft</option>
                      <option value="SUBMITTED">Submit for Approval</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saveMsg && <span className="font-mono text-xs text-green-500">{saveMsg}</span>}
                  <button onClick={printQP}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80">
                    <Download className="w-3 h-3" /> Print / PDF
                  </button>
                  <button onClick={saveQP} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {saving ? 'Saving...' : 'Save Question Paper'}
                  </button>
                </div>
              </div>
              {/* File upload for question paper PDF */}
              <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4 space-y-3">
                <span className="font-mono text-xs text-cyan-400">// UPLOAD QUESTION PAPER PDF</span>
                <p className="font-mono text-xs text-slate-400">Upload the final question paper as PDF — only visible to HOD for approval</p>
                <FileUpload
                  bucket="question-papers"
                  folder={`${editing.section ?? section}/${editing.exam_type ?? 'exam'}`.replace(/\s+/g,'-')}
                  accept=".pdf,.doc,.docx"
                  maxSizeMB={20}
                  label="Upload Question Paper (PDF / Word)"
                  onUpload={(file) => setQpFiles(prev => [...prev, file])}
                />
                <FileList
                  files={qpFiles}
                  canDelete={!!isFaculty || !!isHOD}
                  onDelete={(file) => setQpFiles(prev => prev.filter(f => f.id !== file.id))}
                />
              </div>
              <RichEditor key={editing.id ?? 'new'} content={content} onChange={setContent} editable={isFaculty || false} />
            </div>
          )}
        </div>
      )}

      {/* ── EXAM SCHEDULE ── */}
      {tab === 'exam_schedule' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-slate-400">{schedule.length} scheduled exams</p>
            <div className="flex gap-2">
              {schedule.length > 0 && (
                <button onClick={exportSchedule}
                  className="flex items-center gap-2 px-3 py-2 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-green-700">
                  <Download className="w-3 h-3" /> Export
                </button>
              )}
              {isHOD && (
                <button onClick={() => setShowForm(!showForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Add Exam
                </button>
              )}
            </div>
          </div>

          {showForm && isHOD && (
            <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-primary/30 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-cyan-400">// ADD EXAM SCHEDULE</span>
                <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Subject Code</label>
                  <input value={schedForm.subject_code} onChange={e => setSchedForm({...schedForm, subject_code: e.target.value})}
                    placeholder="e.g. CS24401"
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Subject Name</label>
                  <input value={schedForm.subject_name} onChange={e => setSchedForm({...schedForm, subject_name: e.target.value})}
                    placeholder="Operating Systems"
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Exam Type</label>
                  <select value={schedForm.exam_type} onChange={e => setSchedForm({...schedForm, exam_type: e.target.value})}
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                    {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Section</label>
                  <select value={schedForm.section} onChange={e => setSchedForm({...schedForm, section: e.target.value})}
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                    <option value="ALL">All Sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Date *</label>
                  <input type="date" value={schedForm.date} onChange={e => setSchedForm({...schedForm, date: e.target.value})}
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Time</label>
                  <input type="time" value={schedForm.time} onChange={e => setSchedForm({...schedForm, time: e.target.value})}
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Duration</label>
                  <select value={schedForm.duration} onChange={e => setSchedForm({...schedForm, duration: e.target.value})}
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                    <option>1 Hour</option><option>2 Hours</option><option>3 Hours</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Venue</label>
                  <input value={schedForm.venue} onChange={e => setSchedForm({...schedForm, venue: e.target.value})}
                    placeholder="e.g. CS Hall A"
                    className="w-full h-9 px-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>
              <button onClick={addSchedule} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                Add to Schedule
              </button>
            </div>
          )}

          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/50">
                  {['Subject','Exam Type','Section','Date','Time','Duration','Venue'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedule.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center font-mono text-sm text-slate-400">No exams scheduled yet</td></tr>
                ) : schedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((s, i) => (
                  <tr key={i} className="hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold">{s.subject_code}</p>
                      <p className="font-mono text-xs text-slate-400">{s.subject_name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{s.exam_type}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.section}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold">{s.date ? new Date(s.date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.time}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.duration}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.venue || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ANALYSIS ── */}
      {tab === 'analysis' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={section} onChange={e => setSection(e.target.value)}
              className="h-9 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map(sub => (
              <MarksAnalysisCard key={sub.id} subject={sub} section={section} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MarksAnalysisCard({ subject, section }: { subject: Subject; section: string }) {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const { data: students } = await supabase.from('profiles')
        .select('id').eq('role', 'STUDENT').eq('section', section)
      if (!students?.length) return

      const ids = students.map(s => s.id)
      const { data: marks } = await supabase.from('marks')
        .select('marks_obtained, max_marks, exam_type, student_id')
        .eq('subject_id', subject.id).in('student_id', ids)

      if (!marks?.length) return

      const semEnd  = marks.filter(m => m.exam_type === 'SEM_END')
      const avgSEE  = semEnd.length ? Math.round(semEnd.reduce((s, m) => s + Number(m.marks_obtained), 0) / semEnd.length) : 0
      const maxSEE  = semEnd.length ? semEnd[0].max_marks : 60
      const pass    = semEnd.filter(m => Number(m.marks_obtained) >= (Number(m.max_marks) * 0.45)).length
      const fail    = semEnd.length - pass

      const grades = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, U: 0 }
      semEnd.forEach(m => {
        const pct = (Number(m.marks_obtained) / Number(m.max_marks)) * 100
        if (pct >= 91) grades['O']++
        else if (pct >= 81) grades['A+']++
        else if (pct >= 71) grades['A']++
        else if (pct >= 61) grades['B+']++
        else if (pct >= 56) grades['B']++
        else if (pct >= 50) grades['C']++
        else grades['U']++
      })

      setStats({ avgSEE, maxSEE, pass, fail, total: semEnd.length, grades })
    }
    load()
  }, [subject.id, section])

  if (!stats) return (
    <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
      <p className="font-mono text-xs text-slate-400">{subject.code} — {subject.name}</p>
      <p className="font-mono text-xs text-slate-400 mt-2">No marks data</p>
    </div>
  )

  const passPct = stats.total > 0 ? Math.round(stats.pass / stats.total * 100) : 0

  return (
    <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4 space-y-3">
      <div>
        <p className="font-mono text-xs text-slate-400">{subject.code}</p>
        <p className="font-medium text-sm">{subject.name}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-2 text-center">
          <p className="font-mono text-xs text-slate-400">Avg SEE</p>
          <p className="font-mono text-sm font-bold">{stats.avgSEE}/{stats.maxSEE}</p>
        </div>
        <div className={`rounded p-2 text-center ${passPct >= 75 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <p className="font-mono text-xs text-slate-400">Pass %</p>
          <p className={`font-mono text-sm font-bold ${passPct >= 75 ? 'text-green-500' : 'text-red-500'}`}>{passPct}%</p>
        </div>
        <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-2 text-center">
          <p className="font-mono text-xs text-slate-400">Appeared</p>
          <p className="font-mono text-sm font-bold">{stats.total}</p>
        </div>
      </div>
      <div className="flex gap-1">
        {Object.entries(stats.grades).map(([g, count]) => (
          Number(count) > 0 && (
            <div key={g} className="flex-1 text-center">
              <p className="font-mono text-xs font-bold">{String(count)}</p>
              <p className="font-mono text-xs text-slate-400">{g}</p>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
// File upload section is integrated via FileUpload component in the editor view
