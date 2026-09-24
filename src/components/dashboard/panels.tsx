"use client"

import { Bell, AlertTriangle, CalendarDays, FileText, NotebookPen, CheckCircle2, type LucideIcon } from "lucide-react"
import Link from "next/link"
import {
  PERIODS, WEEK_DAYS, fmtTime, timeAgo, todayName, type DayPhase, type EventItem, type ExamItem,
  type DocItem, type NoticeItem, type WeekTimetable,
} from "@/lib/dashboard"
import { Panel, PanelEmpty, Pill, ListRow } from "./widgets"

const audienceLabel = (a: string) =>
  a === 'ALL' ? 'Everyone' : a === 'PROFESSOR' || a === 'FACULTY' ? 'Faculty' : a === 'STUDENTS' ? 'All students' : a

function DateTile({ iso, tone = 'indigo' }: { iso: string; tone?: 'indigo' | 'gold' }) {
  const d = new Date(iso)
  return (
    <span className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center shrink-0 ${tone === 'indigo' ? 'bg-licet-indigo text-white' : 'bg-licet-cream text-licet-indigo border border-licet-gold'}`}>
      <span className={`text-[9px] font-bold tracking-wider uppercase ${tone === 'indigo' ? 'text-licet-gold' : 'text-licet-violet'}`}>{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
      <span className="font-serif text-[18px] font-semibold leading-none">{d.getDate()}</span>
    </span>
  )
}

const daysUntil = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
const whenLabel = (iso: string) => { const n = daysUntil(iso); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days` }

export function NoticesPanel({ items, loading, showAudience = false }: { items: NoticeItem[]; loading: boolean; showAudience?: boolean }) {
  return (
    <Panel kicker="Latest" title="Notices" href="/dashboard/notices">
      {loading ? <div className="h-40 animate-pulse" /> : items.length === 0 ? <PanelEmpty icon={Bell}>No active notices.</PanelEmpty> : (
        <ul className="divide-y divide-border">
          {items.map(n => (
            <ListRow key={n.id} href="/dashboard/notices">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.urgent ? 'bg-red-50 text-red-800' : 'bg-licet-cream text-licet-indigo'}`}>{n.urgent ? <AlertTriangle size={15} /> : <Bell size={15} />}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-licet-indigo truncate">{n.title}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{showAudience ? `${audienceLabel(n.audience)} · ` : ''}{timeAgo(n.created_at)}</p>
              </div>
              {n.urgent && <Pill tone="red">Urgent</Pill>}
            </ListRow>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function EventsPanel({ items, loading }: { items: EventItem[]; loading: boolean }) {
  return (
    <Panel kicker="Calendar" title="Upcoming events" href="/dashboard/events">
      {loading ? <div className="h-40 animate-pulse" /> : items.length === 0 ? <PanelEmpty icon={CalendarDays}>No upcoming events scheduled.</PanelEmpty> : (
        <ul className="divide-y divide-border">
          {items.map(e => (
            <ListRow key={e.id} href="/dashboard/events">
              <DateTile iso={e.date} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-licet-indigo truncate">{e.title}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{[e.type?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()), e.venue].filter(Boolean).join(' · ') || whenLabel(e.date)}</p>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{whenLabel(e.date)}</span>
            </ListRow>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function ExamsPanel({ items, loading, showSection = true }: { items: ExamItem[]; loading: boolean; showSection?: boolean }) {
  return (
    <Panel kicker="Exam schedule" title="Upcoming exams" href="/dashboard/examination">
      {loading ? <div className="h-40 animate-pulse" /> : items.length === 0 ? <PanelEmpty icon={NotebookPen}>No examinations scheduled.</PanelEmpty> : (
        <ul className="divide-y divide-border">
          {items.map(x => (
            <ListRow key={x.id} href="/dashboard/examination">
              <DateTile iso={x.date} tone="gold" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-licet-indigo truncate">{x.subject_name} <span className="text-muted-foreground font-normal">· {x.subject_code}</span></p>
                <p className="text-[11.5px] text-muted-foreground truncate">
                  {[x.exam_type, showSection && x.section, x.time && `${fmtTime(x.time)}${Number(x.time.split(':')[0]) < 12 ? ' AM' : ' PM'}`, x.venue && `Venue ${x.venue}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Pill tone={daysUntil(x.date) <= 2 ? 'amber' : 'neutral'}>{whenLabel(x.date)}</Pill>
            </ListRow>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function DocumentsPanel({ items, loading }: { items: DocItem[]; loading: boolean }) {
  return (
    <Panel kicker="Repository" title="Recent documents" href="/dashboard/documents">
      {loading ? <div className="h-40 animate-pulse" /> : items.length === 0 ? <PanelEmpty icon={FileText}>No documents shared yet.</PanelEmpty> : (
        <ul className="divide-y divide-border">
          {items.map(d => (
            <ListRow key={d.id} href="/dashboard/documents">
              <span className="w-8 h-8 rounded-lg bg-licet-cream text-licet-indigo flex items-center justify-center shrink-0"><FileText size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-licet-indigo truncate">{d.title}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{d.category}{d.section ? ` · ${d.section}` : ''} · {timeAgo(d.created_at)}</p>
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export type Todo = { label: string; detail?: string; count?: number; href: string; icon: LucideIcon; tone: 'bad' | 'warn' | 'info' | 'done' }

/** Personal action list: every item links to the page where it is resolved. */
export function TodoPanel({ items, loading, title = "Your to-do list", kicker = "Action centre" }: { items: Todo[]; loading: boolean; title?: string; kicker?: string }) {
  const open = items.filter(i => i.tone !== 'done').length
  return (
    <Panel kicker={kicker} title={title} actions={!loading && <Pill tone={open ? 'amber' : 'green'}>{open ? `${open} to do` : 'All clear'}</Pill>}>
      {loading ? <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div> : (
        <ul className="divide-y divide-border">
          {items.map(t => {
            const Icon = t.tone === 'done' ? CheckCircle2 : t.icon
            const tone = { bad: 'bg-red-50 text-red-800', warn: 'bg-amber-50 text-amber-800', info: 'bg-licet-cream text-licet-indigo', done: 'bg-green-50 text-green-700' }[t.tone]
            return (
              <ListRow key={t.label} href={t.href}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}><Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13.5px] ${t.tone === 'done' ? 'text-muted-foreground' : 'text-licet-indigo font-medium'}`}>{t.label}</p>
                  {t.detail && <p className="text-[11.5px] text-muted-foreground truncate">{t.detail}</p>}
                </div>
                {t.count != null && <span className={`min-w-8 h-6 px-2 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums ${t.tone === 'done' ? 'text-green-800' : t.tone === 'bad' ? 'bg-red-100 text-red-900' : t.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-licet-cream text-licet-indigo'}`}>{t.count}</span>}
              </ListRow>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/** Days × periods grid. `cell` returns what to show for a slot (null = free). */
export function WeekGrid({ week, phase, cell, emptyNote }: {
  week: WeekTimetable; phase: DayPhase
  cell: (day: string, period: number) => { code: string; sub?: string } | null
  emptyNote: string
}) {
  const days = WEEK_DAYS.filter(d => d !== 'Saturday' || week.Saturday)
  const any = days.some(d => PERIODS.some(p => cell(d, p.no)))
  if (!any) return <PanelEmpty icon={CalendarDays}>{emptyNote}</PanelEmpty>
  const today = todayName()
  const live = phase.kind === 'period' ? phase.period.no : null
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-[11.5px]">
        <thead>
          <tr>
            <th className="w-[92px]" />
            {PERIODS.map(p => (
              <th key={p.no} className={`!bg-transparent !p-1 text-center font-bold ${p.no === 3 || p.no === 6 ? 'border-l-2 border-licet-gold/60' : ''}`}>
                <span className="block text-licet-indigo !tracking-normal">P{p.no}</span>
                <span className="block text-[9.5px] font-medium text-muted-foreground !tracking-normal normal-case">{fmtTime(p.start)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map(day => (
            <tr key={day} className="!bg-transparent">
              <td className={`!py-1 pr-2 text-[12px] font-semibold ${day === today ? 'text-licet-violet' : 'text-licet-indigo'}`}>
                {day.slice(0, 3)}{day === today && <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wider text-licet-gold bg-licet-indigo px-1.5 py-0.5 rounded">Today</span>}
              </td>
              {PERIODS.map(p => {
                const c = cell(day, p.no)
                const isLive = day === today && p.no === live
                return (
                  <td key={p.no} title={c ? `${c.code}${c.sub ? ` · ${c.sub}` : ''}` : 'Free'}
                    className={`!p-0 h-10 rounded-md text-center align-middle ${c
                      ? isLive ? 'bg-licet-indigo text-white ring-2 ring-licet-gold' : day === today ? 'bg-licet-cream text-licet-indigo border border-licet-gold' : 'bg-licet-indigo/[0.06] text-licet-indigo'
                      : 'bg-muted/50 text-muted-foreground/40'}`}>
                    {c ? <><span className="block font-semibold leading-tight">{c.code}</span>{c.sub && <span className="block text-[9.5px] opacity-75 leading-tight">{c.sub}</span>}</> : '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { DateTile, whenLabel, daysUntil, audienceLabel }
export const periodCount = (week: WeekTimetable, match: (s: { subjectId: string }) => boolean) =>
  Object.values(week).reduce((a, day) => a + Object.values(day).filter(match).length, 0)
export const LinkChip = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} prefetch className="text-[12px] font-semibold text-licet-violet hover:text-licet-indigo hover:underline">{children}</Link>
)
