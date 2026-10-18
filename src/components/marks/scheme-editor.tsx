"use client"

// Assessment scheme of one course offering: the components of each CIA (CT, CAT, ABA,
// assignment, LP, PT …), each written out of its own maximum and counted with a weight,
// and the parts (theory / lab) with their internal marks — as in the department's IA sheets.

import { useState } from "react"
import { Plus, Trash2, Loader2, RotateCcw, Copy } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"
import { defaultScheme, schemeProblems, type Scheme, type Comp } from "@/lib/cia-scheme"
import { courseType, markSplit } from "@/lib/regulations"

const cell = "h-8 px-2 bg-white border border-input rounded text-[12.5px] focus:outline-none focus:border-licet-violet"

export function SchemeEditor({ subject, scheme, canEdit, onSaved }: {
  subject: { id: string; code: string; cia_scheme?: unknown }; scheme: Scheme; canEdit: boolean; onSaved: (s: Scheme | null) => void
}) {
  const [s, setS] = useState<Scheme>(() => JSON.parse(JSON.stringify(scheme)))
  const [busy, setBusy] = useState(false)
  const problems = schemeProblems(s)
  const regMax = markSplit(courseType(subject.code)).internal
  const partSum = s.parts.reduce((a, p) => a + Number(p.out_of || 0), 0)

  const setComp = (i: number, patch: Partial<Comp>) => setS(x => ({ ...x, comps: x.comps.map((c, k) => k === i ? { ...c, ...patch } : c) }))
  const addComp = (cia: 1 | 2) => setS(x => ({ ...x, comps: [...x.comps, { cia, key: `C${x.comps.length + 1}`, label: 'New', max: 10, weight: 10, part: x.parts[0].key }] }))
  const copy12 = () => setS(x => ({ ...x, comps: [...x.comps.filter(c => c.cia === 1), ...x.comps.filter(c => c.cia === 1).map(c => ({ ...c, cia: 2 as const }))] }))

  const save = async (next: Scheme | null) => {
    setBusy(true)
    const { error } = await supabase.rpc('set_cia_scheme', { p_subject: subject.id, p_scheme: next })
    setBusy(false)
    if (reportResult(error, next ? 'Assessment scheme saved — totals are recalculated' : 'Back to the default scheme')) { onSaved(next); if (!next) setS(defaultScheme(subject.code)) }
  }

  const formula = (cia: 1 | 2) => s.parts.map(p => {
    const cs = s.comps.filter(c => c.cia === cia && c.part === p.key && c.weight > 0)
    if (!cs.length) return null
    return `${p.label}: ${cs.map(c => `${c.label}/${c.max}×${c.weight}${c.pool ? ` [${c.pool}]` : ''}`).join(' + ')} = ${cs.reduce((a, c) => a + Number(c.weight), 0)}`
  }).filter(Boolean).join(' · ')

  return (
    <div className="p-5 space-y-5 text-[13px]">
      <p className="text-muted-foreground max-w-3xl">
        Set the components exactly as in your IA sheet. <b>Out of</b> is what the test is written for (e.g. CAT 2 out of 100); <b>weight</b> is what it counts in that CIA
        (theory: CT 20, CAT 40, ABA 40). Components with the same <b>pool</b> are added before scaling (two activities, or CT + CAT together). <b>Round</b> rounds a component after scaling, like a sheet&apos;s ROUND(CAT/60×40) column.
        Each part’s internal = its weighted marks over both CIAs, scaled to “internal out of”.
      </p>

      <div className="space-y-2">
        <h3 className="font-semibold text-licet-indigo">Parts</h3>
        {s.parts.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={`${cell} w-16 font-mono`} value={p.key} disabled={!canEdit} onChange={e => setS(x => ({ ...x, parts: x.parts.map((q, k) => k === i ? { ...q, key: e.target.value.toUpperCase().slice(0, 4) } : q) }))} />
            <input className={`${cell} w-40`} value={p.label} disabled={!canEdit} onChange={e => setS(x => ({ ...x, parts: x.parts.map((q, k) => k === i ? { ...q, label: e.target.value } : q) }))} />
            <span>internal out of</span>
            <input className={`${cell} w-20`} type="number" value={p.out_of} disabled={!canEdit} onChange={e => setS(x => ({ ...x, parts: x.parts.map((q, k) => k === i ? { ...q, out_of: Number(e.target.value) } : q) }))} />
            <label className="inline-flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={!!p.steps} disabled={!canEdit} onChange={e => setS(x => ({ ...x, parts: x.parts.map((q, k) => k === i ? { ...q, steps: e.target.checked } : q) }))} /> round the CIA average first</label>
            {canEdit && s.parts.length > 1 && <button onClick={() => setS(x => ({ ...x, parts: x.parts.filter((_, k) => k !== i) }))} className="p-1 text-red-700" aria-label="Remove part"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
        {canEdit && s.parts.length < 4 && <button onClick={() => setS(x => ({ ...x, parts: [...x.parts, { key: x.parts.some(p => p.key === 'P') ? 'X' : 'P', label: 'Lab', out_of: 20 }] }))} className="inline-flex items-center gap-1 text-licet-indigo text-[12.5px] font-semibold"><Plus className="w-3.5 h-3.5" /> Add part</button>}
        {partSum !== regMax && <p className="text-amber-800 text-[12.5px]">The parts add up to {partSum}; Regulation Table 5 gives this course {regMax} internal. With this scheme the course is marked {partSum} internal / {100 - partSum} semester-end.</p>}
      </div>

      {([1, 2] as const).map(cia => (
        <div key={cia} className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-licet-indigo">CIA {cia}</h3>
            {canEdit && cia === 2 && <button onClick={copy12} className="inline-flex items-center gap-1 text-[12px] text-licet-indigo"><Copy className="w-3.5 h-3.5" /> Same as CIA 1</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="text-[12.5px]">
              <thead className="text-muted-foreground"><tr><th className="text-left pr-2">Name</th><th className="text-left pr-2">Code</th><th className="text-left pr-2">Out of</th><th className="text-left pr-2">Weight</th><th className="text-left pr-2">Part</th><th className="text-left pr-2">Pool</th><th className="text-left pr-2">Round</th><th /></tr></thead>
              <tbody>
                {s.comps.map((c, i) => c.cia !== cia ? null : (
                  <tr key={i}>
                    <td className="pr-2 py-0.5"><input className={`${cell} w-40`} value={c.label} disabled={!canEdit} onChange={e => setComp(i, { label: e.target.value })} /></td>
                    <td className="pr-2"><input className={`${cell} w-24 font-mono`} value={c.key} disabled={!canEdit} onChange={e => setComp(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} /></td>
                    <td className="pr-2"><input className={`${cell} w-20`} type="number" value={c.max} disabled={!canEdit} onChange={e => setComp(i, { max: Number(e.target.value) })} /></td>
                    <td className="pr-2"><input className={`${cell} w-20`} type="number" value={c.weight} disabled={!canEdit} onChange={e => setComp(i, { weight: Number(e.target.value) })} /></td>
                    <td className="pr-2"><select className={`${cell} w-28`} value={c.part} disabled={!canEdit} onChange={e => setComp(i, { part: e.target.value })}>{s.parts.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></td>
                    <td className="pr-2"><input className={`${cell} w-20 font-mono`} value={c.pool ?? ''} placeholder="—" disabled={!canEdit} onChange={e => setComp(i, { pool: e.target.value.toUpperCase().slice(0, 8) || undefined })} /></td>
                    <td className="pr-2"><select className={`${cell} w-24`} value={c.round ?? ''} disabled={!canEdit} onChange={e => setComp(i, { round: (e.target.value || undefined) as Comp['round'] })}><option value="">—</option><option value="round">nearest</option><option value="up">up</option></select></td>
                    <td>{canEdit && <button onClick={() => setS(x => ({ ...x, comps: x.comps.filter((_, k) => k !== i) }))} className="p-1 text-red-700" aria-label="Remove component"><Trash2 className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && <button onClick={() => addComp(cia)} className="inline-flex items-center gap-1 text-licet-indigo text-[12.5px] font-semibold"><Plus className="w-3.5 h-3.5" /> Add component</button>}
          <p className="font-mono text-[11.5px] text-muted-foreground">{formula(cia) || 'No components'}</p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={s.sp !== false} disabled={!canEdit} onChange={e => setS(x => ({ ...x, sp: e.target.checked }))} /> Special test (SP) replaces an absent CAT</label>
        <label className="inline-flex items-center gap-2">Rounding
          <select className={cell} value={s.rounding ?? 'round'} disabled={!canEdit} onChange={e => setS(x => ({ ...x, rounding: e.target.value as 'round' | 'up' }))}><option value="round">to nearest</option><option value="up">up</option></select>
        </label>
      </div>

      {problems.length > 0 && <ul className="text-red-700 text-[12.5px] list-disc pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {canEdit && (
        <div className="flex gap-2">
          <button onClick={() => save(s)} disabled={busy || problems.length > 0} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-licet-indigo text-white font-semibold disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save scheme</button>
          {subject.cia_scheme != null && <button onClick={() => save(null)} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border"><RotateCcw className="w-4 h-4" /> Use the default</button>}
        </div>
      )}
      {!canEdit && <p className="text-muted-foreground text-[12.5px]">Only the course’s teachers and the HOD can change the scheme (and not while marks are locked).</p>}
    </div>
  )
}
