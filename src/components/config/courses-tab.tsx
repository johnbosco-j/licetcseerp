"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { CSE_R2024 } from "@/lib/regulations"
import { SECTIONS, type Offering, type Term, type Vertical, type StudentGroup } from "@/lib/academic"
import { inputCls, btnCls, ghostCls } from "./terms-tab"

type Staff = { id: string; full_name: string }
type Link = { subject_id: string; faculty_id: string; role: string }

export function CoursesTab({ terms, verticals, groups }: { terms: Term[]; verticals: Vertical[]; groups: StudentGroup[] }) {
  const [termId, setTermId] = useState(terms.find(t => t.is_current)?.id ?? terms[0]?.id ?? '')
  const [section, setSection] = useState('')
  const [rows, setRows] = useState<Offering[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [copyFrom, setCopyFrom] = useState('')
  const term = terms.find(t => t.id === termId)

  const load = useCallback(async () => {
    if (!termId) return
    setLoading(true)
    const { data } = await supabase.from('subjects').select('*').eq('term_id', termId).order('section', { nullsFirst: true }).order('code')
    const rs = (data ?? []) as Offering[]
    setRows(rs)
    const ids = rs.map(r => r.id)
    const ls: Link[] = []
    for (let i = 0; i < ids.length; i += 150) {
      const { data: l } = await supabase.from('subject_faculty').select('*').in('subject_id', ids.slice(i, i + 150))
      ls.push(...((l ?? []) as Link[]))
    }
    setLinks(ls); setDirty(new Set()); setLoading(false)
  }, [termId])
  useEffect(() => { load() }, [load])
  useEffect(() => { supabase.from('profiles').select('id, full_name').neq('role', 'STUDENT').eq('is_active', true).order('full_name').then(({ data }) => setStaff((data ?? []) as Staff[])) }, [])

  const shown = useMemo(() => rows.filter(r => !section || r.section === section || (section === 'COHORT' && r.section === null)), [rows, section])
  const set = (id: string, patch: Partial<Offering>) => { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); setDirty(d => new Set(d).add(id)) }

  const saveRow = async (r: Offering) => {
    const { error } = await supabase.from('subjects').update({
      code: r.code, name: r.name, short_name: r.short_name, semester: r.semester, section: r.section || null, cohort_grad_year: r.cohort_grad_year,
      audience: r.audience, audience_value: r.audience === 'VERTICAL' ? r.audience_value : null, group_id: r.audience === 'GROUP' ? r.group_id : null,
      credits: r.credits, faculty_names: r.faculty_names, is_active: r.is_active, course_type: r.course_type,
      faculty_id: links.find(l => l.subject_id === r.id && l.role === 'MAIN')?.faculty_id ?? null,
    }).eq('id', r.id)
    if (reportResult(error, `${r.code} saved`)) setDirty(d => { const n = new Set(d); n.delete(r.id); return n })
  }
  const setFaculty = async (r: Offering, ids: string[]) => {
    await supabase.from('subject_faculty').delete().eq('subject_id', r.id)
    if (ids.length) {
      const { error } = await supabase.from('subject_faculty').insert(ids.map((f, i) => ({ subject_id: r.id, faculty_id: f, role: i === 0 ? 'MAIN' : 'ASSISTANT' })))
      if (!reportResult(error)) return
    }
    await supabase.from('subjects').update({ faculty_id: ids[0] ?? null }).eq('id', r.id)
    // keep "My classes" in sync: the course's timetable hours get the same faculty
    await supabase.from('timetable_entries').update({ faculty_ids: ids }).eq('subject_id', r.id)
    setLinks(ls => [...ls.filter(l => l.subject_id !== r.id), ...ids.map((f, i) => ({ subject_id: r.id, faculty_id: f, role: i === 0 ? 'MAIN' : 'ASSISTANT' }))])
    toast.success('Faculty updated for the course and its timetable hours')
  }
  const remove = async (r: Offering) => {
    const { count } = await supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('subject_id', r.id)
    if (count) { toast.error(`${r.code} has ${count} recorded hours of attendance — untick "active" instead of deleting it.`); return }
    if (!confirm(`Delete ${r.code} (${r.section ?? 'combined'})? Its timetable hours are removed too.`)) return
    await supabase.from('timetable_entries').delete().eq('subject_id', r.id)
    const { error } = await supabase.from('subjects').delete().eq('id', r.id)
    if (reportResult(error, 'Deleted')) load()
  }
  const add = async () => {
    const sec = section && section !== 'COHORT' ? section : 'I CSE-A'
    const { error } = await supabase.from('subjects').insert({ code: 'NEW', name: 'New course', semester: 1, section: sec, term_id: termId, academic_year: term?.academic_year, audience: 'ALL' })
    if (reportResult(error, 'Course added — fill in its details')) load()
  }
  const copy = async () => {
    const src = terms.find(t => t.id === copyFrom)
    if (!src || !term) return
    if (!confirm(`Copy every course from ${src.label} into ${term.label}? Sections move up one year (I → II …) only if you choose "promote".`)) return
    const promote = confirm('Promote sections by one year while copying (e.g. last odd → this even keeps the same class; last year → this year moves I → II)?\n\nOK = promote, Cancel = keep the same section names.')
    const { data } = await supabase.from('subjects').select('*').eq('term_id', copyFrom)
    const up: Record<string, string> = { 'I': 'II', 'II': 'III', 'III': 'IV' }
    const rowsIn = ((data ?? []) as (Offering & { id: string })[])
      .filter(o => !promote || !o.section || !o.section.startsWith('IV'))
      .map(o => ({
        ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id')) as Omit<Offering, 'id'>, term_id: termId, academic_year: term.academic_year,
        section: o.section && promote ? o.section.replace(/^(I{1,3})(?= )/, m => up[m]) : o.section,
      }))
    if (!rowsIn.length) { toast.error('That term has no courses'); return }
    const { error } = await supabase.from('subjects').insert(rowsIn.map(r => { const x = { ...r } as Record<string, unknown>; delete x.created_at; return x }))
    if (reportResult(error, `${rowsIn.length} courses copied. Edit semesters/codes for the new term as needed.`)) load()
  }
  const fromCurriculum = async () => {
    const sec = section && section !== 'COHORT' ? section : ''
    if (!sec || !term) { toast.error('Pick a section first'); return }
    const y = ({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[sec.split(' ')[0]]
    const sem = y * 2 - (term.parity === 'ODD' ? 1 : 0)
    const list = CSE_R2024.filter(c => c.semester === sem)
    const have = new Set(rows.filter(r => r.section === sec).map(r => r.code))
    const add = list.filter(c => !have.has(c.code))
    if (!add.length) { toast.info(`All R2024 semester ${sem} courses already exist for ${sec}`); return }
    if (!confirm(`Add ${add.length} R2024 semester ${sem} courses to ${sec}? (Only for batches on R2024.)`)) return
    const grad = Number(term.academic_year.split('-')[1]) + (4 - y)
    const { error } = await supabase.from('subjects').insert(add.map(c => ({
      code: c.code, name: c.title, semester: sem, credits: c.credits, section: sec, term_id: termId, academic_year: term.academic_year,
      cohort_grad_year: grad, audience: 'ALL', course_type: c.type, regulation: 'R2024', l: c.L, t: c.T, p: c.P,
    })))
    if (reportResult(error, `${add.length} courses added`)) load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={termId} onChange={e => setTermId(e.target.value)} className={inputCls}>{terms.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select value={section} onChange={e => setSection(e.target.value)} className={inputCls}>
          <option value="">All classes</option>
          {SECTIONS.map(s => <option key={s}>{s}</option>)}
          <option value="COHORT">Combined (verticals / honours)</option>
        </select>
        <button onClick={add} className={ghostCls}><Plus className="w-4 h-4" /> Add course</button>
        <button onClick={fromCurriculum} className={ghostCls}>Add from R2024 curriculum</button>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={inputCls}><option value="">Copy courses from…</option>{terms.filter(t => t.id !== termId).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <button onClick={copy} disabled={!copyFrom} className={ghostCls}><Copy className="w-4 h-4" /> Copy</button>
        </span>
      </div>
      {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-[12.5px] border-collapse">
            <thead><tr className="bg-licet-paper text-left">
              {['Class', 'Code', 'Short', 'Course name', 'Sem', 'For', 'Faculty (ERP accounts — first is main)', 'Faculty as printed', ''].map(h => <th key={h} className="px-2 py-2 border-b border-border font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className={`border-b border-border align-top ${r.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-2 py-1.5">
                    <select value={r.section ?? ''} onChange={e => set(r.id, { section: e.target.value || null })} className="h-8 px-1 rounded border border-input bg-white text-[12px]">
                      <option value="">Combined</option>{SECTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                    {r.section === null && <input type="number" value={r.cohort_grad_year ?? ''} onChange={e => set(r.id, { cohort_grad_year: Number(e.target.value) || null })} title="Graduating batch (e.g. 2028)" className="mt-1 h-8 w-20 px-1 rounded border border-input text-[12px] block" />}
                  </td>
                  <td className="px-2 py-1.5"><input value={r.code} onChange={e => set(r.id, { code: e.target.value.toUpperCase() })} className="h-8 w-24 px-1 rounded border border-input font-mono text-[12px]" /></td>
                  <td className="px-2 py-1.5"><input value={r.short_name ?? ''} onChange={e => set(r.id, { short_name: e.target.value })} className="h-8 w-24 px-1 rounded border border-input text-[12px]" /></td>
                  <td className="px-2 py-1.5"><input value={r.name} onChange={e => set(r.id, { name: e.target.value })} className="h-8 w-64 px-1 rounded border border-input text-[12px]" /></td>
                  <td className="px-2 py-1.5"><input type="number" min={1} max={8} value={r.semester} onChange={e => set(r.id, { semester: Number(e.target.value) })} className="h-8 w-14 px-1 rounded border border-input text-[12px]" /></td>
                  <td className="px-2 py-1.5">
                    <select value={`${r.audience}|${r.audience_value ?? r.group_id ?? ''}`} onChange={e => { const [a, v] = e.target.value.split('|'); set(r.id, { audience: a as Offering['audience'], audience_value: a === 'VERTICAL' ? v : null, group_id: a === 'GROUP' ? v : null }) }} className="h-8 px-1 rounded border border-input bg-white text-[12px]">
                      <option value="ALL|">Whole class</option>
                      {verticals.map(v => <option key={v.code} value={`VERTICAL|${v.code}`}>{v.code} vertical</option>)}
                      {groups.map(g => <option key={g.id} value={`GROUP|${g.id}`}>{g.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select multiple value={links.filter(l => l.subject_id === r.id).sort((a, b) => (a.role === 'MAIN' ? -1 : 1) - (b.role === 'MAIN' ? -1 : 1)).map(l => l.faculty_id)}
                      onChange={e => setFaculty(r, [...e.target.selectedOptions].map(o => o.value))} className="h-20 w-52 px-1 rounded border border-input bg-white text-[12px]">
                      {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><textarea value={r.faculty_names ?? ''} onChange={e => set(r.id, { faculty_names: e.target.value })} rows={3} className="w-56 px-1 py-0.5 rounded border border-input text-[12px]" /></td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button onClick={() => saveRow(r)} disabled={!dirty.has(r.id)} className={`${btnCls} h-8`}><Save className="w-3.5 h-3.5" /></button>
                    <label className="block mt-1 text-[11.5px] text-muted-foreground"><input type="checkbox" checked={r.is_active} onChange={e => set(r.id, { is_active: e.target.checked })} className="accent-licet-indigo mr-1" />active</label>
                    <button onClick={() => remove(r)} className="mt-1 text-red-700 inline-flex items-center gap-0.5 text-[11.5px] hover:underline"><Trash2 className="w-3 h-3" /> delete</button>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No courses yet for this term{section ? ' and class' : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">Hold Ctrl (⌘ on Mac) to pick several faculty. Selecting faculty also updates every timetable hour of that course, so it appears in their “My classes”. Faculty from other departments without ERP accounts can be typed under “Faculty as printed”; create their accounts in User Accounts when they need to mark attendance.</p>
    </div>
  )
}
