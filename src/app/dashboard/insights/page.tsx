"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, RefreshCw } from "lucide-react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { SECTIONS, DAY_SHORT, loadTerms, type Term, isoToday, type Offering } from "@/lib/academic"

type Rec = Record<string, string | number | null>

function exportRows(name: string, rows: Rec[]) {
  if (!rows.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30))
  XLSX.writeFile(wb, `${name.replace(/\s+/g, '_')}_${isoToday()}.xlsx`)
}

function Panel({ title, note, rows, exportName, children, loading }: { title: string; note?: string; rows?: Rec[]; exportName?: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <section className="rounded-lg border border-border bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div><h2 className="font-display text-[17px] font-bold text-licet-indigo">{title}</h2>{note && <p className="text-[12.5px] text-muted-foreground mt-0.5">{note}</p>}</div>
        {rows && exportName && <button onClick={() => exportRows(exportName, rows)} disabled={!rows.length} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-[12.5px] font-semibold hover:bg-muted disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Excel</button>}
      </div>
      <div className="p-4">{loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : children}</div>
    </section>
  )
}

const pctTone = (p: number | null) => p === null ? '' : p < 65 ? 'text-red-700 font-semibold' : p < 75 ? 'text-amber-700 font-semibold' : p >= 90 ? 'text-green-800' : ''
const heat = (p: number | null) => p === null ? 'bg-muted/30' : p >= 92 ? 'bg-green-200' : p >= 85 ? 'bg-green-100' : p >= 75 ? 'bg-amber-100' : p >= 65 ? 'bg-orange-200' : 'bg-red-300'
const num = (v: unknown) => v === null || v === undefined ? null : Number(v)

