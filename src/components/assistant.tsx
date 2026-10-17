"use client"

// "Ask LICET AI" — the in-app assistant for every role. It answers with the person's own
// access, and drafts changes (marks, attendance, notices, leave …) that are saved only when
// the person presses Confirm. Staff can attach files. Hidden when the HOD switches it off.

import { useEffect, useRef, useState } from "react"
import { Sparkles, X, Send, Loader2, Paperclip, FileText, Check, Maximize2, Minimize2, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getAccessToken } from "@/lib/auth"
import { notifyClassHandover } from "@/lib/send-notification"

type File64 = { name: string; type: string; data: string; size: number }
type Proposal = { kind: string; title: string; summary: string; lines: string[]; warnings: string[]; token: string
  state?: 'open' | 'busy' | 'done' | 'cancelled' | 'failed'; result?: string }
type M = { role: 'user' | 'assistant'; content: string; files?: File64[]; proposals?: Proposal[] }

const ACCEPT = '.xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.md,.json,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif'
const MAX_BYTES = 2_500_000
const SEND_BUDGET = 3_300_000   // base64 characters of files per request (server limit ~4.5 MB)

const QUICK: Record<string, string[]> = {
  STUDENT: ['What is my attendance and how many hours do I need?', 'What is my timetable today?', 'Apply for medical leave tomorrow', 'How do I request condonation?'],
  STAFF: ['Which students in my class are below 75%?', 'Mark 24CS005 and 24CS017 absent for my class now', 'Attach a marks sheet and enter CIA 1 marks', 'Hand over my class tomorrow to a colleague'],
  HOD: ['Which classes are below 80% this term?', 'Which teachers have hours not recorded this week?', 'Attach a student list and add the accounts', 'Declare next Friday a holiday'],
}

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] ?? '')
  r.onerror = () => bad(r.error)
  r.readAsDataURL(f)
})

