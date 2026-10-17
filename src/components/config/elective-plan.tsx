"use client"

// HOD: elective plan of a batch — which course each vertical takes in PE1 … PE6 —
// and creating the current term's elective courses from it.

import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Wand2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { PE_SLOTS, VERTICAL_CATALOG, peCourse } from "@/lib/verticals"
import { applyElectivePlan, semesterOf, type PlanRow } from "@/lib/electives"
import type { Vertical, Term } from "@/lib/academic"
import { inputCls, btnCls, ghostCls } from "./terms-tab"

export function ElectivePlan({ verticals }: { verticals: Vertical[] }) {
  const active = verticals.filter(v => v.is_active)
  const [batches, setBatches] = useState<number[]>([])
  const [batch, setBatch] = useState<number | null>(null)
  const [plan, setPlan] = useState<Record<string, string>>({})        // `${slot}|${vertical}` → course code
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [term, setTerm] = useState<Term | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_current', true).maybeSingle().then(({ data }) => setTerm(data as Term | null))
    supabase.from('profiles').select('batch_year').eq('role', 'STUDENT').eq('is_active', true).range(0, 4999).then(({ data }) => {
      const ys = [...new Set(((data ?? []) as { batch_year: number | null }[]).map(r => r.batch_year).filter((y): y is number => !!y && y >= 2028))].sort()
      setBatches(ys); setBatch(b => b ?? ys[0] ?? null)
    })
  }, [])
  useEffect(() => {
    if (!batch) return
    let off = false
    Promise.all([
      supabase.from('elective_plan').select('*').eq('cohort_grad_year', batch),
      supabase.from('profiles').select('vertical').eq('role', 'STUDENT').eq('is_active', true).eq('batch_year', batch).range(0, 999),
    ]).then(([p, s]) => {
      if (off) return
      setPlan(Object.fromEntries(((p.data ?? []) as PlanRow[]).map(r => [`${r.slot}|${r.vertical}`, r.course_code])))
      const c: Record<string, number> = {}
      for (const r of (s.data ?? []) as { vertical: string | null }[]) c[r.vertical ?? '—'] = (c[r.vertical ?? '—'] ?? 0) + 1
      setCounts(c)
    })
    return () => { off = true }
  }, [batch])

  const nowSem = useMemo(() => term && batch ? semesterOf(term.academic_year, term.parity, batch) : null, [term, batch])
  const courseLabel = (code: string) => { const c = peCourse(code); return c ? `${code} · ${c.title}` : code }
  const pool = (v: Vertical) => (v.course_codes.length ? v.course_codes : VERTICAL_CATALOG.find(x => x.code === v.code)?.courses.map(c => c.code) ?? [])

  const save = async () => {
    if (!batch) return
    setBusy(true)
    const rows = Object.entries(plan).filter(([, c]) => c).map(([k, course_code]) => { const [slot, vertical] = k.split('|'); return { cohort_grad_year: batch, slot, vertical, course_code } })
    let { error } = await supabase.from('elective_plan').delete().eq('cohort_grad_year', batch)
    if (!error && rows.length) error = (await supabase.from('elective_plan').insert(rows)).error
    setBusy(false)
    reportResult(error, `Elective plan saved for the ${batch - 4}–${String(batch).slice(2)} batch`)
  }
  const apply = async () => {
    if (!term || !batch) return
    setBusy(true)
    try {
      const r = await applyElectivePlan(term, batch)
      toast.success(r.slots.length ? `${term.label}, semester ${r.semester}: ${r.created} course${r.created === 1 ? '' : 's'} created, ${r.updated} updated (${r.slots.join(', ')}). Link teachers in Courses.` : `This batch has no elective slot in semester ${r.semester}.`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create the courses') }
    setBusy(false)
  }

  return (
    <section className="rounded-lg border border-licet-gold bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Elective plan (professional electives by vertical)</p>
          <p className="text-[12.5px] text-muted-foreground">For a batch, choose the course each vertical takes in every slot. R2024: PE1–PE2 in semester 5, PE3–PE4 in 6, PE5–PE6 in 7. Students see only their own vertical&apos;s course, and the slot (e.g. <b>PE1 · RL</b>) everywhere.</p>
        </div>
        <label className="text-[12.5px] text-muted-foreground">Batch
          <select data-filter value={batch ?? ''} onChange={e => setBatch(Number(e.target.value))} className={`${inputCls} ml-2`}>
            {batches.map(b => <option key={b} value={b}>{b - 4}–{String(b).slice(2)}{term ? ` (now semester ${semesterOf(term.academic_year, term.parity, b)})` : ''}</option>)}
          </select>
        </label>
      </div>
      {!active.length ? <p className="text-[13px] text-muted-foreground">Turn on at least one vertical below.</p> : (
        <div className="overflow-x-auto">
          <table className="text-[12.5px] w-full">
            <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-1.5 pr-3">Slot</th>
              {active.map(v => <th key={v.code} className="py-1.5 pr-3">{v.name} <span className="font-normal">({counts[v.code] ?? 0} students)</span></th>)}</tr></thead>
            <tbody>{PE_SLOTS.map(s => (
              <tr key={s.slot} className={`border-b border-border/60 ${s.semester === nowSem ? 'bg-licet-cream/50' : ''}`}>
                <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{s.slot} <span className="font-normal text-muted-foreground">· sem {s.semester}{s.semester === nowSem ? ' (now)' : ''}</span></td>
                {active.map(v => (
                  <td key={v.code} className="py-1 pr-3">
                    <select value={plan[`${s.slot}|${v.code}`] ?? ''} onChange={e => setPlan(p => ({ ...p, [`${s.slot}|${v.code}`]: e.target.value }))} className={`${inputCls} w-full min-w-[220px]`}>
                      <option value="">—</option>
                      {pool(v).map(c => <option key={c} value={c}>{courseLabel(c)}</option>)}
                    </select>
                  </td>))}
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {(counts['—'] ?? 0) > 0 && <p className="text-[12.5px] text-amber-800">{counts['—']} student{counts['—'] === 1 ? ' has' : 's have'} no vertical yet — set it in the Students tab.</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy || !batch} className={btnCls}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plan</button>
        <button onClick={apply} disabled={busy || !batch || !term} className={ghostCls} title="Creates (or tags) this term's vertical courses for the slots of the batch's current semester">
          <Wand2 className="w-4 h-4" /> Create {term?.label ?? 'this term'}&apos;s elective courses
        </button>
      </div>
    </section>
  )
}
