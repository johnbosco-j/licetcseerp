"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react"

// Small app-wide notification system. Call toast.success / toast.error from any
// client component; <Toaster /> (mounted once in the dashboard layout) shows them.

type Kind = "success" | "error" | "info"
type Toast = { id: number; kind: Kind; text: string }

let nextId = 1
const listeners = new Set<(t: Toast) => void>()
const push = (kind: Kind, text: string) => { const t = { id: nextId++, kind, text }; listeners.forEach(l => l(t)) }

/** Turns Postgres / RLS errors into sentences people can act on. */
export function friendlyError(message: string): string {
  if (/row-level security|permission denied|42501/i.test(message)) return "You don't have permission to do that."
  if (/duplicate key|already exists|23505/i.test(message)) return "That record already exists."
  if (/violates check constraint.*leaves_dates_ok/i.test(message)) return "The end date can't be before the start date."
  if (/violates check constraint/i.test(message)) return "Some values are not allowed. Please check the form."
  if (/violates foreign key/i.test(message)) return "This record is linked to other records and can't be changed that way."
  if (/Failed to fetch|NetworkError|network/i.test(message)) return "Network problem. Check your connection and try again."
  return message
}

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", friendlyError(text)),
  info: (text: string) => push("info", text),
}

/** Shows an error toast when a Supabase call failed, else the success text. Returns true on success. */
export function reportResult(error: { message: string } | null | undefined, success?: string): boolean {
  if (error) { toast.error(error.message); return false }
  if (success) toast.success(success)
  return true
}

const STYLE: Record<Kind, { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: "border-l-green-600 [&_svg.k]:text-green-700" },
  error:   { icon: AlertTriangle, cls: "border-l-red-600 [&_svg.k]:text-red-700" },
  info:    { icon: Info, cls: "border-l-licet-violet [&_svg.k]:text-licet-violet" },
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const onToast = (t: Toast) => {
      setItems(xs => [...xs.slice(-3), t])
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== t.id)), t.kind === "error" ? 7000 : 4000)
    }
    listeners.add(onToast)
    return () => { listeners.delete(onToast) }
  }, [])
  return (
    <div aria-live="polite" className="fixed z-[90] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 sm:w-[380px] pointer-events-none">
      {items.map(t => {
        const { icon: Icon, cls } = STYLE[t.kind]
        return (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 bg-white border border-border border-l-4 ${cls} rounded-lg shadow-lg shadow-licet-indigo/10 px-4 py-3 animate-in fade-in slide-in-from-bottom-2`}>
            <Icon className="k w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[13.5px] text-foreground flex-1">{t.text}</p>
            <button onClick={() => setItems(xs => xs.filter(x => x.id !== t.id))} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
