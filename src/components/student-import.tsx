"use client"

import { useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { Upload, X, Loader2, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from "lucide-react"
import { importStudentsAdmin, type NewStudent, type ImportRowResult } from "@/app/actions"
import { getAccessToken } from "@/lib/auth"
import { normalizeMobile, graduationYear } from "@/lib/utils"
import { SECTIONS } from "@/lib/dashboard"
import { toast } from "@/components/toaster"

// Bulk admission from an Excel / CSV sheet. Columns are matched by header name,
// so the order does not matter. Nothing is written until the HOD confirms.

const COLUMNS: { key: keyof NewStudent; label: string; aliases: RegExp }[] = [
  { key: "full_name",       label: "Name",            aliases: /^(full\s*)?name|student\s*name$/i },
  { key: "email",           label: "Email",           aliases: /e-?mail/i },
  { key: "section",         label: "Section",         aliases: /^(section|class)$/i },
  { key: "batch_year",      label: "Batch (graduating year)",      aliases: /batch|year\s*of\s*(joining|admission)/i },
  { key: "roll_number",     label: "Roll number",     aliases: /roll/i },
  { key: "register_number", label: "Register number", aliases: /reg(ister|istration)?\.?\s*(no|number)?/i },
  { key: "parent_mobile",   label: "Parent mobile",   aliases: /parent|guardian|father|mother/i },
]

type Parsed = NewStudent & { _row: number; _problems: string[] }
const CHUNK = 25

function normaliseSection(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ")
  const m = s.match(/^(IV|III|II|I|[1-4])\s*(?:CSE)?\s*[- ]?\s*([AB])$/)
  if (!m) return raw.trim()
  const year = { "1": "I", "2": "II", "3": "III", "4": "IV" }[m[1]] ?? m[1]
  return `${year} CSE-${m[2]}`
}

export function StudentImport({ onClose, onDone, existingEmails }: { onClose: () => void; onDone: () => void; existingEmails: Set<string> }) {
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<Parsed[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ImportRowResult[] | null>(null)

  const readFile = async (file: File) => {
    setResults(null)
    setFileName(file.name)
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      if (!raw.length) { toast.error("The first sheet of this file is empty"); setRows([]); return }
      const headers = Object.keys(raw[0])
      const map = new Map<keyof NewStudent, string>()
      for (const c of COLUMNS) {
        const h = headers.find(h => c.aliases.test(h.trim()) && ![...map.values()].includes(h))
        if (h) map.set(c.key, h)
      }
      const missing = COLUMNS.slice(0, 3).filter(c => !map.has(c.key)).map(c => c.label)
      if (missing.length) { toast.error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headings.`); setRows([]); return }

      const seen = new Set<string>()
      const parsed = raw.map((r, i): Parsed => {
        const get = (k: keyof NewStudent) => String(map.has(k) ? r[map.get(k)!] ?? "" : "").trim()
        const email = get("email").toLowerCase()
        const section = normaliseSection(get("section"))
        const batchRaw = Number(get("batch_year"))
        const batch = batchRaw > 2000 ? batchRaw : SECTIONS.includes(section) ? graduationYear(section) : new Date().getFullYear()
        const parent = get("parent_mobile")
        const problems: string[] = []
        if (!get("full_name")) problems.push("name missing")
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("invalid email")
        if (!SECTIONS.includes(section)) problems.push(`unknown section "${get("section")}"`)
        if (parent && normalizeMobile(parent) === null) problems.push("parent mobile not 10 digits")
        if (existingEmails.has(email)) problems.push("already has an account")
        if (seen.has(email)) problems.push("repeated in file")
        seen.add(email)
        return {
          _row: i + 2, _problems: problems,
          full_name: get("full_name"), email, section, batch_year: batch,
          roll_number: get("roll_number"), register_number: get("register_number"), parent_mobile: parent,
        }
      }).filter(r => r.full_name || r.email)
      setRows(parsed)
    } catch {
      toast.error("Could not read this file. Save it as .xlsx or .csv and try again.")
      setRows([])
    }
  }

  const ready = useMemo(() => rows.filter(r => r._problems.length === 0), [rows])

  const run = async () => {
    setRunning(true)
    setProgress(0)
    const all: ImportRowResult[] = []
    const token = await getAccessToken() ?? ""
    for (let i = 0; i < ready.length; i += CHUNK) {
      const chunk = ready.slice(i, i + CHUNK)
      const res = await importStudentsAdmin(token, chunk.map(({ _row, _problems, ...s }) => s))
      if (res.error) { toast.error(res.error); break }
      all.push(...(res.results ?? []).map(r => ({ ...r, row: chunk[r.row - 1]._row })))
      setProgress(Math.min(ready.length, i + CHUNK))
    }
    setResults(all)
    setRunning(false)
    const created = all.filter(r => r.status === "created").length
    if (created) { toast.success(`${created} student account${created === 1 ? "" : "s"} created`); onDone() }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      COLUMNS.map(c => c.label),
      ["Example Student", "example.30csa@licet.ac.in", "I CSE-A", graduationYear("I CSE-A"), "30CSA01", "312230104001", "9876543210"],
    ])
    ws["!cols"] = COLUMNS.map(() => ({ wch: 22 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Students")
    XLSX.writeFile(wb, "Student_import_template.xlsx")
  }

  return (
    <div className="fixed inset-0 z-50 bg-licet-indigo/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label="Import students" onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border-t-[3px] border-licet-gold">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
          <div>
            <p className="eyebrow">Bulk admission</p>
            <h2 className="font-serif text-[24px] font-semibold text-licet-indigo mt-1">Import students from Excel</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Needs Name, Email and Section columns. Batch (graduating year), roll number, register number and parent mobile are optional. Existing accounts are never changed.</p>
          </div>
          <button onClick={onClose} disabled={running} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-border">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet cursor-pointer">
            <Upload size={14} /> Choose file
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={running}
              onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = "" }} />
          </label>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-[13px] font-semibold text-licet-indigo hover:bg-licet-cream/60">
            <Download size={14} /> Download template
          </button>
          {fileName && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><FileSpreadsheet size={14} />{fileName} · {rows.length} rows · {ready.length} ready</span>}
        </div>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-muted-foreground">Choose an Excel or CSV file to preview the students before importing.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-licet-paper">
                <tr className="text-left text-[10.5px] font-bold tracking-[1.2px] uppercase text-muted-foreground">
                  <th className="px-4 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Roll</th><th className="px-3 py-2">Parent</th><th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => {
                  const res = results?.find(x => x.row === r._row)
                  return (
                    <tr key={r._row} className={r._problems.length ? "bg-red-50/60" : ""}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r._row}</td>
                      <td className="px-3 py-2">{r.full_name}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">{r.section}</td>
                      <td className="px-3 py-2">{r.roll_number || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{normalizeMobile(r.parent_mobile) || "—"}</td>
                      <td className="px-4 py-2">
                        {res ? (
                          res.status === "created" ? <span className="inline-flex items-center gap-1 text-green-800"><CheckCircle2 size={13} />Created</span>
                            : <span className="text-red-800">{res.message}</span>
                        ) : r._problems.length ? <span className="inline-flex items-center gap-1 text-red-800"><AlertTriangle size={13} />{r._problems.join(", ")}</span>
                          : <span className="text-muted-foreground">Ready</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted-foreground">
            {running ? `Creating accounts… ${progress} of ${ready.length}` : results ? `${results.filter(r => r.status === "created").length} created · ${rows.length - results.filter(r => r.status === "created").length} not created (reasons shown in each row)` : "New students sign in with the default password and must change it at first login."}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={running} className="px-4 py-2 border border-border rounded-md text-[13px] font-semibold hover:bg-muted disabled:opacity-40">{results ? "Close" : "Cancel"}</button>
            {!results && (
              <button onClick={run} disabled={running || ready.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet disabled:opacity-50">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import {ready.length} student{ready.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
