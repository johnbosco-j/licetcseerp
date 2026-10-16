"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, CalendarPlus, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/toaster"
import { CSE_R2024 } from "@/lib/regulations"
import { parseCalendarWorkbook } from "@/lib/calendar-import"
import { SECTIONS, type Term, yearOf } from "@/lib/academic"
import { inputCls, btnCls, ghostCls } from "./terms-tab"

/** Upload the college's academic-calendar workbook into a term (dates outside the term are ignored). */
export async function importCalendarFile(file: File, term: Term): Promise<number> {
  const { days } = parseCalendarWorkbook(await file.arrayBuffer())
  const inTerm = days.filter(d => (!term.starts_on || d.date >= term.starts_on) && (!term.ends_on || d.date <= term.ends_on))
  for (let i = 0; i < inTerm.length; i += 400) {
    const { error } = await supabase.from('calendar_days').upsert(inTerm.slice(i, i + 400).map(d => ({ ...d, term_id: term.id })), { onConflict: 'date,scope' })
    if (error) throw new Error(error.message)
  }
  return inTerm.length
}

export function CalendarImportButton({ term, onDone }: { term: Term; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className={`${ghostCls} cursor-pointer`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Import calendar (Excel)
      <input type="file" accept=".xlsx,.xls" className="sr-only" disabled={busy} onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        setBusy(true)
        try { const n = await importCalendarFile(f, term); toast.success(`${n} calendar entries imported for ${term.label}`); onDone() }
        catch (err) { toast.error(err instanceof Error ? err.message : 'Could not read that calendar') }
        setBusy(false)
      }} />
    </label>
  )
}

type Step = { label: string; state: 'todo' | 'run' | 'ok' | 'skip' | 'err'; note?: string }

