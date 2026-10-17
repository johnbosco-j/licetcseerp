"use client"

// Student side of the 7-day objection window: published internal marks of the student's
// courses, an objection form while the window is open, and the answers received.

import { useEffect, useState } from "react"
import { Loader2, MessageSquareWarning } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"

type Pub = { subject_id: string; exam_type: string; published_at: string; objection_until: string }
type Obj = { id: string; subject_id: string; exam_type: string; reason: string; status: string; response: string | null }
type Course = { id: string; code: string; name: string }

const label = (t: string) => t.replace('SEM_END', 'Semester-end').replace(/_/g, ' ')

export function MyMarkObjections({ courses, myMarks }: { courses: Course[]; myMarks: Record<string, Record<string, number>> }) {
  const [pubs, setPubs] = useState<Pub[]>([])
  const [objs, setObjs] = useState<Obj[]>([])
  const [now, setNow] = useState(0)
  const [form, setForm] = useState<{ key: string; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const ids = courses.map(c => c.id).join(',')

  useEffect(() => {
    if (!ids) return
    let off = false
    const list = ids.split(',')
    Promise.all([
      supabase.from('marks_publications').select('subject_id, exam_type, published_at, objection_until').in('subject_id', list),
      supabase.from('mark_objections').select('id, subject_id, exam_type, reason, status, response').in('subject_id', list),
    ]).then(([p, o]) => { if (!off) { setPubs((p.data ?? []) as Pub[]); setObjs((o.data ?? []) as Obj[]); setNow(Date.now()) } })
    return () => { off = true }
  }, [ids, version])

  const mine = pubs.filter(p => myMarks[p.subject_id]?.[p.exam_type] !== undefined)
  if (!mine.length && !objs.length) return null
  const course = (id: string) => courses.find(c => c.id === id)

  const submit = async (p: Pub) => {
    if (!form || form.reason.trim().length < 5) return
    setBusy(true)
    const { error } = await supabase.from('mark_objections').insert({ subject_id: p.subject_id, exam_type: p.exam_type, reason: form.reason.trim() })
    setBusy(false)
    if (reportResult(error, 'Objection sent to the course teacher')) { setForm(null); setVersion(v => v + 1) }
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
        <span className="eyebrow">Published internal marks</span>
        <h2 className="font-serif text-[19px] font-semibold text-licet-indigo mt-1">Objections</h2>
        <p className="text-[12.5px] text-muted-foreground mt-1">If a published mark looks wrong, object within the window shown. Your teacher answers here.</p>
      </div>
      <ul className="divide-y divide-border text-[13px]">
        {mine.map(p => {
          const key = `${p.subject_id}|${p.exam_type}`
          const o = objs.find(x => x.subject_id === p.subject_id && x.exam_type === p.exam_type)
          const open = Date.parse(p.objection_until) > now
          const c = course(p.subject_id)
          return (
            <li key={key} className="px-6 py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1"><b>{c?.code}</b> {label(p.exam_type)} · <span className="tabular-nums">{myMarks[p.subject_id][p.exam_type]}</span></span>
                {o ? <span className={`text-[12px] font-semibold ${o.status === 'PENDING' ? 'text-amber-700' : o.status === 'ACCEPTED' ? 'text-green-800' : 'text-muted-foreground'}`}>objection {o.status.toLowerCase()}</span>
                  : open ? <button onClick={() => setForm({ key, reason: '' })} className="inline-flex items-center gap-1 text-[12.5px] text-licet-violet hover:underline"><MessageSquareWarning className="w-3.5 h-3.5" /> Object (until {new Date(p.objection_until).toLocaleDateString('en-IN')})</button>
                  : <span className="text-[12px] text-muted-foreground">objection window closed</span>}
              </div>
              {o?.response && <p className="text-muted-foreground">Teacher: {o.response}</p>}
              {form?.key === key && (
                <div className="flex flex-wrap gap-2">
                  <input value={form.reason} onChange={e => setForm({ key, reason: e.target.value })} placeholder="What is wrong? e.g. question 3 was not counted" className="flex-1 min-w-[220px] h-9 px-2 rounded-md border border-input text-[13px]" />
                  <button onClick={() => submit(p)} disabled={busy || form.reason.trim().length < 5} className="h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}</button>
                  <button onClick={() => setForm(null)} className="h-9 px-3 rounded-md border border-border text-[13px]">Cancel</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
