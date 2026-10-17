"use client"

// Outcome-based education: course outcomes, CO–PO mapping, assessment → CO mapping,
// computed attainment (database functions obe_*), publishing internal marks with the
// 7-day objection window, and the department's PO attainment for NAAC 2.6.2 / NBA.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { Loader2, Save, Download, Send, Target } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { isTier1 } from "@/lib/roles"
import { courseType } from "@/lib/regulations"
import { POS, PSOS } from "@/lib/obe"
import { loadTerms, type Term } from "@/lib/academic"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import type { AuthUser } from "@/lib/auth"

type Course = { id: string; code: string; name: string; short_name: string | null; section: string | null; semester: number
  co1: string | null; co2: string | null; co3: string | null; co4: string | null; co5: string | null; co6: string | null }
type Rec = Record<string, unknown>
const OUTCOMES = [...POS.map(p => p.code), ...PSOS.map(p => p.code)]
const THEORY = ['CIA1_CT', 'CIA1_CAT', 'CIA1_ACTIVITY', 'CIA2_CT', 'CIA2_CAT', 'CIA2_ACTIVITY', 'SEM_END']
const LAB = ['CIA1_EXP', 'CIA1_RECORD', 'CIA1_VIVA', 'CIA1_LAB', 'CIA2_EXP', 'CIA2_RECORD', 'CIA2_VIVA', 'CIA2_LAB']
const label = (t: string) => t.replace('SEM_END', 'Semester-end').replace(/_/g, ' ').replace('CAT', 'CAT').replace('CT', 'CT')
const card = "bg-card border border-border rounded-xl p-5 space-y-3"
const btn = "inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50"
const ghost = "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] font-medium hover:bg-muted disabled:opacity-50"

