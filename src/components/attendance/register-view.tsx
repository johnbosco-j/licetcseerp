"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Loader2, BadgeCheck } from "lucide-react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"
import {
  SECTIONS, type AttSession, type Offering, type Term, type ClassBlock, type TimetableEntry,
  loadRosterStudents, type RosterStudent, DAY_SHORT, weekdayOf,
} from "@/lib/academic"
import { MarkPanel } from "./mark-panel"

const gradOf = (term: Term, section: string) =>
  Number(term.academic_year.split('-')[1]) + ({ I: 3, II: 2, III: 1, IV: 0 } as Record<string, number>)[section.split(' ')[0]]

export function RegisterView({ term, isHod, me, defaultSection }: { term: Term; isHod: boolean; me: { id: string }; defaultSection?: string | null }) {
  const [section, setSection] = useState(defaultSection ?? 'II CSE-A')
  const [month, setMonth] = useState('')
  const [subject, setSubject] = useState('')
  const [sessions, setSessions] = useState<AttSession[]>([])
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [verifs, setVerifs] = useState<{ upto_date: string; verified_at: string; remarks: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [edit, setEdit] = useState<AttSession | null>(null)

  const months = useMemo(() => {
    const out: string[] = []
    if (!term.starts_on) return out
    const d = new Date(term.starts_on + 'T00:00:00Z'); const end = new Date((term.ends_on ?? term.starts_on) + 'T00:00:00Z')
    while (d <= end) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1, 1) }
    return out
  }, [term])
  useEffect(() => {
    const cur = new Date().toISOString().slice(0, 7)
    setMonth(months.includes(cur) ? cur : months[months.length - 1] ?? '')
  }, [months])

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    const grad = gradOf(term, section)
    const from = month + '-01'
    const to = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10)
    const [own, cohort, offs, ver] = await Promise.all([
      supabase.from('attendance_sessions').select('*').eq('term_id', term.id).eq('section', section).gte('date', from).lte('date', to),
      supabase.from('attendance_sessions').select('*').eq('term_id', term.id).is('section', null).eq('cohort_grad_year', grad).gte('date', from).lte('date', to),
      supabase.from('subjects').select('*').eq('term_id', term.id).or(`section.eq.${section},and(section.is.null,cohort_grad_year.eq.${grad})`),
      supabase.from('attendance_verifications').select('upto_date, verified_at, remarks').eq('term_id', term.id).eq('section', section).order('verified_at', { ascending: false }),
    ])
    const ownS = (own.data ?? []) as AttSession[]
    // Members of the class: everyone on its own (non-cohort) hours; cohort hours only for them.
    let ids = [...new Set(ownS.flatMap(s => s.roster))]
    if (!ids.length) {
      const { data } = await supabase.from('profiles').select('id').eq('role', 'STUDENT').eq('section', section).eq('is_active', true)
      ids = (data ?? []).map((r: { id: string }) => r.id)
    }
    const idset = new Set(ids)
    const all = [...ownS, ...((cohort.data ?? []) as AttSession[]).filter(s => s.roster.some(id => idset.has(id)))]
      .sort((a, b) => a.date.localeCompare(b.date) || a.period_no - b.period_no)
    setSessions(all)
    setOfferings((offs.data ?? []) as Offering[])
    setVerifs((ver.data ?? []) as typeof verifs)
    const st = await loadRosterStudents(ids)
    setStudents(st.sort((a, b) => (a.register_number ?? 'z' + a.full_name).localeCompare(b.register_number ?? 'z' + b.full_name)))
    setLoading(false)
  }, [term, section, month])
  useEffect(() => { load() }, [load])

  const offName = (id: string | null, label: string | null) => {
    const o = offerings.find(x => x.id === id)
    return o ? (o.short_name || o.code) : (label ?? '—')
  }
  const cols = useMemo(() => {
    // One column per (date, period); a split hour has several sessions in one column.
    const map = new Map<string, AttSession[]>()
    for (const s of sessions) {
      if (subject && s.subject_id !== subject) continue
      const k = `${s.date}|${s.period_no}`
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return [...map.entries()].map(([k, ss]) => ({ key: k, date: k.split('|')[0], period: Number(k.split('|')[1]), sessions: ss }))
  }, [sessions, subject])
  const dates = useMemo(() => [...new Set(cols.map(c => c.date))], [cols])

  const cell = (sid: string, ss: AttSession[]) => {
    const s = ss.find(x => x.roster.includes(sid))
    if (!s) return null
    return s.absent.includes(sid) ? 'A' : (s.on_duty ?? []).includes(sid) ? 'OD' : 'P'
  }
  const totals = (sid: string) => {
    let h = 0, p = 0
    for (const c of cols) { const v = cell(sid, c.sessions); if (v) { h++; if (v !== 'A') p++ } }
    return { h, p, pct: h ? Math.round(p / h * 1000) / 10 : null }
  }

  const exportXlsx = () => {
    const header = ['S.No', 'Roll No', 'Reg No', 'Name', ...cols.map(c => `${c.date.slice(8)}/${c.date.slice(5, 7)} P${c.period} ${offName(c.sessions[0].subject_id, c.sessions[0].label)}`), 'Present', 'Worked', '%']
    const rows = students.map((s, i) => {
      const t = totals(s.id)
      return [i + 1, s.roll_number ?? '', s.register_number ?? '', s.full_name, ...cols.map(c => { const v = cell(s.id, c.sessions); return v === 'P' ? 1 : v === 'OD' ? 2 : v === 'A' ? 0 : '' }), t.p, t.h, t.pct ?? '']
    })
    const ws = XLSX.utils.aoa_to_sheet([[`${section} — Attendance ${month} (${term.label})`], header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, section)
    XLSX.writeFile(wb, `Attendance_${section.replace(/\s/g, '_')}_${month}.xlsx`)
  }

  const verify = async () => {
    const upto = dates[dates.length - 1]
    if (!upto) return
    const { error } = await supabase.from('attendance_verifications').insert({ term_id: term.id, section, upto_date: upto, verified_by: me.id, remarks: `Register verified up to ${upto}` })
    if (reportResult(error, `Register verified up to ${upto}`)) load()
  }

  const blockFor = (s: AttSession): ClassBlock => {
    const e: TimetableEntry = {
      id: s.entry_id ?? s.id, term_id: s.term_id ?? term.id, section: s.section ?? section, day_order: weekdayOf(s.date), period_no: s.period_no,
      subject_id: s.subject_id, label: s.label, audience: s.audience, audience_value: s.audience_value, group_id: s.group_id, room: null,
      faculty_ids: [], faculty_names: null, takes_attendance: true, effective_from: null, effective_to: null,
      subjects: offerings.find(o => o.id === s.subject_id) as TimetableEntry['subjects'],
    }
    return { key: s.id, section: e.section, periods: [s.period_no], entry: e, entries: [e] }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={section} onChange={e => setSection(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
          {SECTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
          {months.map(m => <option key={m} value={m}>{new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
        </select>
        <select value={subject} onChange={e => setSubject(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px] max-w-[260px]">
          <option value="">All courses</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{o.short_name || o.code} — {o.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {isHod && <button onClick={verify} disabled={!dates.length} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-licet-violet text-licet-violet text-[13px] font-semibold hover:bg-licet-cream/50 disabled:opacity-50"><BadgeCheck className="w-4 h-4" /> Verify register</button>}
          <button onClick={exportXlsx} disabled={!cols.length} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50"><Download className="w-4 h-4" /> Excel</button>
        </div>
      </div>
      {verifs.length > 0 && (
        <p className="text-[12.5px] text-muted-foreground">HOD verification: {verifs.slice(0, 3).map(v => `up to ${v.upto_date} (on ${new Date(v.verified_at).toLocaleDateString('en-IN')})`).join(' · ')}{verifs.length > 3 ? ` · ${verifs.length} in all` : ''}</p>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading register…</div>
      ) : !cols.length ? (
        <div className="rounded-lg border border-dashed border-border bg-white px-6 py-10 text-center text-[13.5px] text-muted-foreground">No attendance recorded for {section} in this month.</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border bg-white max-h-[70vh]">
          <table className="text-[11.5px] border-collapse">
            <thead className="sticky top-0 z-10 bg-licet-paper">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 bg-licet-paper text-left px-2 py-1 border-b border-r border-border min-w-[220px]">Student</th>
                {dates.map(d => {
                  const n = cols.filter(c => c.date === d).length
                  return <th key={d} colSpan={n} className="px-1 py-1 border-b border-l border-border font-semibold whitespace-nowrap">{DAY_SHORT[weekdayOf(d)]} {d.slice(8)}/{d.slice(5, 7)}</th>
                })}
                <th rowSpan={2} className="px-2 py-1 border-b border-l border-border">Hrs</th>
                <th rowSpan={2} className="px-2 py-1 border-b border-l border-border">%</th>
              </tr>
              <tr>
                {cols.map(c => (
                  <th key={c.key} className="px-0.5 py-1 border-b border-l border-border font-normal text-[10px] leading-tight min-w-[30px]" title={c.sessions.map(s => offName(s.subject_id, s.label)).join(' / ')}>
                    {c.sessions.length === 1
                      ? <button onClick={() => setEdit(c.sessions[0])} className="hover:text-licet-violet">{c.period}<span className="block truncate max-w-[34px]">{offName(c.sessions[0].subject_id, c.sessions[0].label)}</span></button>
                      : <span>{c.period}<span className="block text-licet-violet">split</span></span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(s => {
                const t = totals(s.id)
                return (
                  <tr key={s.id} className="hover:bg-licet-cream/30">
                    <td className="sticky left-0 bg-white px-2 py-0.5 border-r border-b border-border whitespace-nowrap">
                      <span className="font-mono text-[10.5px] text-muted-foreground mr-1.5">{s.register_number?.slice(-3) ?? '—'}</span>{s.full_name}
                    </td>
                    {cols.map(c => {
                      const v = cell(s.id, c.sessions)
                      return <td key={c.key} className={`text-center border-l border-b border-border ${v === 'A' ? 'bg-red-100 text-red-800 font-bold' : v === 'OD' ? 'bg-violet-50 text-licet-violet font-semibold text-[9.5px]' : v === 'P' ? 'text-green-800' : 'bg-muted/30 text-muted-foreground'}`}>{v ?? '·'}</td>
                    })}
                    <td className="px-2 text-center border-l border-b border-border tabular-nums">{t.p}/{t.h}</td>
                    <td className={`px-2 text-center border-l border-b border-border tabular-nums font-semibold ${t.pct !== null && t.pct < 65 ? 'text-red-700' : t.pct !== null && t.pct < 75 ? 'text-amber-700' : ''}`}>{t.pct ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">P = present · OD = present on duty · A = absent · · = not in that class (other batch or vertical). Excel export uses 1 / 2 (OD) / 0 like the department register. Click a period number to open that hour.</p>
      {edit && <MarkPanel key={edit.id} date={edit.date} block={blockFor(edit)} dayOrder={null} isHod={isHod} onClose={() => { setEdit(null); load() }} onSaved={load} />}
    </div>
  )
}