export function Assistant({ role }: { role: 'STUDENT' | 'STAFF' | 'HOD' }) {
  const [on, setOn] = useState(false)
  const [open, setOpen] = useState(false)
  const [big, setBig] = useState(false)
  const [msgs, setMsgs] = useState<M[]>([])
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File64[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const staff = role !== 'STUDENT'

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'ai.enabled').maybeSingle()
      .then(({ data }) => setOn(String(data?.value ?? 'true') !== 'false'))
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const attach = async (list: FileList | null) => {
    setNote('')
    for (const f of Array.from(list ?? []).slice(0, 3 - files.length)) {
      if (f.size > MAX_BYTES) { setNote(`${f.name} is larger than 2.5 MB — attach one sheet or a smaller file.`); continue }
      try { const data = await toBase64(f); setFiles(x => [...x, { name: f.name, type: f.type, data, size: f.size }]) }
      catch { setNote(`Could not read ${f.name}`) }
    }
    if (picker.current) picker.current.value = ''
  }

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await getAccessToken() ?? ''}` }, body: JSON.stringify(body) })
    return { ok: res.ok, j: await res.json().catch(() => ({})) as Record<string, unknown> }
  }

  const ask = async (q: string) => {
    const question = q.trim()
    if ((!question && !files.length) || busy) return
    const next: M[] = [...msgs, { role: 'user', content: question, files: files.length ? files : undefined }]
    setMsgs(next); setText(''); setFiles([]); setBusy(true)
    // newest files first until the request budget is used; older attachments are left out
    let budget = SEND_BUDGET
    const wire = [...next].reverse().map(m => {
      const keep = (m.files ?? []).filter(f => (budget -= f.data.length) >= 0)
      return { role: m.role, content: m.content, ...(keep.length ? { files: keep.map(({ name, type, data }) => ({ name, type, data })) } : {}) }
    }).reverse()
    try {
      const { j } = await post('/api/assistant', { messages: wire })
      const proposals = (Array.isArray(j.proposals) ? j.proposals : []).map(p => ({ ...(p as Proposal), state: 'open' as const }))
      setMsgs(m => [...m, { role: 'assistant', content: typeof j.reply === 'string' ? j.reply : `⚠ ${j.error ?? 'No answer'}`, proposals: proposals.length ? proposals : undefined }])
    } catch { setMsgs(m => [...m, { role: 'assistant', content: '⚠ Could not reach the assistant.' }]) }
    setBusy(false)
  }

  const setProposal = (mi: number, pi: number, patch: Partial<Proposal>) =>
    setMsgs(all => all.map((m, i) => i !== mi ? m : { ...m, proposals: m.proposals?.map((p, k) => k === pi ? { ...p, ...patch } : p) }))

  const confirm = async (mi: number, pi: number) => {
    const p = msgs[mi].proposals?.[pi]; if (!p) return
    setProposal(mi, pi, { state: 'busy' })
    try {
      const { ok, j } = await post('/api/assistant/act', { token: p.token })
      if (!ok) { setProposal(mi, pi, { state: 'failed', result: String(j.error ?? 'Could not save') }); return }
      const n = j.notify as { kind: string; to_email: string; to_name: string; course: string; from: string; until: string; note?: string } | undefined
      if (n?.kind === 'handover') {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: me } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).single() : { data: null }
        notifyClassHandover(n.to_email, n.to_name, me?.full_name ?? 'A colleague', n.course, n.from, n.until, n.note)
      }
      setProposal(mi, pi, { state: 'done', result: String(j.message ?? 'Saved') })
      // let the assistant know in later turns what was actually saved
      setMsgs(all => [...all, { role: 'assistant', content: `✓ Confirmed: ${p.title} — ${String(j.message ?? 'saved')}` }])
    } catch { setProposal(mi, pi, { state: 'failed', result: 'Could not reach the server' }) }
  }

  if (!on) return null
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask LICET AI"
          className="fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 h-11 px-4 rounded-full bg-licet-indigo text-white text-[13.5px] font-semibold shadow-lg hover:bg-licet-violet">
          <Sparkles className="w-4 h-4 text-licet-gold" /> Ask AI
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="LICET AI assistant"
          className={`fixed bottom-4 right-4 z-[70] bg-white border border-border rounded-xl shadow-2xl flex flex-col ${big ? 'w-[min(760px,calc(100vw-2rem))] h-[calc(100vh-5rem)]' : 'w-[min(420px,calc(100vw-2rem))] h-[min(600px,calc(100vh-6rem))]'}`}>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-licet-indigo text-white rounded-t-xl">
            <Sparkles className="w-4 h-4 text-licet-gold" />
            <div className="flex-1 min-w-0"><p className="font-semibold text-[14px]">LICET AI</p><p className="text-[11px] text-licet-cream/80">Uses your access. Drafts are saved only when you press Confirm — check them first.</p></div>
            <button onClick={() => setBig(b => !b)} aria-label={big ? 'Smaller' : 'Larger'} className="p-1 rounded hover:bg-white/10 hidden sm:block">{big ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[13.5px]">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[13px]">Ask about attendance, timetables, marks or how to do something — or ask it to do it{staff ? '; attach a sheet, Word file, PDF or photo to fill things in' : ''}.</p>
                {QUICK[role].map(q => <button key={q} onClick={() => ask(q)} className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:border-licet-gold hover:bg-licet-cream/40 text-[13px]">{q}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[94%] ${m.role === 'user' ? 'ml-auto' : ''}`}>
                <div className={`px-3 py-2 rounded-lg whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-licet-indigo text-white' : 'bg-licet-paper border border-border'}`}>
                  {m.files?.map(f => <div key={f.name} className="flex items-center gap-1.5 text-[12px] opacity-90 mb-1"><FileText className="w-3.5 h-3.5" />{f.name}</div>)}
                  {m.content}
                </div>
                {m.proposals?.map((p, k) => (
                  <div key={k} className="mt-2 border border-licet-gold rounded-lg bg-licet-cream/30 p-3 space-y-2">
                    <div><p className="font-semibold text-licet-indigo text-[13.5px]">{p.title}</p><p className="text-[12.5px] text-muted-foreground">{p.summary}</p></div>
                    {!!p.lines.length && (
                      <div className="max-h-48 overflow-y-auto bg-white border border-border rounded p-2 text-[12px] font-mono leading-5">
                        {p.lines.map((l, n) => <div key={n} className="whitespace-pre-wrap">{l}</div>)}
                      </div>
                    )}
                    {p.warnings.map((w, n) => <p key={n} className="flex gap-1.5 text-[12px] text-amber-800"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</p>)}
                    {p.state === 'open' && (
                      <div className="flex gap-2">
                        <button onClick={() => confirm(i, k)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-licet-indigo text-white text-[12.5px] font-semibold"><Check className="w-3.5 h-3.5" /> Confirm</button>
                        <button onClick={() => setProposal(i, k, { state: 'cancelled' })} className="h-8 px-3 rounded-md border border-border text-[12.5px]">Cancel</button>
                      </div>
                    )}
                    {p.state === 'busy' && <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</p>}
                    {p.state === 'done' && <p className="text-[12.5px] text-emerald-700 font-medium">✓ {p.result}</p>}
                    {p.state === 'failed' && <p className="text-[12.5px] text-red-700">Not saved: {p.result}</p>}
                    {p.state === 'cancelled' && <p className="text-[12.5px] text-muted-foreground">Cancelled — nothing was saved.</p>}
                  </div>
                ))}
              </div>
            ))}
            {busy && <div className="inline-flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Working on it…</div>}
            <div ref={end} />
          </div>
          {(files.length > 0 || note) && (
            <div className="px-3 pt-2 flex flex-wrap gap-1.5">
              {files.map(f => (
                <span key={f.name} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full bg-licet-cream/60 border border-licet-gold text-[12px]">
                  <FileText className="w-3.5 h-3.5" />{f.name.length > 28 ? f.name.slice(0, 26) + '…' : f.name}
                  <button onClick={() => setFiles(x => x.filter(y => y !== f))} aria-label={`Remove ${f.name}`} className="p-0.5 rounded-full hover:bg-black/10"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {note && <p className="text-[12px] text-red-700 w-full">{note}</p>}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); ask(text) }} className="p-2 border-t border-border flex gap-2 mt-2">
            {staff && (
              <>
                <input ref={picker} type="file" accept={ACCEPT} multiple className="hidden" onChange={e => attach(e.target.files)} />
                <button type="button" onClick={() => picker.current?.click()} disabled={busy || files.length >= 3} aria-label="Attach a file" title="Attach Excel, CSV, Word, PDF or a picture (up to 3, 2.5 MB each)"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-border text-licet-indigo disabled:opacity-40"><Paperclip className="w-4 h-4" /></button>
              </>
            )}
            <input value={text} onChange={e => setText(e.target.value)} placeholder={staff ? 'Ask, or tell it what to fill in…' : 'Ask a question…'} maxLength={4000}
              className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input text-[13.5px] focus:outline-none focus:border-licet-violet" />
            <button type="submit" disabled={busy || (!text.trim() && !files.length)} aria-label="Send" className="h-10 w-10 inline-flex items-center justify-center rounded-md bg-licet-indigo text-white disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
    </>
  )
}
