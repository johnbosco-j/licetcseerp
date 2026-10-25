"use client"

import { useCallback, useEffect, useState } from "react"
import { UserPlus, X, Trash2, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult } from "@/components/toaster"
import { notifyClassHandover } from "@/lib/send-notification"
import { isoToday } from "@/lib/academic"
import { Portal } from "@/components/ui/portal"

export interface Delegation {
  id: string; from_faculty: string; to_faculty: string; subject_id: string | null
  valid_from: string; valid_to: string; note: string | null
}
type Staff = { id: string; full_name: string; email: string | null }
type Course = { id: string; code: string; short_name: string | null; name: string; section: string | null }

/** Delegations that let *me* take someone's class on a date. */
export async function loadDelegationsToMe(me: string, date: string): Promise<Delegation[]> {
  const { data } = await supabase.from('attendance_delegations').select('*').eq('to_faculty', me).lte('valid_from', date).gte('valid_to', date)
  return (data ?? []) as Delegation[]
}

/** The instructor hands a class (or all their classes) to a colleague for a few days. */
export function DelegationsButton({ me, termId }: { me: string; termId: string }) {
  const [open, setOpen] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [mine, setMine] = useState<Delegation[]>([])
  const [form, setForm] = useState({ to: '', subject: '', from: isoToday(), until: isoToday(), note: '' })
  const [busy, setBusy] = useState(false)

  const [ids, setIds] = useState<string[]>([me])   // + the HOD in person on the HOD office account
  const load = useCallback(async () => {
    const { data: t } = await supabase.rpc('my_teaching_ids')
    const teach = ((t ?? [me]) as string[]).filter(Boolean)
    setIds(teach)
    const [st, links, dl] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').neq('role', 'STUDENT').eq('is_active', true).neq('id', me).order('full_name'),
      supabase.from('subject_faculty').select('subject_id, subjects(id, code, short_name, name, section, term_id)').in('faculty_id', teach),
      supabase.from('attendance_delegations').select('*').in('from_faculty', teach).gte('valid_to', isoToday()).order('valid_from'),
    ])
    setStaff((st.data ?? []) as Staff[])
    type Link = { subjects: (Course & { term_id: string }) | null }
    setCourses(((links.data ?? []) as unknown as Link[]).map(l => l.subjects).filter((c, i, all): c is Course & { term_id: string } => !!c && c.term_id === termId && all.findIndex(x => x?.id === c.id) === i))
    setMine((dl.data ?? []) as Delegation[])
  }, [me, termId])
  useEffect(() => { if (open) load() }, [open, load])

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('attendance_delegations').insert({
      // the HOD office account hands over the classes of the HOD in person
      from_faculty: ids[ids.length - 1] ?? me, to_faculty: form.to, subject_id: form.subject || null, valid_from: form.from, valid_to: form.until, note: form.note || null,
    })
    setBusy(false)
    if (reportResult(error, 'Class handed over — your colleague now sees it under My classes and gets an email')) {
      const sub = staff.find(s => s.id === form.to)
      if (sub?.email) {
        const { data: mine } = await supabase.from('profiles').select('full_name').eq('id', me).single()
        notifyClassHandover(sub.email, sub.full_name, mine?.full_name ?? 'A colleague', course(form.subject || null), form.from, form.until, form.note || undefined)
      }
      setForm(f => ({ ...f, to: '', note: '' })); load()
    }
  }
  const remove = async (id: string) => {
    const { error } = await supabase.from('attendance_delegations').delete().eq('id', id)
    if (reportResult(error, 'Hand-over cancelled')) load()
  }
  const name = (id: string) => staff.find(s => s.id === id)?.full_name ?? 'colleague'
  const course = (id: string | null) => { const c = courses.find(x => x.id === id); return c ? `${c.short_name || c.code}${c.section ? ` (${c.section})` : ' (combined)'}` : 'All my classes' }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-[13px] font-semibold hover:bg-muted">
        <UserPlus className="w-4 h-4" /> Hand over my class
      </button>
      {open && (
        <Portal>
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div><p className="eyebrow">Substitution</p><h2 className="font-display text-xl font-bold text-licet-indigo mt-1">Hand over my class</h2></div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-[13px]">
              <p className="text-muted-foreground">Only you (the course instructor), the class advisor or the HOD can take your class. Hand it to a colleague here when you are on leave or on duty — for up to 31 days.</p>
              <label className="block text-muted-foreground">Colleague
                <select value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input bg-white text-foreground">
                  <option value="">Choose…</option>{staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </label>
              <label className="block text-muted-foreground">Class
                <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input bg-white text-foreground">
                  <option value="">All my classes</option>{courses.map(c => <option key={c.id} value={c.id}>{c.short_name || c.code} — {c.name} {c.section ? `(${c.section})` : '(combined)'}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-muted-foreground">From<input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-foreground" /></label>
                <label className="text-muted-foreground">Until<input type="date" value={form.until} min={form.from} onChange={e => setForm({ ...form, until: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-foreground" /></label>
              </div>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Note (optional), e.g. on OD for workshop" className="w-full h-9 px-2 rounded-md border border-input" />
              <div className="flex justify-end"><button onClick={save} disabled={busy || !form.to} className="h-9 px-4 rounded-md bg-licet-indigo text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Hand over</button></div>
              {mine.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="eyebrow mb-1.5">Current hand-overs</p>
                  {mine.map(d => (
                    <div key={d.id} className="flex items-center gap-2 py-1">
                      <span className="flex-1">{course(d.subject_id)} → <b>{name(d.to_faculty)}</b> · {d.valid_from}{d.valid_to !== d.valid_from ? ` to ${d.valid_to}` : ''}</span>
                      <button onClick={() => remove(d.id)} className="text-red-700 hover:underline inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> cancel</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  )
}
