import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function PageHeader({ kicker, title, description, actions }: {
  kicker: string; title: string; description?: ReactNode; actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <span className="eyebrow">{kicker}</span>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{title}</h1>
        {description && <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bg-card border border-border rounded-xl shadow-sm ${className}`}>{children}</section>
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="min-w-0">
        <h2 className="font-serif text-[20px] font-semibold leading-tight">{title}</h2>
        {description && <p className="text-[12.5px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Stat({ label, value, sub, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="bg-card border border-border border-t-[3px] border-t-licet-gold rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-bold tracking-[2px] uppercase text-muted-foreground">{label}</span>
        {Icon && <span className="w-8 h-8 rounded-md flex items-center justify-center bg-licet-cream text-licet-indigo"><Icon size={15} /></span>}
      </div>
      <p className="font-serif text-[30px] font-semibold leading-none text-licet-indigo mt-2">{value}</p>
      {sub && <p className="text-[12px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

const TONES = {
  neutral: "bg-muted text-muted-foreground border-border",
  indigo: "bg-licet-indigo/[0.07] text-licet-indigo border-licet-indigo/15",
  gold: "bg-licet-cream text-licet-indigo border-licet-gold",
  green: "bg-green-50 text-green-800 border-green-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto w-12 h-12 rounded-full bg-licet-cream text-licet-indigo flex items-center justify-center"><Icon size={20} /></span>
      <p className="font-serif text-[18px] font-semibold text-licet-indigo mt-3">{title}</p>
      {children && <div className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">{children}</div>}
    </div>
  )
}

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-licet-indigo text-white text-[13px] font-semibold hover:bg-licet-violet disabled:opacity-50 transition-colors",
  secondary: "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md border border-border bg-white text-licet-indigo text-[13px] font-semibold hover:bg-licet-cream/60 disabled:opacity-50 transition-colors",
  ghost: "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md text-licet-violet text-[12.5px] font-semibold hover:bg-licet-cream/70 disabled:opacity-50 transition-colors",
  danger: "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-red-700 text-white text-[13px] font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors",
}

export const field = "h-9 w-full rounded-md border border-input bg-white px-3 text-[13.5px] outline-none focus:border-licet-violet focus:ring-2 focus:ring-licet-gold/40 transition"
