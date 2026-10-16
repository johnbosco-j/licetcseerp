"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Star, ArrowRightCircle } from "lucide-react"
import { NextTermWizard, CalendarImportButton } from "./next-term"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"
import { type CalendarDay, type PeriodSlot, type Term, DAY_NAMES, DAY_SHORT, weekdayOf } from "@/lib/academic"

export const inputCls = "h-9 px-2 rounded-md border border-input bg-white text-[13px] focus:outline-none focus:border-licet-violet"
export const btnCls = "h-9 px-3 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50 inline-flex items-center gap-1.5"
export const ghostCls = "h-9 px-3 rounded-md border border-border bg-white text-[13px] font-semibold hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"

export function TermsTab({ terms, reload }: { terms: Term[]; reload: () => void }) {
  const [termId, setTermId] = useState(terms.find(t => t.is_current)?.id ?? terms[0]?.id ?? '')
  const term = terms.find(t => t.id === termId)
  const [draft, setDraft] = useState<Partial<Term>>({})
  const [newTerm, setNewTerm] = useState({ academic_year: '', parity: 'EVEN', starts_on: '', ends_on: '' })
  const [wizard, setWizard] = useState(false)
  useEffect(() => { setDraft(term ? { ...term } : {}) }, [term])

  const saveTerm = async () => {
    const { error } = await supabase.from('academic_terms').update({ label: draft.label, starts_on: draft.starts_on, ends_on: draft.ends_on, notes: draft.notes }).eq('id', termId)
    if (reportResult(error, 'Term saved')) reload()
  }
  const makeCurrent = async () => {
    await supabase.from('academic_terms').update({ is_current: false }).neq('id', termId)
    const { error } = await supabase.from('academic_terms').update({ is_current: true }).eq('id', termId)
    if (reportResult(error, `${term?.label} is now the current term`)) reload()
  }
  const addTerm = async () => {
    const [a, b] = newTerm.academic_year.split('-')
    const label = `AY ${a}-${(b ?? '').slice(2)} ${newTerm.parity === 'ODD' ? 'Odd' : 'Even'}`
    const { data, error } = await supabase.from('academic_terms').insert({ ...newTerm, label, starts_on: newTerm.starts_on || null, ends_on: newTerm.ends_on || null }).select().single()
    if (!reportResult(error, `${label} created`)) return
    // carry the period timings over from the current term
    const cur = terms.find(t => t.is_current)
    if (cur && data) {
      const { data: ps } = await supabase.from('period_slots').select('period_no, starts_at, ends_at, label, years').eq('term_id', cur.id)
      if (ps?.length) await supabase.from('period_slots').insert(ps.map(p => ({ ...p, term_id: data.id })))
    }
    reload()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={termId} onChange={e => setTermId(e.target.value)} className={inputCls}>
            {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
          </select>
          {term && !term.is_current && <button onClick={makeCurrent} className={ghostCls}><Star className="w-4 h-4" /> Make current term</button>}
          <button onClick={() => setWizard(true)} className={`${btnCls} ml-auto`}><ArrowRightCircle className="w-4 h-4" /> Start next term</button>
        </div>
        {term && (
          <div className="grid sm:grid-cols-4 gap-2">
            <label className="text-[12px] text-muted-foreground">Label<input className={`${inputCls} w-full mt-0.5`} value={draft.label ?? ''} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Starts<input type="date" className={`${inputCls} w-full mt-0.5`} value={draft.starts_on ?? ''} onChange={e => setDraft({ ...draft, starts_on: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Ends<input type="date" className={`${inputCls} w-full mt-0.5`} value={draft.ends_on ?? ''} onChange={e => setDraft({ ...draft, ends_on: e.target.value })} /></label>
            <div className="flex items-end"><button onClick={saveTerm} className={btnCls}>Save term</button></div>
          </div>
        )}
        <details className="text-[13px]">
          <summary className="cursor-pointer text-licet-violet font-semibold">Add a new term</summary>
          <div className="flex flex-wrap items-end gap-2 mt-2">
            <label className="text-[12px] text-muted-foreground">Academic year<input placeholder="2026-2027" className={`${inputCls} mt-0.5 w-32 block`} value={newTerm.academic_year} onChange={e => setNewTerm({ ...newTerm, academic_year: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Semester<select className={`${inputCls} mt-0.5 block`} value={newTerm.parity} onChange={e => setNewTerm({ ...newTerm, parity: e.target.value })}><option value="ODD">Odd</option><option value="EVEN">Even</option></select></label>
            <label className="text-[12px] text-muted-foreground">Starts<input type="date" className={`${inputCls} mt-0.5 block`} value={newTerm.starts_on} onChange={e => setNewTerm({ ...newTerm, starts_on: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Ends<input type="date" className={`${inputCls} mt-0.5 block`} value={newTerm.ends_on} onChange={e => setNewTerm({ ...newTerm, ends_on: e.target.value })} /></label>
            <button onClick={addTerm} disabled={!/^\d{4}-\d{4}$/.test(newTerm.academic_year)} className={btnCls}><Plus className="w-4 h-4" /> Create</button>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">Then add courses (Courses tab → copy from a previous term), timetable and calendar days for it.</p>
        </details>
      </section>
      {wizard && <NextTermWizard terms={terms} onClose={() => setWizard(false)} onDone={() => { setWizard(false); reload() }} />}
      {term && <PeriodsEditor term={term} />}
      {term && <CalendarEditor term={term} />}
    </div>
  )
}

function PeriodsEditor({ term }: { term: Term }) {
  const [rows, setRows] = useState<PeriodSlot[]>([])
  const load = useCallback(() => { supabase.from('period_slots').select('*').eq('term_id', term.id).order('period_no').then(({ data }) => setRows((data ?? []) as PeriodSlot[])) }, [term.id])
  useEffect(() => { load() }, [load])
  const save = async (p: PeriodSlot) => {
    const { error } = await supabase.from('period_slots').update({ starts_at: p.starts_at, ends_at: p.ends_at, label: p.label, years: p.years?.length ? p.years : null }).eq('id', p.id)
    reportResult(error, `Period ${p.period_no} saved`)
  }
  const add = async () => {
    const n = (rows[rows.length - 1]?.period_no ?? 0) + 1
    const { error } = await supabase.from('period_slots').insert({ term_id: term.id, period_no: n, starts_at: '16:00', ends_at: '16:50' })
    if (reportResult(error)) load()
  }
  const remove = async (p: PeriodSlot) => {
    if (!confirm(`Remove period ${p.period_no}?`)) return
    const { error } = await supabase.from('period_slots').delete().eq('id', p.id)
    if (reportResult(error, 'Removed')) load()
  }
  return (
    <section className="rounded-lg border border-border bg-white p-4 space-y-3">
      <p className="eyebrow">Period timings — {term.label}</p>
      <div className="grid gap-2">
        {rows.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="w-16 font-semibold text-licet-indigo">Period {p.period_no}</span>
            <input type="time" value={p.starts_at.slice(0, 5)} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, starts_at: e.target.value } : x))} className={inputCls} />
            <span>–</span>
            <input type="time" value={p.ends_at.slice(0, 5)} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, ends_at: e.target.value } : x))} className={inputCls} />
            <input placeholder="Label (optional)" value={p.label ?? ''} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className={`${inputCls} w-44`} />
            <input placeholder="Only years e.g. 4" value={(p.years ?? []).join(',')} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, years: e.target.value.split(',').map(Number).filter(Boolean) } : x))} className={`${inputCls} w-32`} />
            <button onClick={() => save(rows[i])} className={ghostCls}>Save</button>
            <button onClick={() => remove(p)} className="text-[12px] text-red-700 hover:underline">Remove</button>
          </div>
        ))}
      </div>
      <button onClick={add} className={ghostCls}><Plus className="w-4 h-4" /> Add period</button>
    </section>
  )
}

