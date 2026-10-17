"use client"

// Internal-assessment marks from an Excel sheet, one course at a time, reviewed before
// anything is saved. The sheet only needs a register / roll number column; every other
// column can be mapped to a marks component (the guess from the header can be changed).

import { useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { Loader2, FileSpreadsheet, X, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { COMPONENT_MAX, COMPONENT_NAMES as NAMES, guessComponent } from "@/lib/marks-columns"
import { AiPaste } from "@/components/ai-paste"

type Student = { id: string; full_name: string; register_number: string | null; roll_number: string | null }

const AI_COLS = ['Register number', 'Name', 'CIA 1 class test', 'CIA 1 CAT', 'CIA 1 activity', 'CIA 2 class test', 'CIA 2 CAT', 'CIA 2 activity', 'Semester-end']
const toCsv = (cols: string[], rows: Record<string, string>[]) =>
  [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
const norm = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '')

export function MarksImport({ subjectId, students, onDone }: { subjectId: string; students: Student[]; onDone: () => void }) {
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [idCol, setIdCol] = useState(-1)
  const [map, setMap] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')

  const read = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer())
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' })
    // header = first row (of the first 15) that names a register / roll number column
    const hr = Math.max(0, data.slice(0, 15).findIndex(r => r.some(c => /reg|roll/i.test(String(c)))))
    const header = (data[hr] ?? []).map(String)
    setRows(data); setHeaderRow(hr); setFileName(f.name)
    setIdCol(header.findIndex(c => /reg/i.test(c)) >= 0 ? header.findIndex(c => /reg/i.test(c)) : header.findIndex(c => /roll/i.test(c)))
    setMap(Object.fromEntries(header.map((c, i) => [i, guessComponent(c)]).filter(([, v]) => v)))
  }

  const byKey = useMemo(() => {
    const m = new Map<string, Student>()
    for (const s of students) { if (s.register_number) m.set(norm(s.register_number), s); if (s.roll_number) m.set(norm(s.roll_number), s) }
    return m
  }, [students])

  const preview = useMemo(() => {
    if (!rows || idCol < 0) return null
    // one value per student and component: a student listed twice keeps the later row
    const recs = new Map<string, { student_id: string; exam_type: string; marks_obtained: number; max_marks: number }>()
    const unmatched: string[] = [], bad: string[] = [], twice = new Set<string>(), seen = new Set<string>()
    for (const r of rows.slice(headerRow + 1)) {
      const key = norm(r[idCol])
      if (!key) continue
      const s = byKey.get(key)
      if (!s) { unmatched.push(String(r[idCol])); continue }
      if (seen.has(s.id)) twice.add(s.full_name); seen.add(s.id)
      for (const [col, type] of Object.entries(map)) {
        if (!type) continue
        const raw = r[Number(col)]
        if (raw === '' || raw === null || raw === undefined) continue
        const v = Number(String(raw).trim())
        if (/^(ab|a|absent)$/i.test(String(raw).trim())) { recs.set(`${s.id}|${type}`, { student_id: s.id, exam_type: type, marks_obtained: 0, max_marks: COMPONENT_MAX[type] }); continue }
        if (!Number.isFinite(v) || v < 0 || v > COMPONENT_MAX[type]) { bad.push(`${s.full_name}: ${NAMES[type]} = ${raw}`); continue }
        recs.set(`${s.id}|${type}`, { student_id: s.id, exam_type: type, marks_obtained: Math.round(v * 100) / 100, max_marks: COMPONENT_MAX[type] })
      }
    }
    const records = [...recs.values()]
    return { records, unmatched, bad, twice: [...twice], students: new Set(records.map(r => r.student_id)).size }
  }, [rows, headerRow, idCol, map, byKey])

  const save = async () => {
    if (!preview?.records.length) return
    if (preview.bad.length && !window.confirm(`${preview.bad.length} value(s) are outside the allowed range and will be skipped. Save the rest?`)) return
    setBusy(true)
    const { data: me } = await supabase.auth.getUser()
    const { error } = await supabase.from('marks').upsert(preview.records.map(r => ({ ...r, subject_id: subjectId, faculty_id: me.user?.id })), { onConflict: 'student_id,subject_id,exam_type' })
    setBusy(false)
    if (reportResult(error, `${preview.records.length} marks imported for ${preview.students} students`)) { setRows(null); onDone() }
  }

  const header = rows ? (rows[headerRow] ?? []).map(String) : []
  return (
    <>
      <label className="flex items-center gap-2 h-9 px-3 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm cursor-pointer">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Import from Excel
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f).catch(() => toast.error('Could not read that file')) }} />
      </label>
      <AiPaste label="Paste marks (AI)" columns={AI_COLS} hint="Internal assessment marks of one course; register numbers are 12 digits; AB means absent"
        onRows={rows => read(new File([toCsv(AI_COLS, rows)], 'pasted-with-ai.csv', { type: 'text/csv' })).catch(() => toast.error('Could not read those rows'))} />
      {rows && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => setRows(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div><p className="eyebrow">Review before saving</p><h2 className="font-display text-xl font-bold text-licet-indigo mt-1">Import marks · {fileName}</h2></div>
              <button onClick={() => setRows(null)} className="p-2 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[13px]">
              <label className="flex items-center gap-2">Students are identified by column
                <select value={idCol} onChange={e => setIdCol(Number(e.target.value))} className="h-9 px-2 rounded-md border border-input bg-white">
                  <option value={-1}>— choose —</option>{header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
              <table className="w-full text-[12.5px]">
                <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-1">Column in the sheet</th><th>Goes into</th><th className="text-right">First values</th></tr></thead>
                <tbody>{header.map((h, i) => i === idCol ? null : (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-1 pr-2">{h || `Column ${i + 1}`}</td>
                    <td><select value={map[i] ?? ''} onChange={e => setMap(m => ({ ...m, [i]: e.target.value }))} className="h-8 px-1 rounded border border-input bg-white">
                      <option value="">ignore</option>{Object.keys(COMPONENT_MAX).map(k => <option key={k} value={k}>{NAMES[k]} (/{COMPONENT_MAX[k]})</option>)}</select></td>
                    <td className="text-right text-muted-foreground tabular-nums">{rows.slice(headerRow + 1, headerRow + 4).map(r => String(r[i] ?? '')).join(', ')}</td>
                  </tr>))}</tbody>
              </table>
              {preview && (
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p><b>{preview.records.length}</b> marks for <b>{preview.students}</b> of {students.length} students on the list will be saved (existing marks for these components are replaced).</p>
                  {preview.unmatched.length > 0 && <p className="text-amber-800 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {preview.unmatched.length} row(s) not on this course&apos;s list: {preview.unmatched.slice(0, 8).join(', ')}{preview.unmatched.length > 8 ? '…' : ''}</p>}
                  {preview.twice.length > 0 && <p className="text-amber-800 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Listed more than once (the lower row is used): {preview.twice.join(', ')}</p>}
                  {preview.bad.length > 0 && <p className="text-red-700 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {preview.bad.length} value(s) out of range, skipped: {preview.bad.slice(0, 5).join('; ')}{preview.bad.length > 5 ? '…' : ''}</p>}
                  <p className="text-muted-foreground text-[12px]">&ldquo;AB&rdquo; or &ldquo;Absent&rdquo; is saved as 0.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => setRows(null)} className="h-9 px-4 rounded-md border border-border text-[13px] font-semibold">Cancel</button>
              <button onClick={save} disabled={busy || !preview?.records.length} className="inline-flex items-center gap-1.5 h-9 px-5 rounded-md bg-licet-indigo text-white text-[13px] font-semibold disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save {preview?.records.length ?? 0} marks</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
