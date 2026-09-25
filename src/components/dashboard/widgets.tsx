"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { ArrowRight, ArrowUpRight, Phone } from "lucide-react"
import { PERIODS, fmtTime, type DayPhase } from "@/lib/dashboard"

// ── Hero ───────────────────────────────────────────────────────────────────
export function Hero({ kicker, title, subtitle, chips, actions, aside }: {
  kicker: string; title: ReactNode; subtitle?: ReactNode
  chips?: ReactNode; actions?: { href: string; label: string }[]; aside?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-licet-indigo text-white shadow-[0_20px_50px_-24px_rgba(26,12,78,0.65)]">
      {/* layered backdrop: gold rule, soft radial glow, faint seal */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,#41317E_0%,transparent_55%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-licet-gold via-[#F8D88D] to-licet-gold" />
      <img src="/images.png" alt="" aria-hidden className="absolute -right-16 -bottom-20 w-72 h-72 rounded-full opacity-[0.06] pointer-events-none" />

      <div className="relative grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="flex items-center gap-3 text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">
            <span className="h-px w-8 bg-licet-gold" />{kicker}
          </p>
          <h1 className="font-serif font-medium text-[34px] md:text-[44px] leading-[1.05] mt-3 !text-white">{title}</h1>
          {subtitle && <p className="text-[14px] text-licet-cream/80 mt-2 max-w-2xl">{subtitle}</p>}
          {chips && <div className="flex flex-wrap gap-2 mt-4">{chips}</div>}
          {actions && actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-5">
              {actions.map(a => (
                <Link key={a.href} href={a.href} prefetch
                  className="group inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[12.5px] font-semibold border border-licet-gold/40 text-licet-cream bg-white/[0.04] hover:bg-licet-gold hover:text-licet-indigo hover:border-licet-gold transition-colors">
                  {a.label}<ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )}
        </div>
        {aside && <div className="lg:min-w-[300px]">{aside}</div>}
      </div>
    </section>
  )
}

export function HeroChip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "gold" | "live" }) {
  const cls = tone === "gold" ? "bg-licet-gold text-licet-indigo border-licet-gold"
    : tone === "live" ? "bg-white/10 text-white border-white/20" : "bg-white/[0.06] text-licet-cream border-white/15"
  return (
    <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-medium ${cls}`}>
      {tone === "live" && <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-emerald-400" /></span>}
      {children}
    </span>
  )
}

/** Glass tile used inside the hero for "today" figures. */
export function HeroPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-sm p-4">
      <p className="text-[10.5px] font-bold tracking-[2px] uppercase text-licet-gold">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

// ── KPI cards ──────────────────────────────────────────────────────────────
type Tone = "default" | "good" | "warn" | "bad"
const TONE_TEXT: Record<Tone, string> = { default: "text-licet-indigo", good: "text-green-800", warn: "text-amber-800", bad: "text-red-800" }

export function Kpi({ label, value, sub, icon: Icon, tone = "default", href, meter }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: Tone; href?: string
  meter?: number | null
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-bold tracking-[1.8px] uppercase text-muted-foreground leading-tight">{label}</span>
        <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-licet-cream text-licet-indigo shrink-0 group-hover:bg-licet-indigo group-hover:text-licet-gold transition-colors">
          <Icon size={16} />
        </span>
      </div>
      <p className={`font-serif text-[34px] font-semibold leading-none mt-2 ${TONE_TEXT[tone]}`}>{value}</p>
      {meter != null && (
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${meter >= 75 ? 'bg-green-700' : meter >= 65 ? 'bg-amber-600' : 'bg-red-700'}`} style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </div>
      )}
      {sub && <p className="text-[12px] text-muted-foreground mt-2 leading-snug">{sub}</p>}
    </>
  )
  const cls = "group relative block bg-card border border-border rounded-xl p-4 shadow-sm overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-licet-gold transition-all"
  return href
    ? <Link href={href} prefetch className={`${cls} hover:-translate-y-0.5 hover:shadow-md hover:shadow-licet-indigo/10 hover:border-licet-gold`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

export function KpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4 h-[132px] animate-pulse">
          <div className="w-3/5 h-2.5 rounded bg-muted" />
          <div className="w-2/5 h-7 rounded bg-muted mt-5" />
          <div className="w-4/5 h-2 rounded bg-muted mt-4" />
        </div>
      ))}
    </>
  )
}

