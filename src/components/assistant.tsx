"use client"

// "Ask LICET AI" — the in-app assistant for every role (answers from the ERP with the
// person's own access; it never changes data). Hidden when the HOD switches it off.

import { useEffect, useRef, useState } from "react"
import { Sparkles, X, Send, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getAccessToken } from "@/lib/auth"

type M = { role: 'user' | 'assistant'; content: string }
const QUICK: Record<string, string[]> = {
  STUDENT: ['What is my attendance and how many hours do I need?', 'What is my timetable today?', 'How do I request condonation?'],
  STAFF: ['Which students in my class are below 75%?', 'Which hours were not recorded this week?', 'How do I hand over my class to a colleague?'],
  HOD: ['Which classes are below 80% this term?', 'Which teachers have hours not recorded?', 'How do I start the next term?'],
}

export function Assistant({ role }: { role: 'STUDENT' | 'STAFF' | 'HOD' }) {
  const [on, setOn] = useState(false)
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<M[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'ai.enabled').maybeSingle()
      .then(({ data }) => setOn(String(data?.value ?? 'true') !== 'false'))
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const next = [...msgs, { role: 'user' as const, content: question }]
    setMsgs(next); setText(''); setBusy(true)
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await getAccessToken() ?? ''}` }, body: JSON.stringify({ messages: next }) })
      const j = await res.json().catch(() => ({}))
      setMsgs(m => [...m, { role: 'assistant', content: j.reply ?? `⚠ ${j.error ?? 'No answer'}` }])
    } catch { setMsgs(m => [...m, { role: 'assistant', content: '⚠ Could not reach the assistant.' }]) }
    setBusy(false)
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
        <div role="dialog" aria-label="LICET AI assistant" className="fixed bottom-4 right-4 z-[70] w-[min(400px,calc(100vw-2rem))] h-[min(560px,calc(100vh-6rem))] bg-white border border-border rounded-xl shadow-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-licet-indigo text-white rounded-t-xl">
            <Sparkles className="w-4 h-4 text-licet-gold" />
            <div className="flex-1"><p className="font-semibold text-[14px]">LICET AI</p><p className="text-[11px] text-licet-cream/80">Answers from the ERP with your access. It can be wrong — check important figures.</p></div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[13.5px]">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[13px]">Ask about attendance, timetables, marks, or how to do something in the ERP.</p>
                {QUICK[role].map(q => <button key={q} onClick={() => ask(q)} className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:border-licet-gold hover:bg-licet-cream/40 text-[13px]">{q}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[92%] px-3 py-2 rounded-lg whitespace-pre-wrap break-words ${m.role === 'user' ? 'ml-auto bg-licet-indigo text-white' : 'bg-licet-paper border border-border'}`}>{m.content}</div>
            ))}
            {busy && <div className="inline-flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Looking it up…</div>}
            <div ref={end} />
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(text) }} className="p-2 border-t border-border flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask a question…" maxLength={2000}
              className="flex-1 h-10 px-3 rounded-md border border-input text-[13.5px] focus:outline-none focus:border-licet-violet" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="h-10 w-10 inline-flex items-center justify-center rounded-md bg-licet-indigo text-white disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
    </>
  )
}