const SCOPES = [['FY', 'I year'], ['HS', 'II & III year'], ['IV', 'IV year']] as const

function CalendarEditor({ term }: { term: Term }) {
  const months = useMemo(() => {
    const out: string[] = []
    if (!term.starts_on) return out
    const d = new Date(term.starts_on + 'T00:00:00Z'), end = new Date((term.ends_on ?? term.starts_on) + 'T00:00:00Z')
    while (d <= end) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1, 1) }
    return out
  }, [term])
  const [month, setMonth] = useState('')
  const [days, setDays] = useState<CalendarDay[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { setMonth(months.includes(new Date().toISOString().slice(0, 7)) ? new Date().toISOString().slice(0, 7) : months[0] ?? '') }, [months])
  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    const to = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10)
    const { data } = await supabase.from('calendar_days').select('*').gte('date', month + '-01').lte('date', to)
    setDays((data ?? []) as CalendarDay[]); setLoading(false)
  }, [month])
  useEffect(() => { load() }, [load])

  const dates = useMemo(() => {
    if (!month) return []
    const n = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate()
    return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  }, [month])
  const get = (d: string, sc: string) => days.find(x => x.date === d && x.scope === sc)
  const upsert = async (d: string, sc: string, patch: Partial<CalendarDay>) => {
    const cur = get(d, sc)
    const row = { date: d, scope: sc, term_id: term.id, is_working: cur?.is_working ?? weekdayOf(d) <= 5, day_order: cur?.day_order ?? null, label: cur?.label ?? null, ...patch }
    if (row.is_working && !row.day_order && weekdayOf(d) <= 6) row.day_order = weekdayOf(d)
    if (!row.is_working) row.day_order = null
    const { error } = await supabase.from('calendar_days').upsert(row, { onConflict: 'date,scope' })
    if (reportResult(error)) setDays(ds => [...ds.filter(x => !(x.date === d && x.scope === sc)), row as CalendarDay])
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow mr-2">Academic calendar</p>
        <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls}>
          {months.map(m => <option key={m} value={m}>{new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
        </select>
        <span className="text-[12px] text-muted-foreground">Tick working days; on a Saturday pick which weekday’s timetable it follows.</span>
      </div>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead><tr className="bg-licet-paper">
              <th className="text-left px-2 py-1.5 border-b border-border w-24">Date</th>
              {SCOPES.map(([k, n]) => <th key={k} className="text-left px-2 py-1.5 border-b border-l border-border">{n}</th>)}
            </tr></thead>
            <tbody>
              {dates.map(d => {
                const wd = weekdayOf(d)
                return (
                  <tr key={d} className={`border-b border-border ${wd === 7 ? 'bg-muted/30' : ''}`}>
                    <td className="px-2 py-1 whitespace-nowrap font-medium">{DAY_SHORT[wd] ?? 'Sun'} {d.slice(8)}</td>
                    {SCOPES.map(([sc]) => {
                      const c = get(d, sc)
                      return (
                        <td key={sc} className="px-2 py-1 border-l border-border">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input type="checkbox" checked={!!c?.is_working} onChange={e => upsert(d, sc, { is_working: e.target.checked })} className="accent-licet-indigo" title="Working day" />
                            {c?.is_working && (
                              <select value={c.day_order ?? ''} onChange={e => upsert(d, sc, { day_order: Number(e.target.value) || null })} className="h-7 px-1 rounded border border-input bg-white text-[12px]">
                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{DAY_NAMES[n].slice(0, 3)} order</option>)}
                              </select>
                            )}
                            <input defaultValue={c?.label ?? ''} onBlur={e => e.target.value !== (c?.label ?? '') && upsert(d, sc, { label: e.target.value || null })}
                              placeholder={c?.is_working ? '' : 'holiday / event'} className="h-7 px-1.5 rounded border border-transparent hover:border-input focus:border-licet-violet text-[12px] flex-1 min-w-[120px] bg-transparent" />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
