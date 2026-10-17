"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus, Trash2, X, Printer, Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { reportResult } from "@/components/toaster"
import {
  SECTIONS, DAY_NAMES, type Offering, type PeriodSlot, type Term, type TimetableEntry, type Vertical, type StudentGroup, type Audience,
  loadTerms, loadPeriods, loadTimetable, loadVerticals, loadGroups, entryTitle, fmtTime, shortAudience, audienceLabel,
} from "@/lib/academic"

type Staff = { id: string; full_name: string }
const PALETTE = ['bg-sky-50 border-sky-200', 'bg-emerald-50 border-emerald-200', 'bg-amber-50 border-amber-200', 'bg-rose-50 border-rose-200',
  'bg-violet-50 border-violet-200', 'bg-lime-50 border-lime-200', 'bg-orange-50 border-orange-200', 'bg-teal-50 border-teal-200',
  'bg-fuchsia-50 border-fuchsia-200', 'bg-indigo-50 border-indigo-200', 'bg-yellow-50 border-yellow-200', 'bg-cyan-50 border-cyan-200']

export default function TimetablePage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [section, setSection] = useState('II CSE-A')
  const [mode, setMode] = useState<'class' | 'mine'>('class')
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [allEntries, setAllEntries] = useState<TimetableEntry[]>([])
  const [periods, setPeriods] = useState<PeriodSlot[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [editing, setEditing] = useState(false)
  const [cell, setCell] = useState<{ day: number; period: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setUser(au)
    if (au.type === 'student' && au.data.section) setSection(au.data.section)
    else if (au.data.advisor_section) setSection(au.data.advisor_section)
    if (au.type === 'staff' && !isTier1(au.data)) setMode('mine')
    loadTerms().then(ts => { setTerms(ts); setTermId(ts.find(t => t.is_current)?.id ?? ts[0]?.id ?? '') })
    loadVerticals().then(setVerticals)
    loadGroups().then(setGroups)
    supabase.from('profiles').select('id, full_name').neq('role', 'STUDENT').eq('is_active', true).order('full_name').then(({ data }) => setStaff((data ?? []) as Staff[]))
  }, [router])

  const term = terms.find(t => t.id === termId)
  const grad = term ? Number(term.academic_year.split('-')[1]) + ({ I: 3, II: 2, III: 1, IV: 0 } as Record<string, number>)[section.split(' ')[0]] : 0

  const load = useCallback(async () => {
    if (!termId) return
    setLoading(true)
    const [mine, all, ps, offs] = await Promise.all([
      loadTimetable(termId, section), loadTimetable(termId), loadPeriods(termId),
      supabase.from('subjects').select('*').eq('term_id', termId).order('code'),
    ])
    setEntries(mine); setAllEntries(all); setPeriods(ps); setOfferings((offs.data ?? []) as Offering[])
    setLoading(false)
  }, [termId, section])
  useEffect(() => { load() }, [load])

  if (!user || !term) return <div className="p-10 flex items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
  const isStudent = user.type === 'student'
  const isHod = user.type === 'staff' && isTier1(user.data)
  const meId = user.data.id
  const myBatch = isStudent ? String(user.data.lab_batch ?? '') : ''
  const myVertical = isStudent ? user.data.vertical ?? '' : ''
  const relevant = (e: TimetableEntry) => !isStudent || e.audience === 'ALL' || (e.audience === 'BATCH' && e.audience_value === myBatch) || (e.audience === 'VERTICAL' && e.audience_value === myVertical) || e.audience === 'GROUP'

  const shown = mode === 'mine' && !isStudent ? allEntries.filter(e => e.faculty_ids.includes(meId)) : entries
  const days = [1, 2, 3, 4, 5, 6].filter(d => d <= 5 || shown.some(e => e.day_order === d))
  const colorOf = (() => {
    const ids = [...new Set(shown.map(e => e.subject_id ?? 'L:' + e.label))]
    return (e: TimetableEntry) => PALETTE[ids.indexOf(e.subject_id ?? 'L:' + e.label) % PALETTE.length]
  })()
  const sectionOfferings = offerings.filter(o => o.section === section || (o.section === null && o.cohort_grad_year === grad))
  const legend = (mode === 'mine' && !isStudent)
    ? offerings.filter(o => shown.some(e => e.subject_id === o.id))
    : sectionOfferings.filter(o => entries.some(e => e.subject_id === o.id))

  return (
    <div className="px-5 md:px-8 py-6 space-y-5 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">Timetable</span>
          <h1 className="font-display text-3xl font-bold text-licet-indigo mt-1">{mode === 'mine' && !isStudent ? 'My timetable' : `${section} timetable`}</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1">{term.label}. A split hour shows each batch or vertical separately. Saturdays follow the day order set in the academic calendar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select value={termId} onChange={e => setTermId(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
            {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
          </select>
          <button onClick={() => window.print()} className="h-9 px-3 rounded-md border border-border bg-white text-[13px] inline-flex items-center gap-1.5 hover:bg-muted"><Printer className="w-4 h-4" /> Print</button>
          {isHod && mode === 'class' && (
            <button onClick={() => setEditing(v => !v)} className={`h-9 px-3 rounded-md text-[13px] font-semibold inline-flex items-center gap-1.5 ${editing ? 'bg-green-700 text-white' : 'bg-licet-indigo text-white hover:bg-licet-violet'}`}>
              {editing ? <><Check className="w-4 h-4" /> Done editing</> : <><Pencil className="w-4 h-4" /> Edit</>}
            </button>
          )}
        </div>
      </div>

      {!isStudent && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          <button onClick={() => setMode('mine')} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${mode === 'mine' ? 'bg-licet-violet text-white border-licet-violet' : 'border-border bg-white'}`}>My timetable</button>
          {SECTIONS.map(s => (
            <button key={s} onClick={() => { setSection(s); setMode('class') }} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${mode === 'class' && section === s ? 'bg-licet-indigo text-white border-licet-indigo' : 'border-border bg-white'}`}>{s}</button>
          ))}
        </div>
      )}
      {isStudent && (myBatch || myVertical) && (
        <p className="text-[13px] text-muted-foreground">You are in <b>Batch {myBatch || '—'}</b>{myVertical ? <> and the <b>{audienceLabel('VERTICAL', myVertical, verticals)}</b></> : null}; hours for other batches are greyed out.</p>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading timetable…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-licet-paper">
                <th className="px-3 py-2 border-b border-border text-left w-20">Day</th>
                {periods.map(p => (
                  <th key={p.period_no} className={`px-2 py-2 border-b border-l border-border ${p.period_no === 3 || p.period_no === 6 ? 'border-l-2 border-l-licet-gold' : ''}`}>
                    <span className="font-display font-bold text-licet-indigo">{p.period_no}</span>
                    <span className="block font-normal text-[10.5px] text-muted-foreground whitespace-nowrap">{fmtTime(p.starts_at)}–{fmtTime(p.ends_at)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <tr key={d} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-semibold text-licet-indigo align-top">{DAY_NAMES[d].slice(0, 3)}</td>
                  {periods.map(p => {
                    const here = shown.filter(e => e.day_order === d && e.period_no === p.period_no)
                    return (
                      <td key={p.period_no} onClick={() => editing && setCell({ day: d, period: p.period_no })}
                        className={`border-l border-border p-1 align-top min-w-[104px] ${p.period_no === 3 || p.period_no === 6 ? 'border-l-2 border-l-licet-gold' : ''} ${editing ? 'cursor-pointer hover:bg-licet-cream/40' : ''}`}>
                        <div className={`grid gap-1 ${here.length > 1 ? 'grid-cols-1' : ''}`}>
                          {here.map(e => (
                            <div key={e.id} className={`rounded border px-1.5 py-1 leading-tight ${colorOf(e)} ${relevant(e) ? '' : 'opacity-35'}`} title={e.faculty_names ?? ''}>
                              <span className="block font-semibold text-[12px] text-foreground">{entryTitle(e)}</span>
                              <span className="block text-[10.5px] text-muted-foreground">
                                {[mode === 'mine' && !isStudent ? (e.subjects?.section === null ? 'Combined' : e.section) : null, e.audience !== 'ALL' ? shortAudience(e.audience, e.audience_value) : null, e.room, !e.takes_attendance ? 'no attendance' : null].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          ))}
                          {editing && !here.length && <span className="flex items-center justify-center h-9 text-muted-foreground"><Plus className="w-4 h-4" /></span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {legend.length > 0 && (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <p className="px-4 py-2.5 eyebrow border-b border-border">Courses and faculty</p>
          <table className="w-full text-[13px]">
            <tbody>
              {legend.map(o => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{o.code}</td>
                  <td className="px-2 py-2"><b className="text-licet-indigo">{o.short_name}</b> <span className="text-muted-foreground">— {o.name}</span>{o.audience === 'VERTICAL' ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-licet-cream">{audienceLabel('VERTICAL', o.audience_value, verticals)}</span> : null}</td>
                  <td className="px-4 py-2 text-muted-foreground">{o.faculty_names ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cell && (
        <CellEditor term={term} section={section} day={cell.day} period={cell.period}
          entries={entries.filter(e => e.day_order === cell.day && e.period_no === cell.period)}
          dayEntries={entries.filter(e => e.day_order === cell.day)}
          offerings={sectionOfferings} verticals={verticals} groups={groups} staff={staff}
          onClose={() => setCell(null)} onSaved={() => { load() }} />
      )}
    </div>
  )
}

type Draft = Partial<TimetableEntry> & { _new?: boolean; _del?: boolean; key: string }

function CellEditor({ term, section, day, period, entries, dayEntries, offerings, verticals, groups, staff, onClose, onSaved }: {
  term: Term; section: string; day: number; period: number; entries: TimetableEntry[]; dayEntries: TimetableEntry[]; offerings: Offering[]
  verticals: Vertical[]; groups: StudentGroup[]; staff: Staff[]; onClose: () => void; onSaved: () => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(entries.map(e => ({ ...e, key: e.id })))
  const [busy, setBusy] = useState(false)
  const [span, setSpan] = useState(1)
  const [wholeBlock, setWholeBlock] = useState(true)
  // the other periods of the same lab / class block (same course, label and batch on adjacent periods)
  const blockOf = (e: TimetableEntry) => {
    const same = (x: TimetableEntry) => x.subject_id === e.subject_id && (x.label ?? '') === (e.label ?? '') && x.audience === e.audience && (x.audience_value ?? '') === (e.audience_value ?? '') && (x.group_id ?? '') === (e.group_id ?? '')
    const out: TimetableEntry[] = []
    for (let p = e.period_no - 1; ; p--) { const x = dayEntries.find(y => y.period_no === p && same(y)); if (!x) break; out.push(x) }
    for (let p = e.period_no + 1; ; p++) { const x = dayEntries.find(y => y.period_no === p && same(y)); if (!x) break; out.push(x) }
    return out
  }
  const blockPeriods = [...new Set(entries.flatMap(e => [e.period_no, ...blockOf(e).map(x => x.period_no)]))].sort((a, b) => a - b)
  const set = (k: string, patch: Partial<Draft>) => setDrafts(ds => ds.map(d => d.key === k ? { ...d, ...patch } : d))
  const add = () => setDrafts(ds => [...ds, { key: crypto.randomUUID(), _new: true, audience: 'ALL', takes_attendance: true, faculty_ids: [], subject_id: null, label: null }])
  const live = drafts.filter(d => !d._del)

  const save = async () => {
    setBusy(true)
    for (const d of drafts) {
      const row = {
        term_id: term.id, section, day_order: day, subject_id: d.subject_id || null, label: d.label?.trim() || null,
        audience: (d.audience ?? 'ALL') as Audience, audience_value: d.audience === 'ALL' || d.audience === 'GROUP' ? null : d.audience_value ?? null,
        group_id: d.audience === 'GROUP' ? d.group_id ?? null : null, room: d.room?.trim() || null,
        faculty_ids: d.faculty_ids ?? [], faculty_names: d.faculty_names?.trim() || null, takes_attendance: d.takes_attendance ?? true,
        effective_from: d.effective_from || null, effective_to: d.effective_to || null, updated_at: new Date().toISOString(),
      }
      if (!row.subject_id && !row.label) continue
      const orig = entries.find(e => e.id === d.id)
      const siblings = wholeBlock && orig ? blockOf(orig).map(x => x.id) : []
      if (d._del && !d._new) { const { error } = await supabase.from('timetable_entries').delete().in('id', [d.id!, ...siblings]); if (!reportResult(error)) { setBusy(false); return } }
      else if (d._new && !d._del) {
        const rows = Array.from({ length: span }, (_, i) => ({ ...row, period_no: period + i }))
        const { error } = await supabase.from('timetable_entries').insert(rows); if (!reportResult(error)) { setBusy(false); return }
      } else if (!d._del) {
        const { error } = await supabase.from('timetable_entries').update({ ...row, period_no: period }).eq('id', d.id!)
        if (!reportResult(error)) { setBusy(false); return }
        if (siblings.length) {
          const { error: e2 } = await supabase.from('timetable_entries').update(row).in('id', siblings)
          if (!reportResult(e2)) { setBusy(false); return }
        }
      }
    }
    setBusy(false)
    reportResult(null, 'Timetable updated')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="eyebrow">{section} · {DAY_NAMES[day]} · Period {period}</p>
            <h2 className="font-display text-xl font-bold text-licet-indigo mt-1">Edit this hour</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-[12.5px] text-muted-foreground">Add more than one entry to split the hour — e.g. Batch 1 in one lab and Batch 2 in another, or each vertical in its own course. Attendance is then taken separately for each.</p>
          {live.map((d, i) => (
            <div key={d.key} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-licet-violet">Entry {i + 1}</span>
                <button onClick={() => set(d.key, { _del: true })} className="text-red-700 text-[12px] inline-flex items-center gap-1 hover:underline"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-[12px] text-muted-foreground">Course
                  <select value={d.subject_id ?? ''} onChange={e => set(d.key, { subject_id: e.target.value || null })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input bg-white text-[13px] text-foreground">
                    <option value="">— none (activity / label) —</option>
                    {offerings.map(o => <option key={o.id} value={o.id}>{o.short_name || o.code} — {o.name}{o.section === null ? ' (combined)' : ''}</option>)}
                  </select>
                </label>
                <label className="text-[12px] text-muted-foreground">Label (shown instead of the course name; e.g. “OS Lab”, “Library”)
                  <input value={d.label ?? ''} onChange={e => set(d.key, { label: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-[13px] text-foreground" />
                </label>
                <label className="text-[12px] text-muted-foreground">Who attends
                  <select value={`${d.audience ?? 'ALL'}|${d.audience_value ?? d.group_id ?? ''}`} onChange={e => {
                    const [a, v] = e.target.value.split('|') as [Audience, string]
                    set(d.key, { audience: a, audience_value: a === 'BATCH' || a === 'VERTICAL' ? v : null, group_id: a === 'GROUP' ? v : null })
                  }} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input bg-white text-[13px] text-foreground">
                    <option value="ALL|">Whole class</option>
                    <option value="BATCH|1">Batch 1</option>
                    <option value="BATCH|2">Batch 2</option>
                    <option value="BATCH|3">Batch 3</option>
                    {verticals.map(v => <option key={v.code} value={`VERTICAL|${v.code}`}>{v.name}</option>)}
                    {groups.map(g => <option key={g.id} value={`GROUP|${g.id}`}>{g.name}</option>)}
                  </select>
                </label>
                <label className="text-[12px] text-muted-foreground">Room
                  <input value={d.room ?? ''} onChange={e => set(d.key, { room: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-[13px] text-foreground" />
                </label>
                <label className="text-[12px] text-muted-foreground sm:col-span-2">Faculty with ERP accounts (they see this hour under “My classes”)
                  <select multiple value={d.faculty_ids ?? []} onChange={e => set(d.key, { faculty_ids: [...e.target.selectedOptions].map(o => o.value) })} className="mt-0.5 w-full h-24 px-2 rounded-md border border-input bg-white text-[13px] text-foreground">
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </label>
                <label className="text-[12px] text-muted-foreground sm:col-span-2">Faculty names as printed (include external / other-department faculty)
                  <input value={d.faculty_names ?? ''} onChange={e => set(d.key, { faculty_names: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-[13px] text-foreground" />
                </label>
                <label className="text-[12px] text-muted-foreground">From date (optional)
                  <input type="date" value={d.effective_from ?? ''} onChange={e => set(d.key, { effective_from: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-[13px] text-foreground" />
                </label>
                <label className="text-[12px] text-muted-foreground">Until date (optional)
                  <input type="date" value={d.effective_to ?? ''} onChange={e => set(d.key, { effective_to: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-[13px] text-foreground" />
                </label>
                <label className="inline-flex items-center gap-2 text-[13px] sm:col-span-2">
                  <input type="checkbox" checked={d.takes_attendance ?? true} onChange={e => set(d.key, { takes_attendance: e.target.checked })} className="accent-licet-indigo" /> Attendance is taken in this hour
                </label>
              </div>
            </div>
          ))}
          {blockPeriods.length > 1 && (
            <label className="flex items-center gap-2 text-[13px] rounded-md bg-licet-cream/40 border border-licet-gold px-3 py-2">
              <input type="checkbox" checked={wholeBlock} onChange={e => setWholeBlock(e.target.checked)} className="accent-licet-indigo" />
              Apply changes to the whole block (periods {blockPeriods[0]}–{blockPeriods[blockPeriods.length - 1]}) — keeps a lab’s batches the same for all its hours
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={add} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-dashed border-licet-violet text-licet-violet text-[13px] font-semibold hover:bg-licet-cream/40"><Plus className="w-4 h-4" /> Add entry{live.length ? ' (split this hour)' : ''}</button>
            {drafts.some(d => d._new) && (
              <label className="text-[12.5px] text-muted-foreground inline-flex items-center gap-2">New entries run for
                <select value={span} onChange={e => setSpan(Number(e.target.value))} className="h-8 px-1 rounded border border-input bg-white">{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} period{n > 1 ? 's' : ''}</option>)}</select>
              </label>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-border text-[13px] font-semibold">Cancel</button>
          <button onClick={save} disabled={busy} className="h-9 px-5 rounded-md bg-licet-indigo text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  )
}
