"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, X, Loader2, Lock, Unlock, QrCode, RefreshCw, Search, Users, Timer, ShieldAlert } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast, reportResult } from "@/components/toaster"
import {
  type AttSession, type ClassBlock, type RosterStudent, loadRosterStudents, entryTitle, audienceLabel, DAY_NAMES,
} from "@/lib/academic"

const isLocked = (s: AttSession, now: number) =>
  s.status === 'SUBMITTED' && !!s.lock_at && now > Date.parse(s.lock_at) && (!s.unlocked_until || Date.parse(s.unlocked_until) < now)

function mmss(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function MarkPanel({ date, block, dayOrder, isHod, onClose, onSaved }: {
  date: string
  block: ClassBlock
  dayOrder: number | null
  isHod: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const e = block.entry
  const [sessions, setSessions] = useState<AttSession[]>([])
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [absent, setAbsent] = useState<Set<string>>(new Set())
  const [onDuty, setOnDuty] = useState<Set<string>>(new Set())
  const [onLeave, setOnLeave] = useState<Set<string>>(new Set())
  const [periods, setPeriods] = useState<number[]>(block.periods)
  const [topic, setTopic] = useState('')
  const [headcount, setHeadcount] = useState('')
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [dirty, setDirty] = useState(false)

  const open = useCallback(async () => {
    setLoading(true)
    const out: AttSession[] = []
    for (const p of block.periods) {
      const ent = block.entries.find(x => x.period_no === p) ?? e
      const { data, error } = await supabase.rpc('att_open', {
        p_date: date, p_period: p, p_section: ent.section, p_subject: ent.subject_id, p_label: ent.subject_id ? null : ent.label,
        p_audience: ent.audience, p_value: ent.audience_value, p_group: ent.group_id, p_entry: ent.id,
      })
      if (error) { toast.error(error.message); setLoading(false); return }
      out.push(data as AttSession)
    }
    setSessions(out)
    const ids = [...new Set(out.flatMap(s => s.roster))]
    setStudents(await loadRosterStudents(ids))
    setAbsent(new Set(out[0]?.absent ?? []))
    setOnDuty(new Set(out[0]?.on_duty ?? []))
    // approved leave covering this date (shown as a hint; the teacher still marks)
    const { data: lv } = await supabase.from('leaves').select('applicant_id').in('applicant_id', ids.slice(0, 300))
      .eq('status', 'APPROVED').lte('from_date', date).gte('to_date', date)
    setOnLeave(new Set(((lv ?? []) as { applicant_id: string }[]).map(l => l.applicant_id)))
    setTopic(out[0]?.topic ?? '')
    setHeadcount(out[0]?.headcount != null ? String(out[0].headcount) : '')
    setDirty(false)
    setLoading(false)
  }, [block, date, e])

  useEffect(() => { open() }, [open])
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [])

  const selfOpen = sessions.some(s => s.mode === 'SELF' && s.status !== 'SUBMITTED' && s.self_open_until && Date.parse(s.self_open_until) > now)
  // While phones are checking in, refresh the list every few seconds.
  useEffect(() => {
    if (!selfOpen || dirty) return
    const iv = setInterval(async () => {
      const { data } = await supabase.from('attendance_sessions').select('*').in('id', sessions.map(s => s.id))
      if (data) {
        const fresh = block.periods.map(p => (data as AttSession[]).find(s => s.period_no === p)).filter(Boolean) as AttSession[]
        setSessions(fresh); setAbsent(new Set(fresh[0]?.absent ?? []))
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [selfOpen, dirty, sessions, block.periods])

  const chosen = sessions.filter(s => periods.includes(s.period_no))
  const locked = chosen.some(s => isLocked(s, now))
  const submitted = chosen.length > 0 && chosen.every(s => s.status === 'SUBMITTED')
  const lockAt = chosen.map(s => s.lock_at).filter(Boolean).map(x => Date.parse(x!)).sort()[0]
  const unlockUntil = chosen.map(s => s.unlocked_until).filter(Boolean).map(x => Date.parse(x!)).sort().reverse()[0]
  const canEdit = !locked || isHod
  const differs = sessions.length > 1 && sessions.some(s => s.absent.length !== sessions[0].absent.length || s.absent.some(x => !sessions[0].absent.includes(x)))

  const toggleOd = (id: string) => {
    if (!canEdit || absent.has(id)) return
    setOnDuty(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setDirty(true)
  }
  const toggle = (id: string) => {
    setOnDuty(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n })
    if (!canEdit) return
    setAbsent(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setDirty(true)
  }
  const setAll = (present: boolean) => { if (!canEdit) return; setAbsent(present ? new Set() : new Set(students.map(s => s.id))); if (!present) setOnDuty(new Set()); setDirty(true) }

  const save = async (submit: boolean) => {
    if (!chosen.length) { toast.error('Choose at least one period'); return }
    if (locked && isHod && !reason.trim()) { toast.error('Give a reason for changing a locked hour'); return }
    setBusy(true)
    let ok = true
    for (const s of chosen) {
      const ab = [...absent].filter(id => s.roster.includes(id))
      const { data, error } = await supabase.rpc('att_save', {
        p_session: s.id, p_absent: ab, p_topic: topic || null, p_submit: submit, p_reason: locked ? reason.trim() : null,
        p_headcount: headcount.trim() ? Number(headcount) : null,
        p_on_duty: [...onDuty].filter(id => s.roster.includes(id) && !absent.has(id)),
      })
      if (error) { reportResult(error); ok = false; break }
      setSessions(prev => prev.map(x => x.id === s.id ? (data as AttSession) : x))
    }
    setBusy(false)
    if (ok) {
      setDirty(false)
      toast.success(submit ? `Submitted · ${presentCount}/${students.length} present. You can still correct it for a few minutes.` : 'Saved as draft')
      onSaved?.()
    }
  }

  const unlock = async () => {
    setBusy(true)
    for (const s of chosen) {
      const { data, error } = await supabase.rpc('att_unlock', { p_session: s.id, p_minutes: 30 })
      if (!reportResult(error)) break
      setSessions(prev => prev.map(x => x.id === s.id ? (data as AttSession) : x))
    }
    setBusy(false)
    toast.success('Unlocked for 30 minutes — the class teacher can correct it now')
  }

  const startSelf = async () => {
    setBusy(true)
    for (const s of chosen) {
      const { data, error } = await supabase.rpc('att_self_open', { p_session: s.id, p_minutes: 10 })
      if (!reportResult(error)) { setBusy(false); return }
      setSessions(prev => prev.map(x => x.id === s.id ? (data as AttSession) : x))
      if (s === chosen[0]) setAbsent(new Set((data as AttSession).absent))
    }
    setBusy(false)
    setDirty(false)
    toast.info('Self check-in is open for 10 minutes. Start the Attendance Station on your laptop and show its QR code.')
  }

  const refreshRoster = async () => {
    for (const s of sessions) {
      const { error } = await supabase.rpc('att_refresh_roster', { p_session: s.id })
      if (!reportResult(error)) return
    }
    await open()
    toast.success('List updated from current batches and verticals')
  }

  const shown = useMemo(() => {
    const t = query.trim().toLowerCase()
    return t ? students.filter(s => s.full_name.toLowerCase().includes(t) || (s.register_number ?? '').includes(t) || (s.roll_number ?? '').toLowerCase().includes(t)) : students
  }, [students, query])
  const presentCount = students.length - [...absent].filter(id => students.some(s => s.id === id)).length

  const title = entryTitle(e)
  const multiSection = sessions[0] && sessions[0].section === null

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-2xl flex flex-col max-h-full sm:max-h-[92vh]" onClick={ev => ev.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{DAY_NAMES[new Date(date + 'T00:00:00').getDay() || 7]} · {date}{dayOrder && dayOrder !== (new Date(date + 'T00:00:00').getDay() || 7) ? ` · ${DAY_NAMES[dayOrder]} order` : ''}</p>
              <h2 className="font-display text-xl font-bold text-licet-indigo mt-1 truncate">{title}{e.subjects?.code ? <span className="text-muted-foreground font-sans text-sm font-normal ml-2">{e.subjects.code}</span> : null}</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {multiSection ? 'III CSE-A + III CSE-B together' : e.section} · {audienceLabel(e.audience, e.audience_value)}
              </p>
            </div>
            <button onClick={onClose} className="p-2 -m-2 rounded-md hover:bg-muted" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          {block.periods.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[13px]">
              <span className="text-muted-foreground">Apply to</span>
              {block.periods.map(p => (
                <label key={p} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer ${periods.includes(p) ? 'bg-licet-indigo text-white border-licet-indigo' : 'border-border'}`}>
                  <input type="checkbox" className="sr-only" checked={periods.includes(p)} onChange={() => setPeriods(ps => ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p].sort())} />
                  Period {p}
                </label>
              ))}
              {differs && <span className="text-amber-700 text-[12px]">Periods were marked differently — showing period {block.periods[0]}</span>}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Opening the register…</div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-border space-y-2">
              {submitted && !locked && lockAt && (
                <div className="flex items-center gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <Timer className="w-4 h-4 shrink-0" /> Submitted. Corrections allowed for <b className="tabular-nums">{mmss((unlockUntil && unlockUntil > lockAt ? unlockUntil : lockAt) - now)}</b>, then it locks.
                </div>
              )}
              {locked && (
                <div className="flex items-center gap-2 text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="flex-1">Locked{isHod ? ' — as HOD you can still correct it (a reason is recorded in the audit trail).' : '. Ask the HOD to unlock it if a correction is needed.'}</span>
                  {isHod && <button onClick={unlock} disabled={busy} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-licet-indigo hover:underline"><Unlock className="w-3.5 h-3.5" /> Unlock 30 min</button>}
                </div>
              )}
              {selfOpen && (
                <div className="flex items-center gap-2 text-[13px] text-licet-indigo bg-licet-cream/60 border border-licet-gold rounded-md px-3 py-2">
                  <QrCode className="w-4 h-4 shrink-0" /> Self check-in is open — students on your Attendance Station Wi-Fi are turning present live. Review and submit when done.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={query} onChange={ev => setQuery(ev.target.value)} placeholder="Search name or register no."
                    className="w-full h-9 pl-8 pr-2 rounded-md border border-input text-[13.5px] focus:outline-none focus:border-licet-violet" />
                </div>
                <button onClick={() => setAll(true)} disabled={!canEdit} className="h-9 px-3 rounded-md border border-border text-[13px] font-medium hover:bg-green-50 disabled:opacity-50">All present</button>
                <button onClick={() => setAll(false)} disabled={!canEdit} className="h-9 px-3 rounded-md border border-border text-[13px] font-medium hover:bg-red-50 disabled:opacity-50">All absent</button>
                <button onClick={refreshRoster} disabled={!canEdit} title="Re-read the list from current batches/verticals" className="h-9 px-2.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"><RefreshCw className="w-4 h-4" /></button>
              </div>
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-border">
              {shown.map((s, i) => {
                const isAbsent = absent.has(s.id)
                const isOd = !isAbsent && onDuty.has(s.id)
                return (
                  <li key={s.id} className={`flex items-center ${isAbsent ? 'bg-red-50/70' : ''}`}>
                    <button onClick={() => toggle(s.id)} disabled={!canEdit}
                      className={`flex-1 min-w-0 flex items-center gap-3 pl-5 pr-2 py-2.5 text-left transition-colors ${isAbsent ? '' : 'hover:bg-muted/40'} disabled:cursor-default`}>
                      <span className="w-7 text-right font-mono text-[11.5px] text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[14px] font-medium truncate ${isAbsent ? 'text-red-800' : 'text-foreground'}`}>{s.full_name}</span>
                        <span className="block font-mono text-[11.5px] text-muted-foreground">{s.register_number ?? s.roll_number ?? '—'}{multiSection && s.section ? ` · ${s.section}` : ''}{s.lab_batch ? ` · B${s.lab_batch}` : ''}{onLeave.has(s.id) ? <span className="ml-1.5 font-sans text-amber-700">· on approved leave</span> : null}</span>
                      </span>
                      <span className={`inline-flex items-center gap-1 w-[92px] justify-center h-8 rounded-full text-[12.5px] font-semibold border ${isAbsent ? 'bg-red-600 text-white border-red-600' : 'bg-green-50 text-green-800 border-green-200'}`}>
                        {isAbsent ? <><X className="w-3.5 h-3.5" /> Absent</> : <><Check className="w-3.5 h-3.5" /> Present</>}
                      </span>
                    </button>
                    <button onClick={() => toggleOd(s.id)} disabled={!canEdit || isAbsent} title="Present on duty (OD)"
                      className={`mr-4 h-8 w-11 rounded-full text-[11.5px] font-bold border transition-colors disabled:opacity-30 ${isOd ? 'bg-licet-violet text-white border-licet-violet' : 'bg-white text-muted-foreground border-border hover:border-licet-violet'}`}>OD</button>
                  </li>
                )
              })}
              {!shown.length && <li className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">{students.length ? 'No match' : 'No students on this list. Check batches / verticals in Configuration.'}</li>}
            </ul>

            <div className="px-5 py-3 border-t border-border space-y-2 bg-licet-paper/60">
              <div className="flex items-center gap-3 text-[13px]">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span><b className="text-green-800">{presentCount}</b> present{onDuty.size ? <> (incl. <b className="text-licet-violet">{[...onDuty].filter(id => !absent.has(id)).length}</b> OD)</> : null} · <b className="text-red-700">{students.length - presentCount}</b> absent · {students.length} on list</span>
              </div>
              <input value={topic} onChange={ev => { setTopic(ev.target.value); setDirty(true) }} disabled={!canEdit}
                placeholder="Topic covered (for the course register)" className="w-full h-9 px-3 rounded-md border border-input text-[13.5px] focus:outline-none focus:border-licet-violet disabled:bg-muted/40" />
              {(selfOpen || sessions.some(x => x.mode === 'SELF')) && (
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground">Head count in the room</span>
                  <input value={headcount} onChange={ev => { setHeadcount(ev.target.value.replace(/\D/g, '').slice(0, 3)); setDirty(true) }} inputMode="numeric" disabled={!canEdit}
                    className="w-20 h-9 px-2 rounded-md border border-input text-[13.5px] focus:outline-none focus:border-licet-violet" />
                  {headcount && presentCount - [...onDuty].filter(id => !absent.has(id)).length > Number(headcount) && <span className="text-red-700 text-[12.5px]">{presentCount - [...onDuty].filter(id => !absent.has(id)).length - Number(headcount)} more present than counted — check the list</span>}
                </label>
              )}
              {locked && isHod && (
                <input value={reason} onChange={ev => setReason(ev.target.value)} placeholder="Reason for changing a locked hour (required)"
                  className="w-full h-9 px-3 rounded-md border border-red-300 text-[13.5px] focus:outline-none focus:border-red-500" />
              )}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {!submitted && !selfOpen && (
                  <button onClick={startSelf} disabled={busy} className="mr-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-licet-violet text-licet-violet text-[13px] font-semibold hover:bg-licet-cream/50">
                    <QrCode className="w-4 h-4" /> Self check-in
                  </button>
                )}
                {locked && !isHod && <span className="mr-auto inline-flex items-center gap-1 text-[12.5px] text-muted-foreground"><ShieldAlert className="w-4 h-4" /> Read only</span>}
                {!submitted && <button onClick={() => save(false)} disabled={busy || !canEdit} className="h-9 px-4 rounded-md border border-border text-[13px] font-semibold hover:bg-muted disabled:opacity-50">Save draft</button>}
                <button onClick={() => save(true)} disabled={busy || !canEdit || (submitted && !dirty)}
                  className="inline-flex items-center gap-1.5 h-9 px-5 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}{submitted ? 'Save correction' : 'Submit'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
