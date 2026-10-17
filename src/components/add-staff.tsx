"use client"

// HOD: create faculty accounts — one at a time or a pasted list ("Name, email[, department]"
// per line). Default password licet@<name>, shown once, changed at first sign-in.

import { useState } from "react"
import { Loader2, UserPlus, Download } from "lucide-react"
import { getAccessToken } from "@/lib/auth"
import { createStaffAdmin, type StaffRowResult } from "@/app/actions"
import { toast } from "@/components/toaster"
import { parseStaffList } from "@/lib/staff-list"
import { AiPaste } from "@/components/ai-paste"

export function AddStaff({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<StaffRowResult[] | null>(null)
  const rows = parseStaffList(text)

  const create = async () => {
    setBusy(true)
    const token = await getAccessToken()
    const r = await createStaffAdmin(token ?? '', rows)
    setBusy(false)
    if (r.error) { toast.error(r.error); return }
    setResults(r.results ?? [])
    const made = (r.results ?? []).filter(x => x.ok).length
    if (made) { toast.success(`${made} staff account${made === 1 ? '' : 's'} created`); setText(''); onDone() }
  }
  const download = () => {
    const csv = 'name,email,default password\n' + (results ?? []).filter(r => r.ok).map(r => `"${r.full_name}",${r.email},${r.password}`).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'new-staff-passwords.csv'; a.click()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-licet-violet" /><h2 className="font-semibold text-licet-indigo">Add staff</h2></div>
      <p className="text-[12.5px] text-muted-foreground">One per line: <code>Name, email</code> — add <code>, ECE</code> (or another department) for faculty of other departments who teach CSE classes. They sign in with <code>licet@</code> + their name in lower case (e.g. <code>licet@kavitha</code>) and must change it. Courses printed with their name are linked automatically.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder={'Dr. Kavitha G, kavitha@licet.ac.in, S&H\nMs. Minna Fathima, minnafathima@licet.ac.in'}
        className="w-full px-3 py-2 rounded-md border border-input text-[13px] font-mono focus:outline-none focus:border-licet-violet" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={create} disabled={busy || !rows.length} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create {rows.length || ''} account{rows.length === 1 ? '' : 's'}
        </button>
        <AiPaste columns={['Name', 'Email', 'Department']} hint="Faculty of LICET; emails end with @licet.ac.in; Department empty for CSE"
          onRows={rs => setText(rs.map(r => [r.Name, r.Email, r.Department].filter(Boolean).join(', ')).join('\n'))} />
        {rows.length > 0 && <span className="text-[12px] text-muted-foreground">{rows.map(r => r.full_name || r.email).slice(0, 4).join(', ')}{rows.length > 4 ? '…' : ''}</span>}
      </div>
      {results && (
        <div className="rounded-md border border-border text-[12.5px]">
          <ul className="divide-y divide-border">{results.map(r => (
            <li key={r.email} className="px-3 py-1.5 flex flex-wrap gap-2 justify-between">
              <span>{r.full_name} <span className="text-muted-foreground">{r.email}</span></span>
              {r.ok ? <span className="font-mono">{r.password}</span> : <span className="text-red-700">{r.error}</span>}
            </li>))}</ul>
          {results.some(r => r.ok) && <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Passwords are shown only now — download or note them.</span>
            <button onClick={download} className="inline-flex items-center gap-1 text-licet-violet font-semibold"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>}
        </div>
      )}
    </div>
  )
}