// ── Panels ─────────────────────────────────────────────────────────────────
export function Panel({ kicker, title, href, hrefLabel = "View all", actions, children, className = "", bodyClass = "" }: {
  kicker?: string; title: ReactNode; href?: string; hrefLabel?: string; actions?: ReactNode
  children: ReactNode; className?: string; bodyClass?: string
}) {
  return (
    <section className={`bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col ${className}`}>
      <header className="flex items-end justify-between gap-3 px-5 pt-4 pb-3 border-b border-border bg-gradient-to-b from-licet-paper to-white">
        <div className="min-w-0">
          {kicker && <span className="eyebrow !text-[10px] !tracking-[2.5px]">{kicker}</span>}
          <h2 className="font-serif text-[21px] font-semibold leading-tight mt-0.5">{title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {href && (
            <Link href={href} prefetch className="inline-flex items-center gap-1 text-[12px] font-semibold text-licet-violet hover:text-licet-indigo">
              {hrefLabel}<ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </header>
      <div className={`flex-1 ${bodyClass}`}>{children}</div>
    </section>
  )
}

export function PanelEmpty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 h-full">
      <span className="w-11 h-11 rounded-full bg-licet-cream text-licet-indigo/70 flex items-center justify-center"><Icon size={18} /></span>
      <p className="text-[13px] text-muted-foreground mt-2.5 max-w-xs">{children}</p>
    </div>
  )
}

// ── Small visual primitives ────────────────────────────────────────────────
export function Ring({ value, size = 112, stroke = 10, label, sub }: { value: number | null; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.min(100, Math.max(0, value))
  const color = value == null ? '#DCD0B4' : pct >= 75 ? '#15803d' : pct >= 65 ? '#b45309' : '#b91c1c'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3EEE3" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} className="transition-[stroke-dashoffset] duration-700" />
        {/* 75% eligibility marker */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A0C4E" strokeWidth={stroke + 4} strokeDasharray={`1.5 ${c}`} strokeDashoffset={-(0.75 * c)} opacity={0.5} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-serif text-[26px] font-semibold leading-none text-licet-indigo">{label ?? (value == null ? '—' : `${Math.round(pct)}%`)}</span>
        {sub && <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mt-1">{sub}</span>}
      </div>
    </div>
  )
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'indigo' | 'att' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  const color = tone === 'att' ? (value >= 75 ? 'bg-green-700' : value >= 65 ? 'bg-amber-600' : 'bg-red-700') : 'bg-licet-violet'
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function AttPct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  const cls = value >= 75 ? 'text-green-800' : value >= 65 ? 'text-amber-800' : 'text-red-800'
  return <span className={`font-semibold tabular-nums ${cls}`}>{Math.round(value)}%</span>
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "indigo" | "gold" | "green" | "amber" | "red" }) {
  const cls = {
    neutral: "bg-muted text-muted-foreground border-border",
    indigo: "bg-licet-indigo/[0.07] text-licet-indigo border-licet-indigo/15",
    gold: "bg-licet-cream text-licet-indigo border-licet-gold",
    green: "bg-green-50 text-green-800 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
  }[tone]
  return <span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>
}

export function Initials({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.replace(/^(Dr|Mr|Ms|Mrs|Rev|Fr)\.?\s+/i, '').split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return <span className={`inline-flex items-center justify-center rounded-full bg-licet-cream text-licet-indigo font-semibold text-[11px] shrink-0 ${className || 'w-8 h-8'}`}>{initials}</span>
}

// ── Day schedule ───────────────────────────────────────────────────────────
export function Schedule({ items, phase, empty }: {
  items: { period: number; code: string; name: string; meta?: string }[]; phase: DayPhase; empty: ReactNode
}) {
  if (!items.length) return <>{empty}</>
  const liveNo = phase.kind === 'period' ? phase.period.no : null
  const nextNo = phase.kind === 'break' ? phase.next.no : phase.kind === 'before' ? items[0]?.period : null
  return (
    <ol className="relative px-5 py-4 space-y-1">
      <span aria-hidden className="absolute left-[46px] top-6 bottom-6 w-px bg-border" />
      {items.map(it => {
        const p = PERIODS.find(x => x.no === it.period)!
        const live = it.period === liveNo
        const next = it.period === nextNo
        const past = liveNo != null ? it.period < liveNo : phase.kind === 'after' || (nextNo != null && it.period < nextNo)
        return (
          <li key={`${it.period}-${it.code}-${it.meta ?? ''}`} className={`relative flex items-center gap-3 rounded-lg px-2 py-2 ${live ? 'bg-licet-cream/70' : ''}`}>
            <span className={`relative z-10 w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 border ${live ? 'bg-licet-indigo text-white border-licet-indigo' : past ? 'bg-muted text-muted-foreground border-border' : 'bg-white text-licet-indigo border-licet-gold'}`}>
              <span className="text-[9.5px] font-bold tracking-wider uppercase opacity-80">P{it.period}</span>
              <span className="text-[11px] font-semibold tabular-nums">{fmtTime(p.start)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13.5px] font-semibold truncate ${past ? 'text-muted-foreground' : 'text-licet-indigo'}`}>{it.name}</p>
              <p className="text-[11.5px] text-muted-foreground truncate">{it.code}{it.meta ? ` · ${it.meta}` : ''} · {fmtTime(p.start)}–{fmtTime(p.end)}</p>
            </div>
            {live && <Pill tone="green">In progress</Pill>}
            {next && !live && <Pill tone="gold">Up next</Pill>}
          </li>
        )
      })}
    </ol>
  )
}

export function phaseLabel(phase: DayPhase): string {
  switch (phase.kind) {
    case 'holiday': return 'No classes today'
    case 'before': return `Classes begin at ${fmtTime(PERIODS[0].start)} AM`
    case 'period': return `Period ${phase.period.no} in progress · until ${fmtTime(phase.period.end)}`
    case 'break': return `Break · Period ${phase.next.no} at ${fmtTime(phase.next.start)}`
    case 'after': return 'Classes are over for today'
  }
}

export function ListRow({ href, children }: { href?: string; children: ReactNode }) {
  const cls = "flex items-center gap-3 px-5 py-3 transition-colors"
  return href
    ? <li><Link href={href} prefetch className={`${cls} hover:bg-licet-cream/40`}>{children}</Link></li>
    : <li className={cls}>{children}</li>
}

/** Compact "call parent" link used in at-risk student lists. */
export function CallParent({ mobile }: { mobile?: string | null }) {
  if (!mobile) return null
  return (
    <a href={`tel:+91${mobile}`} title={`Call parent / guardian: ${mobile.slice(0, 5)} ${mobile.slice(5)}`} aria-label="Call parent or guardian"
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-licet-violet bg-licet-cream/60 hover:bg-licet-indigo hover:text-licet-gold transition-colors">
      <Phone size={14} />
    </a>
  )
}