function exportXlsx(name: string, sheets: [string, Rec[]][]) {
  const wb = XLSX.utils.book_new()
  for (const [title, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'No data' }]), title.slice(0, 31))
  XLSX.writeFile(wb, `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function OutcomesPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const guard = useUnsavedGuard()

  useEffect(() => {
    const raw = localStorage.getItem('licet_user')
    if (!raw) { router.push('/login'); return }
    const au = JSON.parse(raw) as AuthUser
    if (au.type !== 'staff') { router.replace('/dashboard'); return }
    setUser(au)
    loadTerms().then(ts => { setTerms(ts); setTermId(ts.find(t => t.is_current)?.id ?? ts[0]?.id ?? '') })
  }, [router])
  const isHod = !!user && user.type === 'staff' && isTier1(user.data)

  // HOD: every course of the term; faculty: the courses they teach
  useEffect(() => {
    if (!user || !termId) return
    let off = false
    ;(async () => {
      const cols = 'id, code, name, short_name, section, semester, co1, co2, co3, co4, co5, co6'
      let list: Course[] = []
      if (isHod) {
        const { data } = await supabase.from('subjects').select(cols).eq('term_id', termId).order('code')
        list = (data ?? []) as Course[]
      } else {
        const [{ data: own }, { data: links }] = await Promise.all([
          supabase.from('subjects').select(cols).eq('term_id', termId).eq('faculty_id', user.data.id),
          supabase.from('subject_faculty').select(`subjects!inner(${cols}, term_id)`).eq('faculty_id', user.data.id).eq('subjects.term_id', termId),
        ])
        const m = new Map<string, Course>()
        for (const c of (own ?? []) as Course[]) m.set(c.id, c)
        for (const l of (links ?? []) as unknown as { subjects: Course }[]) m.set(l.subjects.id, l.subjects)
        list = [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
      }
      if (off) return
      setCourses(list)
      setCourseId(c => list.some(x => x.id === c) ? c : list[0]?.id ?? '')
    })()
    return () => { off = true }
  }, [user, termId, isHod])

  const course = courses.find(c => c.id === courseId) ?? null

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Outcome-based education</p>
        <h1 className="font-display text-2xl font-bold text-licet-indigo mt-1 flex items-center gap-2"><Target className="w-6 h-6" /> Outcomes (CO–PO)</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1">Write the course outcomes, map them to the programme outcomes, say which assessments measure each CO, and the ERP computes attainment from the marks and course feedback (80% direct, 20% indirect).</p>
      </div>
      <div className="flex flex-wrap gap-3 items-end" data-filter>
        <label className="text-[12px] text-muted-foreground">Term
          <select value={termId} onChange={e => { if (guard.confirmLeave()) setTermId(e.target.value) }} className="block mt-0.5 h-9 px-2 rounded-md border border-input bg-white text-[13.5px] text-foreground">
            {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted-foreground">Course
          <select value={courseId} onChange={e => { if (guard.confirmLeave()) setCourseId(e.target.value) }} className="block mt-0.5 h-9 px-2 rounded-md border border-input bg-white text-[13.5px] text-foreground min-w-[280px]">
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.short_name || c.name} · {c.section ?? 'combined'}</option>)}
          </select>
        </label>
        {guard.dirty && <span role="status" className="text-[12.5px] text-amber-800 pb-2">Unsaved changes</span>}
      </div>

      {!courses.length && termId && <p className={card + ' text-[13.5px] text-muted-foreground'}>{isHod ? 'No courses in this term.' : 'You are not linked to any course in this term. Ask the HOD to link you in Configuration → Courses.'}</p>}

      {course && (
        <div {...guard.bind} className="space-y-5">
          <CourseOutcomes key={'co' + course.id} course={course} onSaved={cos => setCourses(cs => cs.map(c => c.id === course.id ? { ...c, ...Object.fromEntries(cos.map((t, i) => [`co${i + 1}`, t || null])) } : c))} />
          <Mapping key={'map' + course.id} course={course} />
          <Attainment key={'att' + course.id} course={course} />
          <Publish key={'pub' + course.id} course={course} />
        </div>
      )}
      {isHod && termId && <ProgramReport termId={termId} termLabel={terms.find(t => t.id === termId)?.label ?? ''} />}
    </div>
  )
}

function CourseOutcomes({ course, onSaved }: { course: Course; onSaved: (cos: string[]) => void }) {
  const [cos, setCos] = useState<string[]>([course.co1, course.co2, course.co3, course.co4, course.co5, course.co6].map(x => x ?? ''))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('set_course_outcomes', { p_subject: course.id, p_cos: cos })
    setBusy(false)
    if (reportResult(error, 'Course outcomes saved')) onSaved(cos)
  }
  return (
    <section className={card}>
      <h2 className="font-semibold text-licet-indigo">1 · Course outcomes</h2>
      <div className="grid gap-2">
        {cos.map((t, i) => (
          <label key={i} className="flex items-start gap-2 text-[13px]"><span className="w-10 pt-2 font-semibold text-licet-violet">CO{i + 1}</span>
            <textarea value={t} onChange={e => setCos(c => c.map((x, j) => j === i ? e.target.value : x))} rows={1}
              placeholder={i < 5 ? 'On completion, students will be able to…' : 'Optional'} className="flex-1 min-h-9 px-2 py-1.5 rounded-md border border-input text-[13px] focus:outline-none focus:border-licet-violet" />
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save outcomes</button>
    </section>
  )
}

function Mapping({ course }: { course: Course }) {
  const [matrix, setMatrix] = useState<Record<string, number>>({})          // `${co}|${PO}` → level
  const [assess, setAssess] = useState<Set<string>>(new Set())              // `${exam_type}|${co}`
  const [present, setPresent] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const cos = [1, 2, 3, 4, 5, 6].filter(n => (course as unknown as Record<string, string | null>)[`co${n}`] || Object.keys(matrix).some(k => k.startsWith(`${n}|`)))
  const shown = cos.length ? cos : [1, 2, 3, 4, 5]

  useEffect(() => {
    let off = false
    Promise.all([
      supabase.from('co_po_map').select('co, outcome, level').eq('subject_id', course.id),
      supabase.from('assessment_co_map').select('exam_type, co').eq('subject_id', course.id),
      supabase.from('marks').select('exam_type').eq('subject_id', course.id).range(0, 9999),
    ]).then(([m, a, mk]) => {
      if (off) return
      setMatrix(Object.fromEntries(((m.data ?? []) as { co: number; outcome: string; level: number }[]).map(r => [`${r.co}|${r.outcome}`, r.level])))
      setAssess(new Set(((a.data ?? []) as { exam_type: string; co: number }[]).map(r => `${r.exam_type}|${r.co}`)))
      setPresent([...new Set(((mk.data ?? []) as { exam_type: string }[]).map(r => r.exam_type))])
    })
    return () => { off = true }
  }, [course.id])

  const type = courseType(course.code)
  const components = useMemo(() => {
    const base = type === 'LAB' ? [...LAB, 'SEM_END'] : type === 'LAB_INTEGRATED' ? [...THEORY.slice(0, 6), ...LAB, 'SEM_END'] : THEORY
    return [...new Set([...base, ...present])]
  }, [type, present])

  const save = async () => {
    setBusy(true)
    const rows = Object.entries(matrix).filter(([, v]) => v).map(([k, level]) => { const [co, outcome] = k.split('|'); return { subject_id: course.id, co: Number(co), outcome, level } })
    const amap = [...assess].map(k => { const [exam_type, co] = k.split('|'); return { subject_id: course.id, exam_type, co: Number(co) } })
    let error = (await supabase.from('co_po_map').delete().eq('subject_id', course.id)).error
    if (!error && rows.length) error = (await supabase.from('co_po_map').insert(rows)).error
    if (!error) error = (await supabase.from('assessment_co_map').delete().eq('subject_id', course.id)).error
    if (!error && amap.length) error = (await supabase.from('assessment_co_map').insert(amap)).error
    setBusy(false)
    reportResult(error, 'Mapping saved — attainment below is updated')
    window.dispatchEvent(new Event('licet:obe-changed'))
  }

  return (
    <section className={card}>
      <h2 className="font-semibold text-licet-indigo">2 · CO–PO matrix and assessments</h2>
      <p className="text-[12.5px] text-muted-foreground">Correlation: 1 low, 2 medium, 3 high, blank none.</p>
      <div className="overflow-x-auto">
        <table className="text-[12px] border-separate border-spacing-0.5">
          <thead><tr><th />{OUTCOMES.map(o => <th key={o} className="px-1 font-semibold text-licet-indigo" title={[...POS, ...PSOS].find(p => p.code === o)?.text}>{o}</th>)}</tr></thead>
          <tbody>{shown.map(co => (
            <tr key={co}><td className="pr-2 font-semibold text-licet-violet">CO{co}</td>
              {OUTCOMES.map(o => {
                const v = matrix[`${co}|${o}`] ?? 0
                return <td key={o}><select aria-label={`CO${co} ${o}`} value={v || ''} onChange={e => setMatrix(m => ({ ...m, [`${co}|${o}`]: Number(e.target.value) || 0 }))}
                  className={`w-11 h-8 rounded border text-center ${v === 3 ? 'bg-licet-indigo text-white border-licet-indigo' : v === 2 ? 'bg-licet-violet/70 text-white border-licet-violet' : v === 1 ? 'bg-licet-cream border-licet-gold' : 'bg-white border-input'}`}>
                  <option value="">–</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></td>
              })}
            </tr>))}</tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-muted-foreground pt-2">Which COs does each assessment measure? (Tick every CO its questions test.)</p>
      <div className="overflow-x-auto">
        <table className="text-[12.5px]">
          <thead><tr><th className="text-left pr-3 font-medium text-muted-foreground">Assessment</th>{shown.map(co => <th key={co} className="px-2 text-licet-violet">CO{co}</th>)}</tr></thead>
          <tbody>{components.map(c => (
            <tr key={c} className="border-t border-border/60"><td className="pr-3 py-1">{label(c)}{present.includes(c) ? '' : <span className="text-muted-foreground"> (no marks yet)</span>}</td>
              {shown.map(co => <td key={co} className="text-center"><input type="checkbox" aria-label={`${c} CO${co}`} checked={assess.has(`${c}|${co}`)} className="accent-licet-indigo"
                onChange={e => setAssess(s => { const n = new Set(s); if (e.target.checked) n.add(`${c}|${co}`); else n.delete(`${c}|${co}`); return n })} /></td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save mapping</button>
    </section>
  )
}

function Attainment({ course }: { course: Course }) {
  const [co, setCo] = useState<Rec[]>([])
  const [po, setPo] = useState<Rec[]>([])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion(v => v + 1)
    window.addEventListener('licet:obe-changed', bump)
    return () => window.removeEventListener('licet:obe-changed', bump)
  }, [])
  useEffect(() => {
    let off = false
    Promise.all([supabase.rpc('obe_co_attainment', { p_subject: course.id }), supabase.rpc('obe_po_attainment', { p_subject: course.id })])
      .then(([a, b]) => { if (!off) { setCo((a.data ?? []) as Rec[]); setPo((b.data ?? []) as Rec[]) } })
    return () => { off = true }
  }, [course.id, version])
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-licet-indigo">3 · Attainment</h2>
        <button onClick={() => exportXlsx(`Attainment_${course.code}`, [['CO attainment', co], ['PO attainment', po]])} className={ghost}><Download className="w-4 h-4" /> Excel</button>
      </div>
      {!co.some(r => r.students) ? <p className="text-[13px] text-muted-foreground">Map assessments to COs (above) and enter marks; attainment appears here.</p> : (
        <div className="grid lg:grid-cols-2 gap-5">
          <table className="text-[12.5px] w-full"><thead><tr className="text-left text-muted-foreground border-b border-border">{['CO', 'Assessments', 'Students', '≥ target', 'Level'].map(h => <th key={h} className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{co.map(r => <tr key={String(r.co)} className="border-b border-border/60"><td className="pr-2 font-semibold">CO{String(r.co)}</td><td className="pr-2 text-muted-foreground">{String(r.components ?? '—')}</td><td className="pr-2 tabular-nums">{String(r.students)}</td><td className="pr-2 tabular-nums">{r.pct == null ? '—' : `${r.pct}%`}</td><td className="pr-2 font-bold tabular-nums">{r.level == null ? '—' : String(r.level)}</td></tr>)}</tbody></table>
          <table className="text-[12.5px] w-full"><thead><tr className="text-left text-muted-foreground border-b border-border">{['Outcome', 'Direct', 'Indirect (feedback)', 'Attainment (of 3)'].map(h => <th key={h} className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{po.map(r => <tr key={String(r.outcome)} className="border-b border-border/60"><td className="pr-2 font-semibold">{String(r.outcome)}</td><td className="pr-2 tabular-nums">{r.direct == null ? '—' : String(r.direct)}</td><td className="pr-2 tabular-nums">{r.indirect == null ? '—' : `${r.indirect} (${r.feedback_responses})`}</td><td className="pr-2 font-bold tabular-nums">{r.final == null ? '—' : String(r.final)}</td></tr>)}</tbody></table>
        </div>
      )}
    </section>
  )
}

function Publish({ course }: { course: Course }) {
  const [types, setTypes] = useState<string[]>([])
  const [pubs, setPubs] = useState<Rec[]>([])
  const [objs, setObjs] = useState<Rec[]>([])
  const [reply, setReply] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)
  const load = useCallback(async () => {
    const [mk, p, o] = await Promise.all([
      supabase.from('marks').select('exam_type').eq('subject_id', course.id).range(0, 9999),
      supabase.from('marks_publications').select('*').eq('subject_id', course.id),
      supabase.from('mark_objections').select('*, profiles!mark_objections_student_id_fkey(full_name, register_number)').eq('subject_id', course.id).order('created_at', { ascending: false }),
    ])
    return { t: [...new Set(((mk.data ?? []) as { exam_type: string }[]).map(r => r.exam_type))].sort(), p: (p.data ?? []) as Rec[], o: (o.data ?? []) as Rec[] }
  }, [course.id])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let off = false
    load().then(r => { if (!off) { setTypes(r.t); setPubs(r.p); setObjs(r.o); setNow(Date.now()) } })
    return () => { off = true }
  }, [load, version])

  const publish = async (t: string) => {
    setBusy(true)
    const { error } = await supabase.rpc('publish_marks', { p_subject: course.id, p_exam_type: t })
    setBusy(false)
    if (reportResult(error, `${label(t)} published — students can raise objections for 7 days`)) setVersion(v => v + 1)
  }
  const decide = async (id: string, status: 'ACCEPTED' | 'REJECTED') => {
    const { data: me } = await supabase.auth.getUser()
    const { error } = await supabase.from('mark_objections').update({ status, response: reply[id] || null, decided_by: me.user?.id, decided_at: new Date().toISOString() }).eq('id', id)
    if (reportResult(error, status === 'ACCEPTED' ? 'Objection accepted — correct the mark in Assessments & Marks' : 'Objection answered')) setVersion(v => v + 1)
  }
  const pubOf = (t: string) => pubs.find(p => p.exam_type === t)

  return (
    <section className={card}>
      <h2 className="font-semibold text-licet-indigo">4 · Publish internal marks and objections</h2>
      <p className="text-[12.5px] text-muted-foreground">Publishing a component tells students its marks are final and opens a 7-day window for objections. Re-publishing after a correction opens a new window.</p>
      {!types.length ? <p className="text-[13px] text-muted-foreground">No marks entered for this course yet.</p> : (
        <ul className="text-[13px] divide-y divide-border border border-border rounded-md">
          {types.map(t => { const p = pubOf(t); const open = p && Date.parse(String(p.objection_until)) > now; return (
            <li key={t} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="flex-1 font-medium">{label(t)}</span>
              <span className="text-[12px] text-muted-foreground">{p ? `published ${new Date(String(p.published_at)).toLocaleDateString('en-IN')} · objections ${open ? 'open until ' + new Date(String(p.objection_until)).toLocaleDateString('en-IN') : 'closed'}` : 'not published'}</span>
              <button onClick={() => publish(t)} disabled={busy} className={ghost}><Send className="w-3.5 h-3.5" /> {p ? 'Publish again' : 'Publish'}</button>
            </li>) })}
        </ul>
      )}
      {objs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold text-licet-indigo">Objections</h3>
          {objs.map(o => { const who = o.profiles as { full_name: string; register_number: string | null } | null; return (
            <div key={String(o.id)} className="rounded-md border border-border p-3 text-[13px] space-y-1.5">
              <div className="flex flex-wrap justify-between gap-2"><span><b>{who?.full_name}</b> <span className="text-muted-foreground">{who?.register_number} · {label(String(o.exam_type))}</span></span>
                <span className={`text-[12px] font-semibold ${o.status === 'PENDING' ? 'text-amber-700' : o.status === 'ACCEPTED' ? 'text-green-800' : 'text-muted-foreground'}`}>{String(o.status).toLowerCase()}</span></div>
              <p>{String(o.reason)}</p>
              {o.status === 'PENDING' ? (
                <div className="flex flex-wrap gap-2">
                  <input value={reply[String(o.id)] ?? ''} onChange={e => setReply(r => ({ ...r, [String(o.id)]: e.target.value }))} placeholder="Reply to the student" data-filter className="flex-1 min-w-[200px] h-9 px-2 rounded-md border border-input text-[13px]" />
                  <button onClick={() => decide(String(o.id), 'ACCEPTED')} className={ghost}>Accept</button>
                  <button onClick={() => decide(String(o.id), 'REJECTED')} className={ghost}>Reject</button>
                </div>
              ) : o.response ? <p className="text-muted-foreground">Reply: {String(o.response)}</p> : null}
            </div>) })}
        </div>
      )}
    </section>
  )
}

function ProgramReport({ termId, termLabel }: { termId: string; termLabel: string }) {
  const [rows, setRows] = useState<Rec[] | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion(v => v + 1)
    window.addEventListener('licet:obe-changed', bump)
    return () => window.removeEventListener('licet:obe-changed', bump)
  }, [])
  useEffect(() => {
    let off = false
    supabase.rpc('obe_program_attainment', { p_term: termId }).then(({ data, error }) => {
      if (error) toast.error(error.message)
      if (!off) setRows((data ?? []) as Rec[])
    })
    return () => { off = true }
  }, [termId, version])
  const text = (o: string) => [...POS, ...PSOS].find(p => p.code === o)
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <div><h2 className="font-semibold text-licet-indigo">Programme outcome attainment — {termLabel}</h2>
          <p className="text-[12.5px] text-muted-foreground">Average of every course that maps the outcome (NAAC 2.6.2, NBA criterion 3). Department data only.</p></div>
        <button onClick={() => exportXlsx(`PO_attainment_${termLabel.replace(/\s+/g, '_')}`, [['PO attainment', (rows ?? []).map(r => ({ Outcome: r.outcome, Title: (text(String(r.outcome)) as { title?: string } | undefined)?.title ?? '', Statement: text(String(r.outcome))?.text ?? '', Courses: r.courses, 'Attainment (of 3)': r.attainment, Lowest: r.lowest, Highest: r.highest }))]])}
          className={ghost} disabled={!rows?.length}><Download className="w-4 h-4" /> Excel</button>
      </div>
      {rows === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : !rows.length
        ? <p className="text-[13px] text-muted-foreground">No course of this term has a CO–PO mapping with marks yet.</p>
        : <div className="flex flex-wrap gap-2">{rows.map(r => {
            const v = Number(r.attainment)
            return <div key={String(r.outcome)} title={text(String(r.outcome))?.text} className={`rounded-md border px-3 py-2 text-[12.5px] min-w-[96px] ${v >= 2.5 ? 'bg-green-50 border-green-200' : v >= 1.5 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <b className="block text-licet-indigo">{String(r.outcome)}</b><span className="text-[18px] font-bold tabular-nums">{v.toFixed(2)}</span><span className="block text-muted-foreground text-[11px]">{String(r.courses)} course{Number(r.courses) === 1 ? '' : 's'}</span></div>
          })}</div>}
    </section>
  )
}
