"use client"

import { useCallback, useEffect, useState } from "react"
import { FileText, Loader2, Check, X, Upload, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { type Term, isoToday } from "@/lib/academic"

export interface Condonation {
  id: string; student_id: string; term_id: string; reason_kind: 'MEDICAL' | 'SPORTS'; from_date: string; to_date: string
  details: string; document_path: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  requested_by: string; requested_at: string; advisor_note: string | null; decided_at: string | null; decision_note: string | null
}
type Student = { id: string; full_name: string; register_number: string | null; section: string | null }

const STATUS_CLS: Record<string, string> = {
  PENDING: 'text-amber-800 bg-amber-50 border-amber-200', APPROVED: 'text-green-800 bg-green-50 border-green-200',
  REJECTED: 'text-red-800 bg-red-50 border-red-200', WITHDRAWN: 'text-muted-foreground bg-muted/40 border-border',
}

async function openDocument(path: string) {
  const { data, error } = await supabase.storage.from('condonation-docs').createSignedUrl(path, 120)
  if (error || !data) { toast.error(error?.message ?? 'Could not open the document'); return }
  window.open(data.signedUrl, '_blank', 'noopener')
}

/** Regulation 7.2: medical / sports reasons, documents submitted on returning. */
export function CondonationForm({ studentId, term, onDone, compact }: { studentId: string; term: Term; onDone: () => void; compact?: boolean }) {
  const [f, setF] = useState({ kind: 'MEDICAL', from: isoToday(), to: isoToday(), details: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (f.details.trim().length < 10) { toast.error('Describe the reason (at least a sentence)'); return }
    if (!file) { toast.error('Attach the medical certificate or sports participation letter (PDF or photo)'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('The document must be under 10 MB'); return }
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${studentId}/${term.id}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('condonation-docs').upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) { setBusy(false); toast.error(up.error.message); return }
    const { data: me } = await supabase.auth.getUser()
    const { error } = await supabase.from('attendance_condonations').insert({
      student_id: studentId, term_id: term.id, reason_kind: f.kind, from_date: f.from, to_date: f.to,
      details: f.details.trim(), document_path: path, requested_by: me.user?.id,
    })
    setBusy(false)
    if (reportResult(error, 'Request submitted to the HOD through the class advisor')) { setF({ ...f, details: '' }); setFile(null); onDone() }
  }
  return (
    <div className={`space-y-2 text-[13px] ${compact ? '' : 'rounded-lg border border-border bg-white p-4'}`}>
      {!compact && <p className="eyebrow">Request condonation</p>}
      <p className="text-muted-foreground text-[12.5px]">Only for medical reasons (hospitalisation, accident, specific illness) or participation in sports events, with documents submitted when you return (Regulation 7.2). Below 65% attendance condonation is not possible.</p>
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-muted-foreground text-[12px]">Reason
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input bg-white text-foreground"><option value="MEDICAL">Medical</option><option value="SPORTS">Sports</option></select>
        </label>
        <label className="text-muted-foreground text-[12px]">From<input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-foreground" /></label>
        <label className="text-muted-foreground text-[12px]">To<input type="date" value={f.to} min={f.from} onChange={e => setF({ ...f, to: e.target.value })} className="mt-0.5 w-full h-9 px-2 rounded-md border border-input text-foreground" /></label>
      </div>
      <textarea value={f.details} onChange={e => setF({ ...f, details: e.target.value })} rows={2} placeholder="What happened (hospital, event name, dates)…" className="w-full px-2 py-1.5 rounded-md border border-input" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white cursor-pointer hover:bg-muted">
          <Upload className="w-4 h-4" /> {file ? file.name.slice(0, 30) : 'Attach document'}
          <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={submit} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-licet-indigo text-white font-semibold disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Submit request</button>
      </div>
    </div>
  )
}

/** A student's own requests (student view). */
export function MyCondonations({ studentId, term }: { studentId: string; term: Term }) {
  const [rows, setRows] = useState<Condonation[]>([])
  const load = useCallback(() => {
    supabase.from('attendance_condonations').select('*').eq('student_id', studentId).eq('term_id', term.id).order('requested_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Condonation[]))
  }, [studentId, term.id])
  useEffect(() => { load() }, [load])
  const withdraw = async (id: string) => {
    const { error } = await supabase.from('attendance_condonations').update({ status: 'WITHDRAWN' }).eq('id', id)
    if (reportResult(error, 'Request withdrawn')) load()
  }
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="rounded-lg border border-border bg-white divide-y divide-border">
          {rows.map(r => (
            <div key={r.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 text-[13px]">
              <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${STATUS_CLS[r.status]}`}>{r.status.toLowerCase()}</span>
              <span className="font-medium">{r.reason_kind === 'MEDICAL' ? 'Medical' : 'Sports'} · {r.from_date}{r.to_date !== r.from_date ? ` to ${r.to_date}` : ''}</span>
              <span className="text-muted-foreground flex-1 min-w-[160px] truncate">{r.decision_note ?? r.details}</span>
              {r.status === 'PENDING' && <button onClick={() => withdraw(r.id)} className="text-[12px] text-red-700 hover:underline">withdraw</button>}
            </div>
          ))}
        </div>
      )}
      <CondonationForm studentId={studentId} term={term} onDone={load} />
    </div>
  )
}

/** Staff tab: advisors see their class, the HOD sees all and decides. */
export function CondonationDesk({ term, isHod }: { term: Term; isHod: boolean }) {
  const [rows, setRows] = useState<(Condonation & { profiles?: Student | null })[]>([])
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Student[]>([])
  const [forStudent, setForStudent] = useState<Student | null>(null)

  const load = useCallback(async () => {
    let query = supabase.from('attendance_condonations').select('*, profiles!attendance_condonations_student_id_fkey(id, full_name, register_number, section)').eq('term_id', term.id).order('requested_at', { ascending: false })
    if (filter === 'PENDING') query = query.eq('status', 'PENDING')
    const { data, error } = await query
    if (error) toast.error(error.message)
    setRows((data ?? []) as typeof rows)
  }, [term.id, filter])
  useEffect(() => { load() }, [load])

  const search = async (v: string) => {
    setQ(v)
    if (v.trim().length < 3) { setFound([]); return }
    const t = v.trim()
    const { data } = await supabase.from('profiles').select('id, full_name, register_number, section').eq('role', 'STUDENT').eq('is_active', true)
      .or(`full_name.ilike.%${t.replace(/[%,()]/g, '')}%,register_number.ilike.%${t.replace(/[%,()]/g, '')}%`).limit(8)
    setFound((data ?? []) as Student[])
  }
  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    const { error } = await supabase.rpc('att_decide_condonation', { p_id: id, p_approve: approve, p_note: notes[id] || null })
    setBusy('')
    if (reportResult(error, approve ? 'Approved — the student is permitted to write the SEE if 65–74%' : 'Rejected')) load()
  }
  const saveNote = async (id: string) => {
    const { error } = await supabase.from('attendance_condonations').update({ advisor_note: notes[id] || null }).eq('id', id)
    if (reportResult(error, 'Advisor note saved')) load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-[13px]">
          <button onClick={() => setFilter('PENDING')} className={`px-3 h-9 ${filter === 'PENDING' ? 'bg-licet-indigo text-white' : 'bg-white'}`}>Pending</button>
          <button onClick={() => setFilter('ALL')} className={`px-3 h-9 ${filter === 'ALL' ? 'bg-licet-indigo text-white' : 'bg-white'}`}>All this term</button>
        </div>
        <div className="relative ml-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Raise for a student (name / reg no)" className="h-9 pl-8 pr-2 w-72 rounded-md border border-input text-[13px]" />
          {found.length > 0 && (
            <div className="absolute z-20 right-0 mt-1 w-72 bg-white border border-border rounded-md shadow-lg">
              {found.map(s => <button key={s.id} onClick={() => { setForStudent(s); setFound([]); setQ('') }} className="block w-full text-left px-3 py-1.5 text-[13px] hover:bg-muted">{s.full_name} <span className="text-muted-foreground text-[11.5px]">{s.register_number} · {s.section}</span></button>)}
            </div>
          )}
        </div>
      </div>
      {forStudent && (
        <div className="rounded-lg border border-licet-gold bg-licet-cream/30 p-4">
          <div className="flex items-center justify-between mb-1"><p className="font-semibold text-[13.5px]">For {forStudent.full_name} ({forStudent.section})</p><button onClick={() => setForStudent(null)}><X className="w-4 h-4" /></button></div>
          <CondonationForm compact studentId={forStudent.id} term={term} onDone={() => { setForStudent(null); load() }} />
        </div>
      )}
      <div className="rounded-lg border border-border bg-white divide-y divide-border">
        {rows.map(r => (
          <div key={r.id} className="px-4 py-3 space-y-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${STATUS_CLS[r.status]}`}>{r.status.toLowerCase()}</span>
              <b>{r.profiles?.full_name ?? 'Student'}</b><span className="text-muted-foreground">{r.profiles?.register_number} · {r.profiles?.section}</span>
              <span className="ml-auto text-muted-foreground">{r.reason_kind === 'MEDICAL' ? 'Medical' : 'Sports'} · {r.from_date}{r.to_date !== r.from_date ? ` to ${r.to_date}` : ''}</span>
            </div>
            <p>{r.details}</p>
            {r.advisor_note && <p className="text-[12.5px] text-licet-violet">Advisor: {r.advisor_note}</p>}
            {r.decision_note && <p className="text-[12.5px] text-muted-foreground">Decision: {r.decision_note}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {r.document_path && <button onClick={() => openDocument(r.document_path!)} className="inline-flex items-center gap-1 text-licet-violet font-semibold hover:underline"><FileText className="w-4 h-4" /> View document</button>}
              {r.status === 'PENDING' && (
                <>
                  <input value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={isHod ? 'Decision note (optional)' : 'Advisor note to the HOD'} className="flex-1 min-w-[180px] h-8 px-2 rounded-md border border-input" />
                  {!isHod && <button onClick={() => saveNote(r.id)} className="h-8 px-3 rounded-md border border-border font-semibold hover:bg-muted">Save note</button>}
                  {isHod && <>
                    <button onClick={() => decide(r.id, true)} disabled={busy === r.id} className="h-8 px-3 rounded-md bg-green-700 text-white font-semibold inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-4 h-4" /> Approve</button>
                    <button onClick={() => decide(r.id, false)} disabled={busy === r.id} className="h-8 px-3 rounded-md bg-red-700 text-white font-semibold inline-flex items-center gap-1 disabled:opacity-50"><X className="w-4 h-4" /> Reject</button>
                  </>}
                </>
              )}
            </div>
          </div>
        ))}
        {!rows.length && <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">{filter === 'PENDING' ? 'No pending requests.' : 'No requests this term.'}</p>}
      </div>
    </div>
  )
}
