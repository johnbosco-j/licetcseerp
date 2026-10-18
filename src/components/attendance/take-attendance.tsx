"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Lock, CheckCircle2, Circle, PencilLine, QrCode } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  SECTIONS, DAY_NAMES, type AttSession, type ClassBlock, type PeriodSlot, type Term, type TimetableEntry,
  activeOn, dayInfo, entryTitle, fmtTime, isoToday, loadPeriods, loadTimetable, shortAudience, toBlocks, weekdayOf,
} from "@/lib/academic"
import { MarkPanel } from "./mark-panel"
import { DelegationsButton, loadDelegationsToMe, type Delegation } from "./delegations"

type DayMap = Record<string, { working: boolean; dayOrder: number | null; label: string | null }>

const sameClass = (s: AttSession, e: TimetableEntry) =>
  (s.subject_id ?? null) === (e.subject_id ?? null) && (e.subject_id ? true : s.label === e.label) &&
  s.audience === e.audience && (s.audience_value ?? '') === (e.audience_value ?? '') && (s.section === e.section || s.section === null)

function statusOf(sessions: AttSession[], block: ClassBlock, now: number) {
  const mine = block.periods.map(p => sessions.find(s => s.period_no === p && sameClass(s, block.entries.find(x => x.period_no === p) ?? block.entry)))
  if (mine.every(s => !s)) return { tone: 'todo' as const, text: 'Not taken' }
  if (mine.every(s => s?.status === 'SUBMITTED')) {
    const locked = mine.every(s => s!.lock_at && now > Date.parse(s!.lock_at) && (!s!.unlocked_until || Date.parse(s!.unlocked_until) < now))
    const present = mine[0]!.roster.length - mine[0]!.absent.length
    return { tone: locked ? 'locked' as const : 'done' as const, text: `${present}/${mine[0]!.roster.length} present` }
  }
  if (mine.some(s => s?.mode === 'SELF')) return { tone: 'self' as const, text: 'Self check-in' }
  return { tone: 'draft' as const, text: 'Draft' }
}
const TONES = {
  todo: 'border-border bg-white',
  draft: 'border-amber-300 bg-amber-50',
  self: 'border-licet-gold bg-licet-cream/60',
  done: 'border-green-300 bg-green-50',
  locked: 'border-green-200 bg-green-50/50',
}
const ICON = { todo: Circle, draft: PencilLine, self: QrCode, done: CheckCircle2, locked: Lock }