export default function InsightsPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(isoToday())
  const [data, setData] = useState<Record<string, Rec[]>>({})
  const [loading, setLoading] = useState(true)
  const [patSection, setPatSection] = useState('')
  const [custom, setCustom] = useState<{ sections: string[]; subject: string; group: string }>({ sections: [], subject: '', group: 'student' })
  const [customRows, setCustomRows] = useState<Rec[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    const au = stored ? JSON.parse(stored) as AuthUser : null
    if (!au || au.type !== 'staff') { router.replace('/dashboard'); return }
    if (!isTier1(au.data) && !au.data.advisor_section) { router.replace('/dashboard'); return }
    setUser(au)
    if (au.data.advisor_section && !isTier1(au.data)) { setPatSection(au.data.advisor_section); setCustom(c => ({ ...c, sections: [au.data.advisor_section!] })) }
    loadTerms().then(ts => { setTerms(ts); setTermId(ts.find(t => t.is_current)?.id ?? ts[0]?.id ?? '') })
  }, [router])

  const isHod = !!user && user.type === 'staff' && isTier1(user.data)
  const mySection = !isHod ? user?.data.advisor_section ?? null : null

  const load = useCallback(async () => {
    if (!termId) return
    setLoading(true)
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) console.error(fn, error.message)
      return (data ?? []) as Rec[]
    }
    const range = { p_from: from || null, p_to: to || null }
    const [kpis, trend, matrix, missing, load_, defaulters, streaks, groups, cohorts] = await Promise.all([
      rpc('ana_section_kpis', { p_term: termId }),
      rpc('ana_weekly_trend', { p_term: termId }),
      rpc('ana_course_matrix', { p_term: termId }),
      rpc('ana_missing_hours', { p_term: termId, ...range }),
      isHod ? rpc('ana_faculty_load', { p_term: termId, ...range }) : Promise.resolve([]),
      rpc('ana_new_defaulters', { p_term: termId, p_min: 75 }),
      rpc('ana_absence_streaks', { p_term: termId, p_min_days: 3 }),
      rpc('ana_groups', { p_term: termId }),
      rpc('ana_cohort_terms', {}),
    ])
    const only = (rows: Rec[]) => mySection ? rows.filter(r => r.section === mySection || r.section === 'Combined') : rows
    setData({ kpis: only(kpis), trend: only(trend), matrix: only(matrix), missing: only(missing), load: load_, defaulters: only(defaulters), streaks: only(streaks), groups: only(groups), cohorts })
    const { data: offs } = await supabase.from('subjects').select('*').eq('term_id', termId).order('code')
    setOfferings((offs ?? []) as Offering[])
    setLoading(false)
  }, [termId, from, to, isHod, mySection])
  useEffect(() => { load() }, [load])

  const [patterns, setPatterns] = useState<Rec[]>([])
  useEffect(() => {
    if (!termId) return
    supabase.rpc('ana_patterns', { p_term: termId, p_section: patSection || null }).then(({ data }) => setPatterns((data ?? []) as Rec[]))
  }, [termId, patSection])

  const runCustom = async () => {
    const { data, error } = await supabase.rpc('ana_custom', {
      p_term: termId, p_sections: custom.sections.length ? custom.sections : null, p_subjects: custom.subject ? [custom.subject] : null,
      p_from: from || null, p_to: to || null, p_group: custom.group,
    })
    if (error) console.error(error.message)
    setCustomRows((data ?? []) as Rec[])
  }

  const weeks = useMemo(() => [...new Set((data.trend ?? []).map(r => String(r.week)))].sort(), [data.trend])
  const trendSections = useMemo(() => [...new Set((data.trend ?? []).map(r => String(r.section)))].sort(), [data.trend])
  const matrixCourses = useMemo(() => {
    const by = new Map<string, Rec[]>()
    for (const r of data.matrix ?? []) by.set(String(r.section), [...(by.get(String(r.section)) ?? []), r])
    return [...by.entries()]
  }, [data.matrix])
  const missingBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data.missing ?? []) { const k = `${r.section} · ${r.course}${r.audience !== 'ALL' && r.audience_value ? ` (${r.audience === 'BATCH' ? 'B' : ''}${r.audience_value})` : ''}`; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [data.missing])

  if (!user || !termId) return <div className="p-10 flex items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
  const term = terms.find(t => t.id === termId)

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">Analysis</span>
          <h1 className="font-display text-3xl font-bold text-licet-indigo mt-1">Insights{mySection ? ` — ${mySection}` : ''}</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 max-w-3xl">Everything here is computed from the hour-wise register, the timetable and the academic calendar. Use the date range for “missing hours” and faculty figures; every table exports to Excel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={termId} onChange={e => setTermId(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">{terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}</select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 px-2 rounded-md border border-input text-[13px]" title="From" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 px-2 rounded-md border border-input text-[13px]" title="To" />
          <button onClick={load} className="h-9 px-2.5 rounded-md border border-border bg-white hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <Panel title="Classes at a glance" note={`${term?.label}. Overall % counts OD as attended. “Last 7 days” is empty when nothing was recorded this week.`} rows={data.kpis} exportName="Class_KPIs" loading={loading}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-muted-foreground border-b border-border">{['Class', 'Students', 'Hours taken', 'Overall', 'Last 7 days', 'Below 75%', 'Below 65% (SA)', 'OD hours'].map(h => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{(data.kpis ?? []).map(r => (
              <tr key={String(r.section)} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 font-semibold text-licet-indigo">{r.section}</td><td className="pr-3 tabular-nums">{r.students}</td><td className="pr-3 tabular-nums">{r.sessions}</td>
                <td className={`pr-3 tabular-nums ${pctTone(num(r.pct))}`}>{r.pct ?? '—'}%</td><td className="pr-3 tabular-nums">{r.last7_pct ?? '—'}</td>
                <td className={`pr-3 tabular-nums ${Number(r.below_75) ? 'text-amber-700 font-semibold' : ''}`}>{r.below_75}</td>
                <td className={`pr-3 tabular-nums ${Number(r.below_65) ? 'text-red-700 font-semibold' : ''}`}>{r.below_65}</td><td className="pr-3 tabular-nums">{r.od_hours}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-5">
        <Panel title="Weekly trend" note="Attendance % per class, week by week." rows={data.trend} exportName="Weekly_trend" loading={loading}>
          <div className="overflow-x-auto">
            <table className="text-[12px]">
              <thead><tr><th className="pr-2 text-left text-muted-foreground font-medium">Week of</th>{trendSections.map(s => <th key={s} className="px-1.5 text-muted-foreground font-medium whitespace-nowrap">{s.replace(' CSE', '')}</th>)}</tr></thead>
              <tbody>{weeks.map(w => (
                <tr key={w}><td className="pr-2 whitespace-nowrap">{w.slice(8)}/{w.slice(5, 7)}</td>
                  {trendSections.map(s => { const r = (data.trend ?? []).find(x => x.week === w && x.section === s); const p = r ? num(r.pct) : null
                    return <td key={s} className={`px-1.5 text-center tabular-nums ${heat(p)}`}>{p ?? ''}</td> })}</tr>))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Hours scheduled but not recorded" note="Timetable hours on working days with no attendance for that class and batch/vertical. Use it to chase pending registers." rows={data.missing} exportName="Missing_hours" loading={loading}>
          <p className="text-[13px] mb-2"><b className="text-licet-indigo text-lg">{(data.missing ?? []).length}</b> hours{from || to ? ' in the chosen range' : ''}.</p>
          <ul className="text-[12.5px] max-h-64 overflow-y-auto divide-y divide-border">{missingBy.slice(0, 40).map(([k, n]) => <li key={k} className="flex justify-between py-1"><span>{k}</span><b className="tabular-nums">{n}</b></li>)}</ul>
        </Panel>
      </div>

      {isHod && (
        <Panel title="Faculty — scheduled vs recorded" note="Hours on each teacher’s timetable, hours they recorded in the ERP (imported registers are not counted), hours still unrecorded, topic entries and self check-ins." rows={data.load} exportName="Faculty_load" loading={loading}>
          <div className="overflow-x-auto"><table className="w-full text-[13px]">
            <thead><tr className="text-left text-muted-foreground border-b border-border">{['Faculty', 'Scheduled', 'Recorded', 'Not recorded', 'With topic', 'Self check-ins'].map(h => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{(data.load ?? []).map(r => <tr key={String(r.faculty_id)} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3">{r.full_name}</td><td className="pr-3 tabular-nums">{r.scheduled}</td><td className="pr-3 tabular-nums">{r.recorded}</td>
              <td className={`pr-3 tabular-nums ${Number(r.missing) ? 'text-amber-700 font-semibold' : ''}`}>{r.missing}</td><td className="pr-3 tabular-nums">{r.with_topic}</td><td className="pr-3 tabular-nums">{r.self_checkins}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      )}

      <div className="grid xl:grid-cols-2 gap-5">
        <Panel title="Fell below 75% in the last two weeks" note="At or above 75% fourteen days ago, below now — the students to counsel first." rows={data.defaulters} exportName="New_defaulters" loading={loading}>
          {(data.defaulters ?? []).length ? <ul className="text-[13px] divide-y divide-border">{(data.defaulters ?? []).map(r => <li key={String(r.student_id)} className="py-1.5 flex justify-between gap-2"><span>{r.full_name} <span className="text-muted-foreground text-[11.5px]">{r.register_number} · {r.section}</span></span><span className="tabular-nums">{r.pct_then}% → <b className="text-red-700">{r.pct_now}%</b></span></li>)}</ul> : <p className="text-[13px] text-muted-foreground">No one crossed below 75% in the last two weeks.</p>}
        </Panel>
        <Panel title="Absent for 3+ class days in a row" note="Every recorded hour missed on consecutive class days." rows={data.streaks} exportName="Absence_streaks" loading={loading}>
          <ul className="text-[13px] divide-y divide-border max-h-72 overflow-y-auto">{(data.streaks ?? []).map((r, i) => <li key={i} className="py-1.5 flex justify-between gap-2"><span>{r.full_name} <span className="text-muted-foreground text-[11.5px]">{r.section}</span></span><span className="tabular-nums text-[12.5px]">{r.days} days · {String(r.from_date).slice(5)} → {String(r.to_date).slice(5)}</span></li>)}</ul>
        </Panel>
      </div>

      <Panel title="Course × class heat map" note="Attendance % of every course in each class (red < 65, orange < 75, green ≥ 85)." rows={data.matrix} exportName="Course_matrix" loading={loading}>
        <div className="space-y-2">{matrixCourses.map(([sec, rows]) => (
          <div key={sec} className="flex flex-wrap items-center gap-1.5 text-[12px]"><span className="w-24 font-semibold text-licet-indigo">{sec}</span>
            {rows.map(r => <span key={String(r.course)} className={`px-2 py-1 rounded ${heat(num(r.pct))}`} title={`${r.hours} hours`}>{r.course} <b className="tabular-nums">{r.pct}</b></span>)}</div>))}</div>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-5">
        <Panel title="When are students absent?" note="Absence % by weekday and period." rows={patterns} exportName="Absence_patterns">
          {isHod && <select value={patSection} onChange={e => setPatSection(e.target.value)} className="mb-2 h-8 px-2 rounded-md border border-input bg-white text-[12.5px]"><option value="">All classes</option>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select>}
          <table className="text-[12px]"><thead><tr><th />{[1, 2, 3, 4, 5, 6, 7, 8].map(p => <th key={p} className="px-2 text-muted-foreground font-medium">P{p}</th>)}</tr></thead>
            <tbody>{[1, 2, 3, 4, 5, 6].map(d => <tr key={d}><td className="pr-2 font-medium">{DAY_SHORT[d]}</td>{[1, 2, 3, 4, 5, 6, 7, 8].map(p => { const r = patterns.find(x => Number(x.weekday) === d && Number(x.period_no) === p); const a = r ? num(r.absent_pct) : null
              return <td key={p} className={`px-2 py-1 text-center tabular-nums ${a === null ? 'bg-muted/20' : a >= 15 ? 'bg-red-300' : a >= 10 ? 'bg-orange-200' : a >= 6 ? 'bg-amber-100' : 'bg-green-100'}`}>{a ?? ''}</td> })}</tr>)}</tbody></table>
        </Panel>
        <Panel title="Batches, verticals and batches over terms" rows={[...(data.groups ?? []), ...(data.cohorts ?? [])]} exportName="Groups_and_cohorts" loading={loading}>
          <table className="w-full text-[12.5px] mb-3"><tbody>{(data.groups ?? []).map((r, i) => <tr key={i} className="border-b border-border last:border-0"><td className="py-1 pr-2">{r.section}</td><td className="pr-2 text-muted-foreground">{r.group_kind}</td><td className="pr-2 font-semibold">{r.value}</td><td className="pr-2 tabular-nums">{r.students} students</td><td className={`tabular-nums ${pctTone(num(r.pct))}`}>{r.pct}%</td></tr>)}</tbody></table>
          <p className="eyebrow mb-1">Same batch across terms</p>
          <table className="w-full text-[12.5px]"><tbody>{(data.cohorts ?? []).map((r, i) => <tr key={i} className="border-b border-border last:border-0"><td className="py-1 pr-2">Batch {Number(r.cohort_grad_year) - 4}–{String(r.cohort_grad_year).slice(2)}</td><td className="pr-2 text-muted-foreground">{r.term_label}</td><td className={`tabular-nums ${pctTone(num(r.pct))}`}>{r.pct}%</td></tr>)}</tbody></table>
        </Panel>
      </div>

      <Panel title="Custom report" note="Pick classes, a course and how to group; the date range above applies." rows={customRows} exportName="Custom_report">
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]">
          {SECTIONS.filter(s => !mySection || s === mySection).map(s => <label key={s} className={`px-2 py-1 rounded-full border cursor-pointer ${custom.sections.includes(s) ? 'bg-licet-indigo text-white border-licet-indigo' : 'border-border'}`}>
            <input type="checkbox" className="sr-only" checked={custom.sections.includes(s)} onChange={() => setCustom(c => ({ ...c, sections: c.sections.includes(s) ? c.sections.filter(x => x !== s) : [...c.sections, s] }))} />{s}</label>)}
          <select value={custom.subject} onChange={e => setCustom({ ...custom, subject: e.target.value })} className="h-8 px-2 rounded-md border border-input bg-white max-w-[260px]"><option value="">All courses</option>{offerings.map(o => <option key={o.id} value={o.id}>{o.short_name || o.code} — {o.section ?? 'combined'}</option>)}</select>
          <select value={custom.group} onChange={e => setCustom({ ...custom, group: e.target.value })} className="h-8 px-2 rounded-md border border-input bg-white">
            {[['student', 'by student'], ['course', 'by course'], ['date', 'by date'], ['weekday', 'by weekday'], ['section', 'by class'], ['faculty', 'by faculty (who recorded)']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={runCustom} className="h-8 px-3 rounded-md bg-licet-indigo text-white font-semibold">Run</button>
        </div>
        {customRows.length > 0 && <div className="max-h-96 overflow-y-auto"><table className="w-full text-[13px]"><thead className="sticky top-0 bg-white"><tr className="text-left text-muted-foreground border-b border-border"><th className="py-1 pr-3 font-medium">Item</th><th className="pr-3 font-medium">Hours</th><th className="pr-3 font-medium">Attended</th><th className="font-medium">%</th></tr></thead>
          <tbody>{customRows.map((r, i) => <tr key={i} className="border-b border-border last:border-0"><td className="py-1 pr-3">{r.label}</td><td className="pr-3 tabular-nums">{r.hours}</td><td className="pr-3 tabular-nums">{r.attended}</td><td className={`tabular-nums ${pctTone(num(r.pct))}`}>{r.pct}</td></tr>)}</tbody></table></div>}
      </Panel>
    </div>
  )
}
