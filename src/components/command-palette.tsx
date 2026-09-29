"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, CornerDownLeft, UserRound, type LucideIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"

// Quick search (Ctrl/⌘ K or "/"): jump to any module, and for staff, to any
// student's record by name, roll number or register number.

export interface PaletteModule { id: string; label: string; href: string; icon: LucideIcon; group: string }
type Student = { id: string; full_name: string; roll_number: string | null; register_number: string | null; section: string | null }
type Result = { key: string; href: string; icon: LucideIcon; title: string; sub: string }

export function CommandPalette({ open, onClose, modules, searchStudents }: {
  open: boolean; onClose: () => void; modules: PaletteModule[]; searchStudents: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState("")
  const [students, setStudents] = useState<Student[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open) return
    setQ(""); setStudents([]); setActive(0)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Student lookup, debounced; RLS limits it to what the user may see.
  useEffect(() => {
    const term = q.trim()
    if (!searchStudents || term.length < 2) { setStudents([]); return }
    const t = setTimeout(async () => {
      const like = `*${term.replace(/[%_*,()]/g, " ")}*`
      const { data } = await supabase.from("profiles").select("id, full_name, roll_number, register_number, section")
        .eq("role", "STUDENT").or(`full_name.ilike.${like},roll_number.ilike.${like},register_number.ilike.${like},email.ilike.${like}`)
        .order("full_name").limit(8)
      setStudents(data ?? [])
    }, 180)
    return () => clearTimeout(t)
  }, [q, searchStudents])

  const results: Result[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    const mods = modules.filter(m => !term || m.label.toLowerCase().includes(term) || m.group.toLowerCase().includes(term)).slice(0, term ? 8 : 12)
      .map(m => ({ key: "m" + m.id, href: m.href, icon: m.icon, title: m.label, sub: m.group }))
    const studs = students.map(s => ({ key: "s" + s.id, href: `/dashboard/students/${s.id}`, icon: UserRound, title: s.full_name, sub: [s.section, s.roll_number, s.register_number].filter(Boolean).join(" · ") }))
    return [...studs, ...mods]
  }, [q, modules, students])

  useEffect(() => { setActive(0) }, [results.length])

  const go = (r: Result | undefined) => { if (!r) return; onClose(); router.push(r.href) }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[85] bg-licet-indigo/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Quick search" onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl shadow-licet-indigo/30 border border-border overflow-hidden font-nav">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search size={17} className="text-licet-violet shrink-0" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)) }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
              if (e.key === "Enter") { e.preventDefault(); go(results[active]) }
              if (e.key === "Escape") onClose()
            }}
            placeholder={searchStudents ? "Search modules, or a student by name, roll or register number" : "Search modules"}
            aria-label="Search" className="flex-1 h-14 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          <kbd className="text-[10.5px] font-semibold text-muted-foreground border border-border rounded-md px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[55vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">No matches</li>
          ) : results.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? "bg-licet-cream/70" : ""}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.key.startsWith("s") ? "bg-licet-indigo text-licet-gold" : "bg-licet-cream text-licet-indigo"}`}><r.icon size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-licet-indigo truncate">{r.title}</span>
                  <span className="block text-[11.5px] text-muted-foreground truncate">{r.sub}</span>
                </span>
                {i === active && <CornerDownLeft size={14} className="text-muted-foreground shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">↑ ↓ to move · Enter to open · Ctrl K to search from anywhere</p>
      </div>
    </div>
  )
}