/** isLab: a lab instructor — today's lab hours of every class, nothing else. */
export function TakeAttendance({ term, me, isHod, isLab = false }: { term: Term; me: { id: string; full_name: string }; isHod: boolean; isLab?: boolean }) {
  const [date, setDate] = useState(isoToday())
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [periods, setPeriods] = useState<PeriodSlot[]>([])
  const [days, setDays] = useState<DayMap>({})
  const [sessions, setSessions] = useState<AttSession[]>([])
  const [covering, setCovering] = useState<Delegation[]>([])
  const [view, setView] = useState<'mine' | 'all'>(isHod ? 'all' : 'mine')
  const [section, setSection] = useState<string>('')
  const [open, setOpen] = useState<{ block: ClassBlock; dayOrder: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  // my account, plus the HOD in person when this is the HOD office account; and the courses they teach
  const [teach, setTeach] = useState<{ ids: string[]; courses: Set<string> }>({ ids: [me.id], courses: new Set() })
  useEffect(() => {
    let off = false
    ;(async () => {
      const { data } = await supabase.rpc('my_teaching_ids')
      const ids = ((data ?? [me.id]) as string[]).filter(Boolean)
      const { data: links } = await supabase.from('subject_faculty').select('subject_id').in('faculty_id', ids)
      if (!off) setTeach({ ids, courses: new Set(((links ?? []) as { subject_id: string }[]).map(l => l.subject_id)) })
    })()
    return () => { off = true }
  }, [me.id])

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    loadTimetable(term.id).then(setEntries)
    loadPeriods(term.id).then(setPeriods)
  }, [term.id])

  const loadDay = useCallback(async () => {
    setLoading(true)
    const infos = await Promise.all(SECTIONS.map(s => dayInfo(date, s)))
    setDays(Object.fromEntries(SECTIONS.map((s, i) => [s, infos[i]])))
    const [{ data }, dl] = await Promise.all([
      supabase.from('attendance_sessions').select('*').eq('date', date),
      loadDelegationsToMe(me.id, date),
    ])
    setSessions((data ?? []) as AttSession[])
    setCovering(dl)
    setLoading(false)
  }, [date, me.id])
  useEffect(() => { loadDay() }, [loadDay])

  const blocksFor = useCallback((sec: string) => {
    const d = days[sec]
    if (!d?.dayOrder) return []
    return toBlocks(entries.filter(e => e.section === sec && e.day_order === d.dayOrder && e.takes_attendance && activeOn(e, date)))
  }, [days, entries, date])

  // A cohort class (vertical / honours) appears in both sections' grids; list it once.
  const myBlocks = useMemo(() => {
    const out: ClassBlock[] = []
    const seen = new Set<string>()
    for (const sec of SECTIONS) for (const b of blocksFor(sec)) {
      if (isLab) {
        if (!b.entry.is_lab || seen.has(b.key)) continue
        seen.add(b.key); out.push(b); continue
      }
      const handedToMe = covering.some(d => (d.subject_id && d.subject_id === b.entry.subject_id) || (!d.subject_id && b.entry.faculty_ids.includes(d.from_faculty)))
      const mine = teach.ids.some(id => b.entry.faculty_ids.includes(id)) || (!!b.entry.subject_id && teach.courses.has(b.entry.subject_id))
      if (!mine && !handedToMe) continue
      const k = b.entry.subjects?.section === null ? `${b.entry.subject_id}|${b.entry.audience_value}|${b.periods[0]}` : b.key
      if (seen.has(k)) continue
      seen.add(k); out.push(b)
    }
    return out.sort((a, b) => a.periods[0] - b.periods[0])
  }, [blocksFor, teach, covering, isLab])

  const shift = (n: number) => {
    const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
    const iso = d.toISOString().slice(0, 10)
    if (iso <= isoToday() && !isLab) setDate(iso)
  }
  const wd = weekdayOf(date)
  const anyDay = days[section || 'II CSE-A']
  const periodTime = (p: number) => { const s = periods.find(x => x.period_no === p); return s ? fmtTime(s.starts_at) : '' }

  const blockCard = (b: ClassBlock) => {
    const st = statusOf(sessions, b, now)
    const Icon = ICON[st.tone]
    return (
      <button key={b.key} onClick={() => setOpen({ block: b, dayOrder: days[b.section]?.dayOrder ?? null })}
        className={`w-full text-left rounded-lg border px-4 py-3 hover:shadow-md transition-shadow ${TONES[st.tone]}`}>
        <div className="flex items-start gap-3">
          <div className="w-16 shrink-0">
            <p className="font-display font-bold text-licet-indigo text-lg leading-none">P{b.periods[0]}{b.periods.length > 1 ? `–${b.periods[b.periods.length - 1]}` : ''}</p>
            <p className="text-[11.5px] text-muted-foreground mt-1">{periodTime(b.periods[0])}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14.5px] text-foreground truncate">{entryTitle(b.entry)}</p>
            <p className="text-[12.5px] text-muted-foreground truncate">
              {b.entry.subjects?.section === null ? 'Combined (both sections)' : b.section}{b.entry.audience !== 'ALL' ? ` · ${shortAudience(b.entry.audience, b.entry.audience_value)}` : ''}{b.entry.room ? ` · ${b.entry.room}` : ''}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground whitespace-nowrap"><Icon className="w-3.5 h-3.5" /> {st.text}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-md border border-border bg-white">
          <button onClick={() => shift(-1)} className="p-2 hover:bg-muted rounded-l-md" aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
          <label className="flex items-center gap-2 px-2">
            <CalendarDays className="w-4 h-4 text-licet-violet" />
            <input type="date" value={date} max={isoToday()} onChange={e => e.target.value && setDate(e.target.value)} className="h-9 text-[13.5px] bg-transparent focus:outline-none" />
          </label>
          <button onClick={() => shift(1)} disabled={date >= isoToday()} className="p-2 hover:bg-muted rounded-r-md disabled:opacity-40" aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <p className="text-[13.5px] text-muted-foreground">
          <b className="text-foreground">{DAY_NAMES[wd] ?? 'Sunday'}</b>
          {anyDay?.dayOrder && anyDay.dayOrder !== wd ? <> · follows <b className="text-licet-violet">{DAY_NAMES[anyDay.dayOrder]}</b> timetable</> : null}
          {anyDay && !anyDay.working ? <> · <span className="text-amber-700">not a working day{anyDay.label ? ` (${anyDay.label.split(' / ')[0]})` : ''}</span></> : null}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
        {!isLab && <DelegationsButton me={me.id} termId={term.id} />}
        {!isLab && <div className="inline-flex rounded-md border border-border overflow-hidden text-[13px]">
          <button onClick={() => setView('mine')} className={`px-3 h-9 ${view === 'mine' ? 'bg-licet-indigo text-white' : 'bg-white hover:bg-muted'}`}>My classes</button>
          <button onClick={() => setView('all')} className={`px-3 h-9 ${view === 'all' ? 'bg-licet-indigo text-white' : 'bg-white hover:bg-muted'}`}>{isHod ? 'All classes' : 'All classes (view)'}</button>
        </div>}
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading the day…</div>
      ) : view === 'mine' ? (
        myBlocks.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2">{myBlocks.map(blockCard)}</div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-white px-6 py-10 text-center text-[13.5px] text-muted-foreground">
            {isLab ? 'No lab hours today.' : <>No classes on your timetable for this day. Class advisors can take any hour of their class from <b>All classes</b>; to cover a colleague, ask them to hand the class over to you.
            <br /><span className="text-[12.5px]">If your classes are missing, ask the HOD to link your name to the courses in Configuration → Courses.</span></>}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSection('')} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${!section ? 'bg-licet-indigo text-white border-licet-indigo' : 'border-border bg-white'}`}>All sections</button>
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${section === s ? 'bg-licet-indigo text-white border-licet-indigo' : 'border-border bg-white'}`}>{s}</button>
            ))}
          </div>
          {section ? (
            blocksFor(section).length
              ? <div className="grid gap-2.5 sm:grid-cols-2">{blocksFor(section).map(blockCard)}</div>
              : <p className="text-[13.5px] text-muted-foreground">No classes for {section} on this day.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-white">
              <table className="w-full text-[12.5px] border-collapse">
                <thead>
                  <tr className="bg-licet-paper">
                    <th className="text-left px-3 py-2 border-b border-border w-28">Class</th>
                    {periods.map(p => <th key={p.period_no} className="px-2 py-2 border-b border-l border-border font-semibold">P{p.period_no}<span className="block font-normal text-[10.5px] text-muted-foreground">{fmtTime(p.starts_at)}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map(sec => {
                    const d = days[sec]
                    const blocks = blocksFor(sec)
                    return (
                      <tr key={sec} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-semibold text-licet-indigo whitespace-nowrap">{sec}{d && !d.working ? <span className="block font-normal text-[11px] text-amber-700">holiday</span> : null}</td>
                        {periods.map(p => {
                          const here = blocks.filter(b => b.periods.includes(p.period_no))
                          return (
                            <td key={p.period_no} className="border-l border-border p-1 align-top min-w-[92px]">
                              {here.map(b => {
                                const st = statusOf(sessions, b, now)
                                return (
                                  <button key={b.key} onClick={() => setOpen({ block: { ...b, periods: [p.period_no], entries: b.entries.filter(x => x.period_no === p.period_no) }, dayOrder: d?.dayOrder ?? null })}
                                    className={`w-full mb-0.5 last:mb-0 rounded border px-1.5 py-1 text-left leading-tight ${TONES[statusOf(sessions, { ...b, periods: [p.period_no] }, now).tone]}`} title={st.text}>
                                    <span className="block font-semibold truncate">{entryTitle(b.entry)}</span>
                                    {b.entry.audience !== 'ALL' && <span className="block text-[10.5px] text-muted-foreground">{shortAudience(b.entry.audience, b.entry.audience_value)}</span>}
                                  </button>
                                )
                              })}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-border text-[11.5px] text-muted-foreground">
                {(['todo', 'draft', 'self', 'done', 'locked'] as const).map(t => <span key={t} className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded border ${TONES[t]}`} />{{ todo: 'Not taken', draft: 'Draft', self: 'Self check-in', done: 'Submitted', locked: 'Locked' }[t]}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {open && <MarkPanel key={`${date}|${open.block.entries.map(x => x.id).join()}|${open.block.periods.join()}`} date={date} block={open.block} dayOrder={open.dayOrder} isHod={isHod} onClose={() => { setOpen(null); loadDay() }} onSaved={loadDay} />}
    </div>
  )
}
