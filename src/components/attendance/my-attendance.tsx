"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, KeyRound, Smartphone } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"
import { attendanceHeadroom } from "@/lib/dashboard"
import { type Offering, type Term, eligibility, TONE, DAY_SHORT, weekdayOf } from "@/lib/academic"

type Hour = { session_id: string; date: string; period_no: number; subject_id: string | null; label: string | null; present: boolean; topic: string | null; status: string }

export function MyAttendance({ terms, minPct, condPct, me }: { terms: Term[]; minPct: number; condPct: number; me: { id: string } }) {
  const [termId, setTermId] = useState(terms.find(t => t.is_current)?.id ?? terms[0]?.id ?? '')
  const [hours, setHours] = useState<Hour[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState('')
  const [device, setDevice] = useState<string | null>(null)

  useEffect(() => {
    if (!termId) return
    setLoading(true)
    supabase.rpc('my_attendance', { p_term: termId }).then(async ({ data }) => {
      const hs = (data ?? []) as Hour[]
      setHours(hs)
      const ids = [...new Set(hs.map(h => h.subject_id).filter(Boolean))] as string[]
      const { data: o } = ids.length ? await supabase.from('subjects').select('*').in('id', ids) : { data: [] }
      setOfferings((o ?? []) as Offering[])
      setLoading(false)
    })
  }, [termId])
  useEffect(() => {
    supabase.from('attendance_devices').select('bound_at').eq('student_id', me.id).maybeSingle().then(({ data }) => setDevice(data?.bound_at ?? null))
  }, [me.id])

  const total = hours.length, present = hours.filter(h => h.present).length
  const pct = total ? present / total * 100 : null
  const el = eligibility(pct, minPct, condPct)
  const room = attendanceHeadroom(present, total, minPct / 100)
  const perCourse = useMemo(() => {
    const m = new Map<string, { name: string; code: string; c: number; a: number }>()
    for (const h of hours) {
      const o = offerings.find(x => x.id === h.subject_id)
      const k = h.subject_id ?? 'L:' + h.label
      const cur = m.get(k) ?? { name: o?.name ?? (h.label ?? '—').replace(/^Event: /, ''), code: o?.code ?? '', c: 0, a: 0 }
      cur.c++; if (h.present) cur.a++
      m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.c - a.c)
  }, [hours, offerings])
  const recent = useMemo(() => {
    const byDate = new Map<string, Hour[]>()
    for (const h of [...hours].reverse()) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h])
    return [...byDate.entries()].slice(0, 20)
  }, [hours])
  const short = (h: Hour) => { const o = offerings.find(x => x.id === h.subject_id); return o?.short_name || o?.code || (h.label ?? '').replace(/^Event: /, '').slice(0, 10) }

  const savePin = async () => {
    const { error } = await supabase.rpc('att_set_pin', { p_pin: pin })
    if (reportResult(error, 'Attendance PIN saved. Use it at the Attendance Station when your teacher opens self check-in.')) setPin('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <select value={termId} onChange={e => setTermId(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
          {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="eyebrow">Overall</p>
              <p className="font-display text-4xl font-bold text-licet-indigo mt-2">{pct === null ? '—' : `${Math.round(pct)}%`}</p>
              <p className="text-[12.5px] text-muted-foreground mt-1">{present} of {total} hours attended</p>
            </div>
            <div className={`rounded-lg border p-4 ${TONE[el.tone]}`}>
              <p className="eyebrow">Status</p>
              <p className="font-display text-2xl font-bold mt-2">{el.label}</p>
              <p className="text-[12.5px] mt-1">{el.tone === 'ok' ? 'Eligible for the semester-end examination' : el.tone === 'warn' ? 'Submit medical / sports documents to the HOD through your class advisor' : el.tone === 'bad' ? 'Not eligible — meet your class advisor' : ''}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="eyebrow">Headroom</p>
              {total ? (room.canMiss > 0
                ? <><p className="font-display text-4xl font-bold text-green-800 mt-2">{room.canMiss}</p><p className="text-[12.5px] text-muted-foreground mt-1">more hours you can miss and stay at {minPct}%</p></>
                : <><p className="font-display text-4xl font-bold text-red-700 mt-2">{room.mustAttend}</p><p className="text-[12.5px] text-muted-foreground mt-1">hours in a row needed to reach {minPct}%</p></>)
                : <p className="text-[13px] text-muted-foreground mt-2">No classes recorded yet.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <p className="px-4 py-2.5 eyebrow border-b border-border">By course</p>
            <table className="w-full text-[13px]">
              <tbody>
                {perCourse.map(c => {
                  const p = c.c ? Math.round(c.a / c.c * 100) : 0
                  return (
                    <tr key={c.code + c.name} className="border-b border-border last:border-0">
                      <td className="px-4 py-2"><span className="font-medium">{c.name}</span>{c.code && <span className="ml-2 font-mono text-[11.5px] text-muted-foreground">{c.code}</span>}</td>
                      <td className="px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{c.a}/{c.c}</td>
                      <td className="px-4 w-40">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden"><div className={`h-full ${p < condPct ? 'bg-red-600' : p < minPct ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${p}%` }} /></div>
                          <span className="w-10 text-right tabular-nums font-semibold">{p}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!perCourse.length && <tr><td className="px-4 py-6 text-center text-muted-foreground">Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <p className="px-4 py-2.5 eyebrow border-b border-border">Day by day (latest first)</p>
            <ul className="divide-y divide-border">
              {recent.map(([d, hs]) => (
                <li key={d} className="px-4 py-2 flex flex-wrap items-center gap-2">
                  <span className="w-24 text-[12.5px] font-medium">{DAY_SHORT[weekdayOf(d)]} {d.slice(8)}/{d.slice(5, 7)}</span>
                  {hs.sort((a, b) => a.period_no - b.period_no).map(h => (
                    <span key={h.session_id} title={`${short(h)}${h.topic ? ' — ' + h.topic : ''}`}
                      className={`text-[11.5px] px-1.5 py-0.5 rounded border ${h.present ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-600 border-red-600 text-white'}`}>
                      P{h.period_no} {short(h)}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="rounded-lg border border-border bg-white p-4 space-y-2">
        <p className="eyebrow flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Attendance PIN (for self check-in)</p>
        <p className="text-[13px] text-muted-foreground">When your teacher opens self check-in, join the Attendance Station Wi-Fi, scan the QR code, then enter your register number and this PIN. The first phone you use is registered to you; ask your class advisor to reset it if you change phones.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="4–6 digits"
            className="h-9 w-36 px-3 rounded-md border border-input text-[14px] tracking-widest focus:outline-none focus:border-licet-violet" />
          <button onClick={savePin} disabled={pin.length < 4} className="h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">Save PIN</button>
          <span className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground ml-auto"><Smartphone className="w-4 h-4" /> {device ? `Phone registered on ${new Date(device).toLocaleDateString('en-IN')}` : 'No phone registered yet'}</span>
        </div>
      </div>
    </div>
  )
}
