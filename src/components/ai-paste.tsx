"use client"

// "Paste anything (AI)": turns a pasted list (e-mail, PDF copy, messy sheet) into rows with
// the given columns. The rows go into the normal review screen — nothing is saved here.

import { useState } from "react"
import { Sparkles, Loader2, X } from "lucide-react"
import { getAccessToken } from "@/lib/auth"
import { toast } from "@/components/toaster"
import { Portal } from "@/components/ui/portal"

export function AiPaste({ columns, hint, onRows, label = 'Paste anything (AI)' }: {
  columns: string[]; hint?: string; onRows: (rows: Record<string, string>[]) => void; label?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/assistant/structure', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await getAccessToken() ?? ''}` }, body: JSON.stringify({ columns, text, hint }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(j.rows)) { toast.error(j.error ?? 'Could not read that text'); setBusy(false); return }
      if (!j.rows.length) { toast.error('No rows found in that text'); setBusy(false); return }
      onRows(j.rows); setOpen(false); setText('')
      toast.info(`${j.rows.length} row${j.rows.length === 1 ? '' : 's'} read by AI — check them before saving`)
    } catch { toast.error('Could not reach the assistant') }
    setBusy(false)
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-licet-gold bg-licet-cream/50 text-licet-indigo text-[13px] font-semibold hover:bg-licet-cream">
        <Sparkles className="w-3.5 h-3.5" /> {label}
      </button>
      {open && (
        <Portal>
        <div className="fixed inset-0 z-[85] bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="font-semibold text-licet-indigo">Paste the list — AI arranges it</h2><button onClick={() => setOpen(false)} disabled={busy} className="p-1"><X className="w-4 h-4" /></button></div>
            <p className="text-[12.5px] text-muted-foreground">Copy from an e-mail, a PDF, WhatsApp or any sheet. It becomes these columns: <b>{columns.join(', ')}</b>. You will see every row before anything is saved.</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={12} className="w-full px-3 py-2 rounded-md border border-input text-[12.5px] font-mono" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="h-9 px-4 rounded-md border border-border text-[13px]">Cancel</button>
              <button onClick={go} disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Arrange</button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  )
}
