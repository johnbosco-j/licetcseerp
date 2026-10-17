"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { SECTIONS, type Offering, type Term, eligibility, TONE, offeringLabel } from "@/lib/academic"

type Row = { student_id: string; subject_id: string | null; label: string | null; conducted: number; attended: number; on_duty: number }
type Cond = { student_id: string; status: string; reason_kind: string }
type Stu = { id: string; full_name: string; register_number: string | null; roll_number: string | null; section: string | null }

export function SummaryView({ term, minPct, condPct, defaultSection }: { term: Term; minPct: number; condPct: number; defaultSection?: string | null }) {
  const [section, setSection] = useState(defaultSection ?? 'II CSE-A')
  const [rows, setRows] = useState<Row[]>([])
  const [students, setStudents] = useState<Stu[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [conds, setConds] = useState<Cond[]>([])
  const [filter, setFilter] = useState<'all' | 'short'>('all')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('att_term_summary', { p_term: term.id, p_section: term.is_current ? section : null })
    let rs = ((data ?? []) as Row[]).map(r => ({ ...r, conducted: Number(r.conducted), attended: Number(r.attended), on_duty: Number(r.on_duty ?? 0) }))
    if (error) rs = []
    // Past terms: section labels then referred to other batches — pick the class by its own (non-cohort) hours.
    const { data: own } = await supabase.from('attendance_sessions').select('roster').eq('term_id', term.id).eq('section', section).limit(400)
    const ids = new Set(((own ?? []) as { roster: string[] }[]).flatMap(s => s.roster))
    if (!term.is_current) rs = rs.filter(r => ids.has(r.student_id))
    const sids = [...new Set(rs.map(r => r.student_id))]
    const st: Stu[] = []
    for (let i = 0; i < sids.length; i += 150) {
      const { data: p } = await supabase.from('profiles').select('id, full_name, register_number, roll_number, section').in('id', sids.slice(i, i + 150))
      st.push(...((p ?? []) as Stu[]))
    }
    const subjIds = [...new Set(rs.map(r => r.subject_id).filter(Boolean))] as string[]
    const { data: offs } = subjIds.length ? await supabase.from('subjects').select('*').in('id', subjIds) : { data: [] }
    setRows(rs)
    const { data: cd } = await supabase.from('attendance_condonations').select('student_id, status, reason_kind').eq('term_id', term.id).in('status', ['PENDING', 'APPROVED'])
    setConds((cd ?? []) as Cond[])
    setStudents(st.sort((a, b) => (a.register_number ?? 'z' + a.full_name).localeCompare(b.register_number ?? 'z' + b.full_name)))
    setOfferings(((offs ?? []) as Offering[]).sort((a, b) => (a.short_name ?? a.code).localeCompare(b.short_name ?? b.code)))
    setLoading(false)
  }, [term, section])
  useEffect(() => { load() }, [load])

  const courseCols = useMemo(() => {
    const keys = new Map<string, string>()
    for (const o of offerings) keys.set(o.id, offeringLabel(o))
    for (const r of rows) if (!r.subject_id && r.label) keys.set('L:' + r.label, r.label.replace(/^Event: /, ''))
    return [...keys.entries()]
  }, [offerings, rows])

  const table = useMemo(() => students.map(s => {
    const mine = rows.filter(r => r.student_id === s.id)
    const conducted = mine.reduce((a, r) => a + r.conducted, 0)
    const attended = mine.reduce((a, r) => a + r.attended, 0)
    const pct = conducted ? attended / conducted * 100 : null
    const od = mine.reduce((a, r) => a + r.on_duty, 0)
    const cond = conds.find(c => c.student_id === s.id && c.status === 'APPROVED') ? 'APPROVED' : conds.find(c => c.student_id === s.id) ? 'PENDING' : null
    const per: Record<string, { c: number; a: number }> = {}
    for (const r of mine) { const k = r.subject_id ?? 'L:' + r.label; per[k] = { c: (per[k]?.c ?? 0) + r.conducted, a: (per[k]?.a ?? 0) + r.attended } }
    const el = eligibility(pct, minPct, condPct)
    const permitted = el.tone === 'ok' || (el.tone === 'warn' && cond === 'APPROVED')
    return { s, conducted, attended, od, cond, permitted, pct, el, per }
  }), [students, rows, minPct, condPct])
  const shown = filter === 'short' ? table.filter(t => t.pct !== null && Math.round(t.pct) < minPct) : table
  const counts = { ok: table.filter(t => t.el.tone === 'ok').length, warn: table.filter(t => t.el.tone === 'warn').length, bad: table.filter(t => t.el.tone === 'bad').length }

  const exportXlsx = () => {
    const header = ['Reg No', 'Roll No', 'Name', 'Section', 'Hours conducted', 'Hours attended', 'of which OD', 'Overall %', 'Status', 'Condonation', 'Permitted to write SEE', ...courseCols.map(([, n]) => n + ' %')]
    const data = table.map(t => [t.s.register_number ?? '', t.s.roll_number ?? '', t.s.full_name, t.s.section ?? '', t.conducted, t.attended,
      t.od, t.pct === null ? '' : Math.round(t.pct * 10) / 10, t.el.code, t.cond ?? '', t.pct === null ? '' : t.permitted ? 'Yes' : 'No', ...courseCols.map(([k]) => t.per[k]?.c ? Math.round(t.per[k].a / t.per[k].c * 1000) / 10 : '')])
    const ws = XLSX.utils.aoa_to_sheet([[`${section} — attendance summary, ${term.label}`], header, ...data])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Summary')
    XLSX.writeFile(wb, `Attendance_Summary_${section.replace(/\s/g, '_')}_${term.label.replace(/\s/g, '_')}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={section} onChange={e => setSection(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
          {SECTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-[13px]">
          <button onClick={() => setFilter('all')} className={`px-3 h-9 ${filter === 'all' ? 'bg-licet-indigo text-white' : 'bg-white'}`}>Everyone</button>
          <button onClick={() => setFilter('short')} className={`px-3 h-9 ${filter === 'short' ? 'bg-licet-indigo text-white' : 'bg-white'}`}>Below {minPct}%</button>
        </div>
        <div className="flex gap-2 text-[12.5px]">
          <span className={`px-2 py-1 rounded border ${TONE.ok}`}>{counts.ok} eligible</span>
          <span className={`px-2 py-1 rounded border ${TONE.warn}`}>{counts.warn} condonation</span>
          <span className={`px-2 py-1 rounded border ${TONE.bad}`}>{counts.bad} SA</span>
        </div>
        <button onClick={exportXlsx} disabled={!table.length} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50"><Download className="w-4 h-4" /> Excel</button>
      </div>
      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculating…</div>
      ) : !table.length ? (
        <div className="rounded-lg border border-dashed border-border bg-white px-6 py-10 text-center text-[13.5px] text-muted-foreground">No attendance for {section} in {term.label}.</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border bg-white max-h-[70vh]">
          <table className="text-[12.5px] border-collapse w-full">
            <thead className="sticky top-0 bg-licet-paper z-10">
              <tr>
                <th className="sticky left-0 bg-licet-paper text-left px-3 py-2 border-b border-r border-border min-w-[230px]">Student</th>
                <th className="px-2 py-2 border-b border-border">Hours</th>
                <th className="px-2 py-2 border-b border-border">Overall</th>
                <th className="px-2 py-2 border-b border-border">OD</th>
                <th className="px-2 py-2 border-b border-border">Status</th>
                {courseCols.map(([k, n]) => <th key={k} className="px-2 py-2 border-b border-l border-border font-medium whitespace-nowrap">{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(t => (
                <tr key={t.s.id} className="border-b border-border hover:bg-licet-cream/30">
                  <td className="sticky left-0 bg-white px-3 py-1.5 border-r border-border whitespace-nowrap"><span className="font-mono text-[11px] text-muted-foreground mr-2">{t.s.register_number ?? t.s.roll_number ?? '—'}</span>{t.s.full_name}</td>
                  <td className="px-2 text-center tabular-nums">{t.attended}/{t.conducted}</td>
                  <td className="px-2 text-center tabular-nums font-semibold">{t.pct === null ? '—' : `${Math.round(t.pct)}%`}</td>
                  <td className="px-2 text-center tabular-nums text-licet-violet">{t.od || ''}</td>
                  <td className="px-2 text-center whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${TONE[t.el.tone]}`} title={t.el.label}>{t.el.code}</span>{t.cond && <span className={`ml-1 text-[10.5px] ${t.cond === 'APPROVED' ? 'text-green-800' : 'text-amber-700'}`} title="Condonation request">{t.cond === 'APPROVED' ? '✓ condoned' : 'request pending'}</span>}</td>
                  {courseCols.map(([k]) => {
                    const v = t.per[k]
                    const p = v?.c ? Math.round(v.a / v.c * 100) : null
                    return <td key={k} className={`px-2 text-center border-l border-border tabular-nums ${p !== null && p < condPct ? 'text-red-700 font-semibold' : p !== null && p < minPct ? 'text-amber-700' : ''}`}>{p === null ? '' : p}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">Overall % = hours attended (OD counts as attended) in all courses ÷ hours conducted (Regulation 7.1). ≥{minPct}% eligible; {condPct}–{minPct - 1}% only with medical / sports documents submitted on return (7.2); below {condPct}% SA — not permitted to write the semester-end examination (7.4). The Excel export is the eligibility list for the CoE.</p>
    </div>
  )
}