export function NextTermWizard({ terms, onClose, onDone }: { terms: Term[]; onClose: () => void; onDone: () => void }) {
  const cur = terms.find(t => t.is_current)
  const suggest = useMemo(() => {
    if (!cur) return { year: '', parity: 'ODD' as 'ODD' | 'EVEN' }
    if (cur.parity === 'ODD') return { year: cur.academic_year, parity: 'EVEN' as const }
    const [a, b] = cur.academic_year.split('-').map(Number)
    return { year: `${a + 1}-${b + 1}`, parity: 'ODD' as const }
  }, [cur])
  const [year, setYear] = useState(suggest.year)
  const [parity, setParity] = useState<'ODD' | 'EVEN'>(suggest.parity)
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [promote, setPromote] = useState(suggest.parity === 'ODD')
  const [courses, setCourses] = useState(true)
  const [calendar, setCalendar] = useState<File | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [alreadyPromoted, setAlreadyPromoted] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('section').eq('role', 'STUDENT').eq('is_active', true).then(({ data }) => {
      const c: Record<string, number> = {}
      for (const r of (data ?? []) as { section: string | null }[]) if (r.section) c[r.section] = (c[r.section] ?? 0) + 1
      setCounts(c)
    })
  }, [])
  useEffect(() => {
    if (!/^\d{4}-\d{4}$/.test(year)) return
    supabase.from('promotion_log').select('id').eq('academic_year', year).then(({ data }) => {
      const done = !!data?.length
      setAlreadyPromoted(done)
      if (done) setPromote(false)
    })
  }, [year])

  const run = async () => {
    if (!/^\d{4}-\d{4}$/.test(year)) { toast.error('Academic year must look like 2027-2028'); return }
    const plan: Step[] = [
      { label: promote ? `Promote students for ${year} (I→II→III→IV, IV graduate)` : 'Year promotion', state: promote ? 'todo' : 'skip', note: promote ? undefined : 'not needed' },
      { label: `Create ${year} ${parity === 'ODD' ? 'odd' : 'even'} term and make it current (period timings copied)`, state: 'todo' },
      { label: 'Add R2024 curriculum courses for each class', state: courses ? 'todo' : 'skip' },
      { label: 'Import academic calendar', state: calendar ? 'todo' : 'skip', note: calendar ? calendar.name : 'do it later in the calendar below' },
    ]
    setSteps(plan); setRunning(true)
    const set = (i: number, patch: Partial<Step>) => setSteps(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))
    try {
      if (promote) {
        set(0, { state: 'run' })
        const { data, error } = await supabase.rpc('run_promotion', { p_academic_year: year })
        if (error) throw Object.assign(new Error(error.message), { step: 0 })
        const r = data as { promoted: number; graduated: number }
        set(0, { state: 'ok', note: `${r.promoted} promoted, ${r.graduated} graduated (kept on record, read-only)` })
      }
      set(1, { state: 'run' })
      const { data: termId, error: tErr } = await supabase.rpc('start_term', { p_year: year, p_parity: parity, p_starts: starts || null, p_ends: ends || null, p_copy_periods: true, p_make_current: true })
      if (tErr) throw Object.assign(new Error(tErr.message), { step: 1 })
      set(1, { state: 'ok' })
      const { data: term } = await supabase.from('academic_terms').select('*').eq('id', termId).single()
      if (courses) {
        set(2, { state: 'run' })
        const end = Number(year.split('-')[1])
        let added = 0; const skipped: string[] = []
        const { data: existing } = await supabase.from('subjects').select('section, code').eq('term_id', termId)
        const have = new Set(((existing ?? []) as { section: string | null; code: string }[]).map(r => `${r.section}|${r.code}`))
        for (const sec of SECTIONS) {
          const y = yearOf(sec), grad = end + (4 - y)
          if (grad < 2028) { skipped.push(`${sec} (R2021 batch — add its courses by hand)`); continue }
          const sem = y * 2 - (parity === 'ODD' ? 1 : 0)
          const rows = CSE_R2024.filter(c => c.semester === sem && !have.has(`${sec}|${c.code}`)).map(c => ({
            code: c.code, name: c.title, semester: sem, credits: c.credits, section: sec, term_id: termId, academic_year: year,
            cohort_grad_year: grad, audience: 'ALL', course_type: c.type, regulation: 'R2024', l: c.L, t: c.T, p: c.P,
          }))
          if (rows.length) { const { error } = await supabase.from('subjects').insert(rows); if (error) throw Object.assign(new Error(error.message), { step: 2 }); added += rows.length }
        }
        set(2, { state: 'ok', note: `${added} courses added${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}. Add electives / vertical courses in Courses.` })
      }
      if (calendar && term) {
        set(3, { state: 'run' })
        const n = await importCalendarFile(calendar, term as Term)
        set(3, { state: 'ok', note: `${n} days` })
      }
      toast.success(`${year} ${parity === 'ODD' ? 'odd' : 'even'} term started. Next: timetable, faculty for each course, advisors.`)
      onDone()
    } catch (e) {
      const step = (e as { step?: number }).step ?? 3
      set(step, { state: 'err', note: e instanceof Error ? e.message : 'failed' })
      toast.error(e instanceof Error ? e.message : 'Could not start the term')
    }
    setRunning(false)
  }

  const Icon = ({ s }: { s: Step['state'] }) => s === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-700" /> : s === 'err' ? <AlertTriangle className="w-4 h-4 text-red-700" /> : s === 'run' ? <Loader2 className="w-4 h-4 animate-spin text-licet-violet" /> : <span className="w-4 h-4 rounded-full border border-border inline-block" />

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div><p className="eyebrow">Semester increment</p><h2 className="font-display text-xl font-bold text-licet-indigo mt-1">Start the next term</h2></div>
          <button onClick={onClose} disabled={running} className="p-2 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-[13.5px]">
          <p className="text-muted-foreground">Current term: <b className="text-foreground">{cur?.label ?? 'none'}</b>. Everything already recorded stays readable under its own term.</p>
          <div className="grid sm:grid-cols-4 gap-2">
            <label className="text-[12px] text-muted-foreground">Academic year<input value={year} onChange={e => setYear(e.target.value)} className={`${inputCls} w-full mt-0.5`} /></label>
            <label className="text-[12px] text-muted-foreground">Semester<select value={parity} onChange={e => setParity(e.target.value as 'ODD' | 'EVEN')} className={`${inputCls} w-full mt-0.5`}><option value="ODD">Odd</option><option value="EVEN">Even</option></select></label>
            <label className="text-[12px] text-muted-foreground">Starts<input type="date" value={starts} onChange={e => setStarts(e.target.value)} className={`${inputCls} w-full mt-0.5`} /></label>
            <label className="text-[12px] text-muted-foreground">Ends<input type="date" value={ends} onChange={e => setEnds(e.target.value)} className={`${inputCls} w-full mt-0.5`} /></label>
          </div>
          <label className={`flex items-start gap-2 ${parity !== 'ODD' || alreadyPromoted ? 'opacity-60' : ''}`}>
            <input type="checkbox" checked={promote} disabled={parity !== 'ODD' || alreadyPromoted} onChange={e => setPromote(e.target.checked)} className="mt-1 accent-licet-indigo" />
            <span><b>Promote every class one year</b> (odd term of a new academic year only). {alreadyPromoted ? 'Already done for this year.' : `Now: ${SECTIONS.map(s => `${s} ${counts[s] ?? 0}`).join(' · ')}. IV year students graduate and stay on record (read-only).`}</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={courses} onChange={e => setCourses(e.target.checked)} className="mt-1 accent-licet-indigo" />
            <span><b>Add the R2024 courses</b> of the new semester to every class on R2024 (batches graduating 2028 onwards). Older batches and electives / verticals are added by hand in Courses.</span>
          </label>
          <label className="flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-licet-violet" />
            <span>Academic calendar (optional):</span>
            <input type="file" accept=".xlsx,.xls" onChange={e => setCalendar(e.target.files?.[0] ?? null)} className="text-[12.5px]" />
          </label>
          {steps.length > 0 && (
            <ol className="rounded-lg border border-border divide-y divide-border">
              {steps.map((s, i) => <li key={i} className="flex items-start gap-2 px-3 py-2"><Icon s={s.state} /><span className="flex-1">{s.label}{s.note && <span className="block text-[12px] text-muted-foreground">{s.note}</span>}</span></li>)}
            </ol>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} disabled={running} className={ghostCls}>Close</button>
            <button onClick={run} disabled={running || !year} className={btnCls}>{running && <Loader2 className="w-4 h-4 animate-spin" />} Start term</button>
          </div>
        </div>
      </div>
    </div>
  )
}
