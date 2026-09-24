"use client"

import { useEffect, useState } from "react"
import {
  ClipboardCheck, Award, BookOpen, BellRing, Heart, CalendarClock, CalendarDays, Bell, AlertTriangle,
  MessageSquareWarning, Clock3, UserRound, CheckCircle2, XCircle, MinusCircle,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cgpaFromMarks, type CGPAResult } from "@/lib/cgpa"
import { courseType, markSplit, internalMarks, attendanceStatus, type MarkMap } from "@/lib/regulations"
import {
  currentSemester, isoDate, semesterStart, isFinalYear, dayPhase, loadTodaysTimetables, loadUpcomingEvents, loadNotices,
  attendanceHeadroom, timeAgo, fmtDate, type EventItem, type NoticeItem,
} from "@/lib/dashboard"
import { academicYear, semesterTerm } from "@/lib/utils"
import { Hero, HeroChip, HeroPanel, Kpi, KpiSkeleton, Panel, PanelEmpty, Ring, Bar, AttPct, Pill, ListRow, Schedule, phaseLabel } from "./widgets"

type Profile = { id: string; full_name: string; section: string | null; register_number: string | null; roll_number: string | null; email: string }
type Course = { id: string; code: string; name: string; credits: number; faculty: string | null; marks: MarkMap; entered: string[]; subjectAtt: { n: number; p: number } }
type Leave = { id: string; leave_type: string; from_date: string; to_date: string; status: string }
type Grievance = { id: string; subject_line: string; category: string; status: string; created_at: string }

interface StudentData {
  sessions: number; present: number
  todayParts: Record<number, string>
  cgpa: CGPAResult
  courses: Course[]
  advisor: string | null
  alerts: number
  todayItems: { period: number; code: string; name: string }[]
  leaves: Leave[]
  grievances: Grievance[]
  notices: NoticeItem[]
  events: EventItem[]
}

const TYPE_LABEL: Record<string, string> = { THEORY: 'Theory', LAB_INTEGRATED: 'Theory + Lab', LAB: 'Laboratory', PROJECT: 'Project', FORMATION: 'Formation' }
const COMPONENTS: [string, string][] = [['CIA1', 'CIA 1'], ['CIA2', 'CIA 2'], ['SEM_END', 'SEE']]

async function loadStudent(me: Profile): Promise<StudentData> {
  const section = me.section ?? ''
  const sem = currentSemester(section)
  const from = semesterStart()
  const [dayAtt, marksRes, subjectsRes, advisorRes, alertsRes, subjAttRes, todayTT, leavesRes, grievRes, notices, events] = await Promise.all([
    supabase.from('day_attendance').select('date, part, status').eq('student_id', me.id).gte('date', from).range(0, 9999),
    supabase.from('marks').select('*, subjects(id, code, name, credits, semester, section)').eq('student_id', me.id).range(0, 4999),
    supabase.from('subjects').select('id, code, name, credits, faculty_id').eq('section', section).eq('semester', sem).order('code'),
    supabase.from('profiles').select('full_name').eq('advisor_section', section).maybeSingle(),
    supabase.from('attendance_alerts').select('id', { count: 'exact', head: true }).eq('student_id', me.id).is('cleared_at', null),
    supabase.from('attendance').select('subject_id, status').eq('student_id', me.id).gte('date', from).range(0, 9999),
    loadTodaysTimetables([section]),
    supabase.from('leaves').select('id, leave_type, from_date, to_date, status').eq('applicant_id', me.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('grievances').select('id, subject_line, category, status, created_at').eq('student_id', me.id).order('created_at', { ascending: false }).limit(3),
    loadNotices(['ALL', 'STUDENTS', section], 5),
    loadUpcomingEvents(4),
  ])

  const att = dayAtt.data ?? []
  const today = isoDate()
  const todayParts: Record<number, string> = {}
  for (const a of att) if (a.date === today) todayParts[a.part] = a.status

  const subjects = subjectsRes.data ?? []
  const facultyIds = [...new Set(subjects.map(s => s.faculty_id).filter(Boolean))] as string[]
  const facultyNames = new Map<string, string>()
  if (facultyIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', facultyIds)
    for (const f of data ?? []) facultyNames.set(f.id, f.full_name)
  }
  const marks = marksRes.data ?? []
  const subjAtt = subjAttRes.data ?? []

  return {
    sessions: att.length,
    present: att.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length,
    todayParts,
    cgpa: cgpaFromMarks(marks),
    courses: subjects.map(s => {
      const mine = marks.filter(m => m.subject_id === s.id)
      const map: MarkMap = Object.fromEntries(mine.map(m => [m.exam_type, Number(m.marks_obtained)]))
      const sa = subjAtt.filter(a => a.subject_id === s.id)
      return {
        id: s.id, code: s.code, name: s.name, credits: Number(s.credits),
        faculty: s.faculty_id ? facultyNames.get(s.faculty_id) ?? null : null,
        marks: map, entered: mine.map(m => m.exam_type),
        subjectAtt: { n: sa.length, p: sa.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length },
      }
    }),
    advisor: advisorRes.data?.full_name ?? null,
    alerts: alertsRes.count ?? 0,
    todayItems: (todayTT[section] ?? []).map(x => ({ period: x.period.no, code: x.slot.subjectCode, name: x.slot.subjectName })),
    leaves: (leavesRes.data ?? []) as Leave[],
    grievances: (grievRes.data ?? []) as Grievance[],
    notices, events,
  }
}

export default function StudentDashboard({ me, name, greeting }: { me: Profile | null; name: string; greeting: string }) {
  const [d, setD] = useState<StudentData | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!me) return
    loadStudent(me).then(setD).catch(() => setError(true))
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [me])

  const section = me?.section ?? ''
  const sem = currentSemester(section)
  const phase = dayPhase(now, d ? d.todayItems.length > 0 : true)
  const pct = d?.sessions ? d.present / d.sessions * 100 : null
  const status = pct == null ? null : attendanceStatus(pct)
  const head = d ? attendanceHeadroom(d.present, d.sessions) : { canMiss: 0, mustAttend: 0 }
  const pendingLeaves = d?.leaves.filter(l => l.status === 'PENDING').length ?? 0
  const openGrievances = d?.grievances.filter(g => g.status === 'OPEN' || g.status === 'IN_PROGRESS').length ?? 0

  return (
    <div className="space-y-6">
      <Hero
        kicker={`${greeting}${name ? `, ${name}` : ''}`}
        title={me?.full_name ?? 'My Dashboard'}
        subtitle={[me?.register_number || me?.roll_number, section && `B.E. Computer Science & Engineering · ${section}`].filter(Boolean).join(' · ')}
        chips={<>
          <HeroChip tone="gold">Semester {sem} · {semesterTerm()} {academicYear(new Date(), true)}</HeroChip>
          <HeroChip tone={phase.kind === 'period' ? 'live' : 'plain'}>{phaseLabel(phase)}</HeroChip>
          {d?.advisor && <HeroChip><UserRound size={12} />Class advisor: {d.advisor}</HeroChip>}
        </>}
        actions={[
          { href: '/dashboard/attendance', label: 'My attendance' },
          { href: '/dashboard/marks', label: 'My marks' },
          { href: '/dashboard/leaves', label: 'Apply for leave' },
          { href: '/dashboard/feedback', label: 'Course feedback' },
        ]}
        aside={
          <HeroPanel title="Today’s attendance">
            {!d ? <div className="h-[64px] animate-pulse rounded bg-white/10" /> : (
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(p => {
                  const s = d.todayParts[p]
                  const Icon = !s ? MinusCircle : s === 'ABSENT' ? XCircle : CheckCircle2
                  return (
                    <div key={p} className={`rounded-lg px-2 py-2.5 text-center border ${!s ? 'border-white/15 text-licet-cream/70' : s === 'ABSENT' ? 'border-red-300/40 bg-red-500/15 text-red-100' : 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'}`}>
                      <Icon size={16} className="mx-auto" />
                      <p className="text-[11px] font-semibold mt-1">Part {['I', 'II', 'III'][p - 1]}</p>
                      <p className="text-[10.5px] opacity-80">{s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Not marked'}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </HeroPanel>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 flex items-center gap-2">
          <AlertTriangle size={15} /> Some figures could not be loaded. Check your connection and refresh the page.
        </div>
      )}

      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {!d ? <KpiSkeleton count={5} /> : <>
          <Kpi label="Attendance" value={pct == null ? '—' : `${Math.round(pct)}%`} icon={ClipboardCheck} href="/dashboard/attendance" meter={pct}
            tone={status ? ({ good: 'good', warn: 'warn', bad: 'bad' } as const)[status.tone] : 'default'}
            sub={d.sessions ? `${d.present} of ${d.sessions} sessions this semester` : 'No attendance recorded yet'} />
          <Kpi label="CGPA" value={d.cgpa.totalCredits ? d.cgpa.cgpa.toFixed(2) : '—'} icon={Award} href="/dashboard/analytics"
            sub={d.cgpa.totalCredits ? `${d.cgpa.totalCredits} credits earned` : 'Published after semester results'} />
          <Kpi label="Courses" value={isFinalYear(section) ? '—' : d.courses.length} icon={BookOpen} href="/dashboard/curriculum"
            sub={isFinalYear(section) ? 'To be added by the department' : `${d.courses.reduce((a, c) => a + c.credits, 0)} credits in semester ${sem}`} />
          <Kpi label="Attendance alerts" value={d.alerts} icon={BellRing} tone={d.alerts ? 'warn' : 'default'}
            sub={d.alerts ? 'Meet your HOD to clear them' : 'No pending alerts'} />
          <Kpi label="Requests" value={pendingLeaves + openGrievances} icon={Heart} href="/dashboard/leaves"
            sub={`${pendingLeaves} leave · ${openGrievances} grievance pending`} />
        </>}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Panel kicker="Regulations 2024 · clause 7" title="Attendance eligibility" href="/dashboard/attendance" hrefLabel="Details">
          {!d ? <div className="h-48 animate-pulse" /> : (
            <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
              <Ring value={pct} size={132} sub={status?.code === 'SA' ? 'Shortage' : status ? 'This semester' : 'No records'} />
              <div className="flex-1 space-y-3 w-full">
                {status ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Pill tone={status.tone === 'good' ? 'green' : status.tone === 'warn' ? 'amber' : 'red'}>{status.eligible === 'YES' ? 'Eligible for exams' : status.eligible === 'CONDONATION' ? 'Condonation required' : 'Not eligible (SA)'}</Pill>
                      <span className="text-[12.5px] text-muted-foreground">{status.label}</span>
                    </div>
                    <p className="text-[14px] text-licet-indigo leading-relaxed">
                      {pct! >= 75
                        ? head.canMiss > 0 ? <>You can miss up to <b>{head.canMiss}</b> more session{head.canMiss === 1 ? '' : 's'} and still stay at 75% or above.</> : <>You are right at the limit. Missing the next session takes you below 75%.</>
                        : <>Attend the next <b>{head.mustAttend}</b> session{head.mustAttend === 1 ? '' : 's'} without absence to reach 75%.</>}
                    </p>
                  </>
                ) : <p className="text-[13.5px] text-muted-foreground">Attendance for this semester has not been recorded yet.</p>}
                <ul className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  {[['≥ 75%', 'Eligible', 'bg-green-50 text-green-800 border-green-200'], ['65–74%', 'Condonation', 'bg-amber-50 text-amber-800 border-amber-200'], ['< 65%', 'SA · repeat course', 'bg-red-50 text-red-800 border-red-200']].map(([r, l, c]) => (
                    <li key={r} className={`rounded-lg border px-2 py-1.5 ${c}`}><b className="block text-[12px]">{r}</b>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Panel>

        <Panel kicker={now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} title="Today’s timetable" href="/dashboard/timetable" hrefLabel="Full week">
          {!d ? <div className="h-48 animate-pulse" /> : (
            <Schedule items={d.todayItems} phase={phase}
              empty={<PanelEmpty icon={CalendarClock}>No classes on your timetable today.</PanelEmpty>} />
          )}
        </Panel>
      </section>

      <Panel kicker={`Semester ${sem} · R2024`} title="My courses" href="/dashboard/marks" hrefLabel="All marks">
        {!d ? <div className="h-48 animate-pulse" /> : isFinalYear(section) ? (
          <PanelEmpty icon={BookOpen}>Your batch follows the pre-autonomy curriculum. Your courses will be added by the department.</PanelEmpty>
        ) : d.courses.length === 0 ? (
          <PanelEmpty icon={BookOpen}>No courses have been added for your section this semester.</PanelEmpty>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
            {d.courses.map(c => {
              const type = courseType(c.code)
              const { internal: max } = markSplit(type)
              const hasCia = c.entered.some(e => e.startsWith('CIA'))
              const internal = hasCia ? internalMarks(c.code, c.marks) : null
              const subPct = c.subjectAtt.n ? c.subjectAtt.p / c.subjectAtt.n * 100 : null
              return (
                <div key={c.id} className="bg-card p-4 flex flex-col gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold tracking-wider text-licet-violet">{c.code}</span>
                      <Pill tone="neutral">{TYPE_LABEL[type] ?? type} · {c.credits} cr</Pill>
                    </div>
                    <p className="text-[14px] font-semibold text-licet-indigo mt-1 leading-snug">{c.name}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">{c.faculty ?? 'Faculty to be allotted'}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {COMPONENTS.map(([k, l]) => <Pill key={k} tone={c.entered.some(e => e.startsWith(k)) ? 'green' : 'neutral'}>{l}</Pill>)}
                  </div>
                  <div className="mt-auto space-y-2">
                    <div>
                      <div className="flex justify-between text-[11.5px] mb-1"><span className="text-muted-foreground">Internal (CIA) so far</span><span className="font-semibold text-licet-indigo tabular-nums">{internal == null ? '—' : `${internal} / ${max}`}</span></div>
                      <Bar value={internal ?? 0} max={max || 1} />
                    </div>
                    {subPct != null && (
                      <div className="flex justify-between text-[11.5px]"><span className="text-muted-foreground">Course attendance</span><AttPct value={subPct} /></div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel kicker="Latest" title="Notices" href="/dashboard/notices">
          {!d ? <div className="h-40 animate-pulse" /> : d.notices.length === 0 ? <PanelEmpty icon={Bell}>No active notices.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {d.notices.map(n => (
                <ListRow key={n.id} href="/dashboard/notices">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.urgent ? 'bg-red-50 text-red-800' : 'bg-licet-cream text-licet-indigo'}`}>{n.urgent ? <AlertTriangle size={15} /> : <Bell size={15} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{n.title}</p>
                    <p className="text-[11.5px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                  {n.urgent && <Pill tone="red">Urgent</Pill>}
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>
        <Panel kicker="Calendar" title="Upcoming events" href="/dashboard/events">
          {!d ? <div className="h-40 animate-pulse" /> : d.events.length === 0 ? <PanelEmpty icon={CalendarDays}>No upcoming events scheduled.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {d.events.map(e => (
                <ListRow key={e.id} href="/dashboard/events">
                  <span className="w-11 h-11 rounded-lg bg-licet-indigo text-white flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold tracking-wider uppercase text-licet-gold">{new Date(e.date).toLocaleDateString('en-IN', { month: 'short' })}</span>
                    <span className="font-serif text-[18px] font-semibold leading-none">{new Date(e.date).getDate()}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{e.title}</p>
                    {e.venue && <p className="text-[11.5px] text-muted-foreground truncate">{e.venue}</p>}
                  </div>
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>
        <Panel kicker="Requests" title="Leaves & grievances" href="/dashboard/leaves">
          {!d ? <div className="h-40 animate-pulse" /> : d.leaves.length + d.grievances.length === 0 ? (
            <PanelEmpty icon={Heart}>You have no leave applications or grievances.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {d.leaves.map(l => (
                <ListRow key={l.id} href="/dashboard/leaves">
                  <span className="w-8 h-8 rounded-lg bg-licet-cream text-licet-indigo flex items-center justify-center shrink-0"><Clock3 size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo">{l.leave_type} leave</p>
                    <p className="text-[11.5px] text-muted-foreground">{fmtDate(l.from_date)}{l.to_date !== l.from_date ? ` – ${fmtDate(l.to_date)}` : ''}</p>
                  </div>
                  <Pill tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'}>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Pill>
                </ListRow>
              ))}
              {d.grievances.map(g => (
                <ListRow key={g.id} href="/dashboard/grievances">
                  <span className="w-8 h-8 rounded-lg bg-licet-cream text-licet-indigo flex items-center justify-center shrink-0"><MessageSquareWarning size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{g.subject_line || g.category}</p>
                    <p className="text-[11.5px] text-muted-foreground">Grievance · {timeAgo(g.created_at)}</p>
                  </div>
                  <Pill tone={g.status === 'RESOLVED' || g.status === 'CLOSED' ? 'green' : 'amber'}>{g.status.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</Pill>
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  )
}
