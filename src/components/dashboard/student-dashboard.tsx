"use client"

import { useEffect, useState } from "react"
import {
  ClipboardCheck, Award, BookOpen, BellRing, Heart, CalendarClock, AlertTriangle, MessageSquareWarning, Clock3,
  UserRound, CheckCircle2, XCircle, MinusCircle, Star, CalendarRange, Briefcase, GraduationCap, IdCard, Mail, Hash,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cgpaFromMarks, type CGPAResult } from "@/lib/cgpa"
import { courseType, markSplit, internalMarks, attendanceStatus, type MarkMap } from "@/lib/regulations"
import {
  PERIODS, currentSemester, isoDate, semesterStart, isFinalYear, dayPhase, loadWeekTimetables, loadUpcomingEvents, loadNotices,
  loadUpcomingExams, loadRecentDocuments, attendanceHeadroom, timeAgo, fmtDate, todayName,
  type EventItem, type NoticeItem, type ExamItem, type DocItem, type WeekTimetable,
} from "@/lib/dashboard"
import { academicYear, semesterTerm } from "@/lib/utils"
import { Hero, HeroChip, HeroPanel, Kpi, KpiSkeleton, Panel, PanelEmpty, Ring, Bar, AttPct, Pill, ListRow, Schedule, phaseLabel, Initials } from "./widgets"
import { NoticesPanel, EventsPanel, ExamsPanel, DocumentsPanel, TodoPanel, WeekGrid, daysUntil, type Todo } from "./panels"

export type StudentMe = { id: string; full_name: string; section: string | null; register_number: string | null; roll_number: string | null; email: string }
type Course = { id: string; code: string; name: string; credits: number; faculty: string | null; marks: MarkMap; entered: string[]; subjectAtt: { n: number; p: number }; feedbackDone: boolean }
type Leave = { id: string; leave_type: string; from_date: string; to_date: string; status: string }
type Grievance = { id: string; subject_line: string; category: string; status: string; created_at: string }
type Placement = { id: string; company_name: string; role_title: string; package_lpa: number | null; visit_date: string | null }
type DayRecord = { date: string; parts: Record<number, string> }

interface StudentData {
  sessions: number; present: number
  todayParts: Record<number, string>
  recent: DayRecord[]
  cgpa: CGPAResult
  courses: Course[]
  advisor: string | null
  hod: string | null
  alerts: number
  week: WeekTimetable
  leaves: Leave[]
  grievances: Grievance[]
  notices: NoticeItem[]
  events: EventItem[]
  exams: ExamItem[]
  docs: DocItem[]
  placements: Placement[]
}

const TYPE_LABEL: Record<string, string> = { THEORY: 'Theory', LAB_INTEGRATED: 'Theory + Lab', LAB: 'Laboratory', PROJECT: 'Project', FORMATION: 'Formation' }
const COMPONENTS: [string, string][] = [['CIA1', 'CIA 1'], ['CIA2', 'CIA 2'], ['SEM_END', 'SEE']]
const present = (s?: string) => s === 'PRESENT' || s === 'LATE'

async function loadStudent(me: StudentMe): Promise<StudentData> {
  const section = me.section ?? ''
  const sem = currentSemester(section)
  const from = semesterStart()
  const head = { count: 'exact' as const, head: true }
  const [dayAtt, marksRes, subjectsRes, advisorRes, hodRes, alertsRes, subjAttRes, weekRes, feedbackRes, leavesRes, grievRes, notices, events, exams, docs, placementsRes] = await Promise.all([
    supabase.from('day_attendance').select('date, part, status').eq('student_id', me.id).gte('date', from).order('date', { ascending: false }).range(0, 9999),
    supabase.from('marks').select('*, subjects(id, code, name, credits, semester, section)').eq('student_id', me.id).range(0, 4999),
    supabase.from('subjects').select('id, code, name, credits, faculty_id').eq('section', section).eq('semester', sem).order('code'),
    supabase.from('profiles').select('full_name').eq('advisor_section', section).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('role', 'HOD').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('attendance_alerts').select('id', head).eq('student_id', me.id).is('cleared_at', null),
    supabase.from('attendance').select('subject_id, status').eq('student_id', me.id).gte('date', from).range(0, 9999),
    loadWeekTimetables([section]),
    supabase.from('announcements').select('audience').eq('created_by', me.id).like('audience', 'FEEDBACK:%'),
    supabase.from('leaves').select('id, leave_type, from_date, to_date, status').eq('applicant_id', me.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('grievances').select('id, subject_line, category, status, created_at').eq('student_id', me.id).order('created_at', { ascending: false }).limit(3),
    loadNotices(['ALL', 'STUDENTS', section], 5),
    loadUpcomingEvents(4),
    loadUpcomingExams([section], 5),
    loadRecentDocuments(section, 5),
    supabase.from('placements').select('id, company_name, role_title, package_lpa, visit_date').eq('is_active', true).order('visit_date', { ascending: true, nullsFirst: false }).limit(4),
  ])

  const att = dayAtt.data ?? []
  const byDate = new Map<string, Record<number, string>>()
  for (const a of att) { const m = byDate.get(a.date) ?? {}; m[a.part] = a.status; byDate.set(a.date, m) }
  const today = isoDate()

  const subjects = subjectsRes.data ?? []
  const facultyIds = [...new Set(subjects.map(s => s.faculty_id).filter(Boolean))] as string[]
  const facultyNames = new Map<string, string>()
  if (facultyIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', facultyIds)
    for (const f of data ?? []) facultyNames.set(f.id, f.full_name)
  }
  const marks = marksRes.data ?? []
  const subjAtt = subjAttRes.data ?? []
  const feedbackDone = new Set((feedbackRes.data ?? []).map(r => r.audience.slice('FEEDBACK:'.length)))

  return {
    sessions: att.length,
    present: att.filter(a => present(a.status)).length,
    todayParts: byDate.get(today) ?? {},
    recent: [...byDate.entries()].slice(0, 12).map(([date, parts]) => ({ date, parts })).reverse(),
    cgpa: cgpaFromMarks(marks),
    courses: subjects.map(s => {
      const mine = marks.filter(m => m.subject_id === s.id)
      const sa = subjAtt.filter(a => a.subject_id === s.id)
      return {
        id: s.id, code: s.code, name: s.name, credits: Number(s.credits),
        faculty: s.faculty_id ? facultyNames.get(s.faculty_id) ?? null : null,
        marks: Object.fromEntries(mine.map(m => [m.exam_type, Number(m.marks_obtained)])),
        entered: mine.map(m => m.exam_type),
        subjectAtt: { n: sa.length, p: sa.filter(a => present(a.status)).length },
        feedbackDone: feedbackDone.has(s.id),
      }
    }),
    advisor: advisorRes.data?.full_name ?? null,
    hod: hodRes.data?.full_name ?? null,
    alerts: alertsRes.count ?? 0,
    week: weekRes[section] ?? {},
    leaves: (leavesRes.data ?? []) as Leave[],
    grievances: (grievRes.data ?? []) as Grievance[],
    notices, events, exams, docs,
    placements: (placementsRes.data ?? []) as Placement[],
  }
}

export default function StudentDashboard({ me, name, greeting }: { me: StudentMe | null; name: string; greeting: string }) {
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
  const final = isFinalYear(section)
  const today = todayName(now)
  const todayItems = d ? PERIODS.flatMap(p => { const s = d.week[today]?.[p.no]; return s ? [{ period: p.no, code: s.subjectCode, name: s.subjectName }] : [] }) : []
  const phase = dayPhase(now, d ? todayItems.length > 0 : true)
  const pct = d?.sessions ? d.present / d.sessions * 100 : null
  const status = pct == null ? null : attendanceStatus(pct)
  const head = d ? attendanceHeadroom(d.present, d.sessions) : { canMiss: 0, mustAttend: 0 }
  const pendingLeaves = d?.leaves.filter(l => l.status === 'PENDING').length ?? 0
  const openGrievances = d?.grievances.filter(g => g.status === 'OPEN' || g.status === 'IN_PROGRESS').length ?? 0
  const feedbackDue = d?.courses.filter(c => !c.feedbackDone) ?? []
  const examsSoon = d?.exams.filter(x => daysUntil(x.date) <= 7) ?? []
  const nextExam = d?.exams[0]

  const todos: Todo[] = d ? [
    pct == null
      ? { label: 'No attendance recorded yet this semester', href: '/dashboard/attendance', icon: ClipboardCheck, tone: 'done' }
      : pct < 75
        ? { label: `Attendance below 75% — attend the next ${head.mustAttend} session${head.mustAttend === 1 ? '' : 's'}`, detail: pct < 65 ? 'Below 65%: shortage of attendance (SA) under clause 7' : '65–74%: condonation needed for the semester-end examination', count: Math.round(pct), href: '/dashboard/attendance', icon: ClipboardCheck, tone: pct < 65 ? 'bad' : 'warn' }
        : { label: 'Attendance is at or above 75%', detail: `You can miss up to ${head.canMiss} more session${head.canMiss === 1 ? '' : 's'}`, href: '/dashboard/attendance', icon: ClipboardCheck, tone: 'done' },
    d.alerts
      ? { label: 'Attendance alerts to clear with your HOD', count: d.alerts, href: '/dashboard/alerts', icon: BellRing, tone: 'warn' }
      : { label: 'No pending attendance alerts', href: '/dashboard/alerts', icon: BellRing, tone: 'done' },
    ...(final ? [] : [feedbackDue.length
      ? { label: 'Course feedback to submit', detail: feedbackDue.map(c => c.code).join(', '), count: feedbackDue.length, href: '/dashboard/feedback', icon: Star, tone: 'info' as const }
      : { label: 'Feedback submitted for every course', href: '/dashboard/feedback', icon: Star, tone: 'done' as const }]),
    ...(examsSoon.length ? [{ label: 'Examinations in the next 7 days', detail: examsSoon.map(x => `${x.subject_code} · ${x.exam_type} · ${fmtDate(x.date)}`).join(', '), count: examsSoon.length, href: '/dashboard/examination', icon: CalendarRange, tone: 'warn' as const }] : []),
    ...(pendingLeaves ? [{ label: 'Leave applications awaiting approval', count: pendingLeaves, href: '/dashboard/leaves', icon: Heart, tone: 'info' as const }] : []),
    ...(openGrievances ? [{ label: 'Grievances being processed', count: openGrievances, href: '/dashboard/grievances', icon: MessageSquareWarning, tone: 'info' as const }] : []),
  ] : []
  const openTodos = todos.filter(t => t.tone !== 'done').length

  return (
    <div className="space-y-6">
      <Hero
        kicker={`${greeting}${name ? `, ${name}` : ''}`}
        title={me?.full_name ?? 'My Dashboard'}
        subtitle={[me?.register_number, `B.E. Computer Science & Engineering · ${section}`].filter(Boolean).join(' · ')}
        chips={<>
          <HeroChip tone="gold">Semester {sem} · {semesterTerm()} {academicYear(new Date(), true)}</HeroChip>
          <HeroChip tone={phase.kind === 'period' ? 'live' : 'plain'}>{phaseLabel(phase)}</HeroChip>
          {d?.advisor && <HeroChip><UserRound size={12} />Class advisor: {d.advisor}</HeroChip>}
          {d && <HeroChip>{openTodos ? `${openTodos} item${openTodos === 1 ? '' : 's'} need attention` : 'You are all caught up'}</HeroChip>}
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

      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {!d ? <KpiSkeleton count={6} /> : <>
          <Kpi label="Attendance" value={pct == null ? '—' : `${Math.round(pct)}%`} icon={ClipboardCheck} href="/dashboard/attendance" meter={pct}
            tone={status ? ({ good: 'good', warn: 'warn', bad: 'bad' } as const)[status.tone] : 'default'}
            sub={d.sessions ? `${d.present} of ${d.sessions} sessions this semester` : 'No attendance recorded yet'} />
          <Kpi label="CGPA" value={d.cgpa.totalCredits ? d.cgpa.cgpa.toFixed(2) : '—'} icon={Award} href="/dashboard/analytics"
            sub={d.cgpa.totalCredits ? `${d.cgpa.totalCredits} credits earned` : 'Published after semester results'} />
          <Kpi label="Courses" value={final ? '—' : d.courses.length} icon={BookOpen} href="/dashboard/subjects"
            sub={final ? 'To be added by the department' : `${d.courses.reduce((a, c) => a + c.credits, 0)} credits · semester ${sem}`} />
          <Kpi label="Classes today" value={todayItems.length} icon={CalendarClock} href="/dashboard/timetable"
            sub={todayItems.length ? todayItems.map(i => `P${i.period}`).join(' · ') : 'No classes today'} />
          <Kpi label="Next exam" value={nextExam ? fmtDate(nextExam.date) : '—'} icon={CalendarRange} href="/dashboard/examination"
            tone={nextExam && daysUntil(nextExam.date) <= 2 ? 'warn' : 'default'}
            sub={nextExam ? `${nextExam.subject_code} · ${nextExam.exam_type}` : 'None scheduled'} />
          <Kpi label="Alerts & requests" value={d.alerts + pendingLeaves + openGrievances} icon={BellRing} href="/dashboard/alerts"
            tone={d.alerts ? 'warn' : 'default'} sub={`${d.alerts} alert · ${pendingLeaves} leave · ${openGrievances} grievance`} />
        </>}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <TodoPanel items={todos} loading={!d} title="What needs your attention" />
        <Panel kicker="Regulations 2024 · clause 7" title="Attendance eligibility" href="/dashboard/attendance" hrefLabel="Details">
          {!d ? <div className="h-48 animate-pulse" /> : (
            <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
              <Ring value={pct} size={132} sub={status?.code === 'SA' ? 'Shortage' : status ? 'This semester' : 'No records'} />
              <div className="flex-1 space-y-3 w-full">
                {status ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
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
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel kicker={now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} title="Today’s timetable" href="/dashboard/timetable" hrefLabel="Full week">
          {!d ? <div className="h-48 animate-pulse" /> : (
            <Schedule items={todayItems} phase={phase} empty={<PanelEmpty icon={CalendarClock}>No classes on your timetable today.</PanelEmpty>} />
          )}
        </Panel>
        <Panel kicker="Last working days" title="Recent attendance" href="/dashboard/attendance" hrefLabel="Full record">
          {!d ? <div className="h-48 animate-pulse" /> : d.recent.length === 0 ? <PanelEmpty icon={ClipboardCheck}>No attendance recorded yet this semester.</PanelEmpty> : (
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-1 text-[11px]">
                  <tbody>
                    {[1, 2, 3].map(part => (
                      <tr key={part} className="!bg-transparent">
                        <td className="!p-0 pr-2 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">Part {['I', 'II', 'III'][part - 1]}</td>
                        {d.recent.map(r => {
                          const s = r.parts[part]
                          return <td key={r.date} title={`${fmtDate(r.date)} · Part ${part}: ${s ?? 'not marked'}`}
                            className={`!p-0 w-7 h-7 rounded ${!s ? 'bg-muted' : s === 'ABSENT' ? 'bg-red-700' : s === 'LATE' ? 'bg-amber-500' : 'bg-green-700'}`} />
                        })}
                      </tr>
                    ))}
                    <tr className="!bg-transparent">
                      <td />
                      {d.recent.map(r => <td key={r.date} className="!p-0 text-center text-[9.5px] text-muted-foreground whitespace-nowrap">{new Date(r.date).getDate()}/{new Date(r.date).getMonth() + 1}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-3">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-700" />Present</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" />Late</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-700" />Absent</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-muted" />Not marked</span>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel kicker={section} title="Weekly timetable" href="/dashboard/timetable" hrefLabel="Timetable">
        {!d ? <div className="h-56 animate-pulse" /> : (
          <WeekGrid week={d.week} phase={phase} emptyNote="The timetable for your section has not been published yet."
            cell={(day, p) => { const s = d.week[day]?.[p]; return s ? { code: s.subjectCode } : null }} />
        )}
      </Panel>

      <Panel kicker={`Semester ${sem} · R2024`} title="My courses" href="/dashboard/marks" hrefLabel="All marks">
        {!d ? <div className="h-48 animate-pulse" /> : final ? (
          <PanelEmpty icon={BookOpen}>Your batch follows the pre-autonomy curriculum. Your courses will be added by the department.</PanelEmpty>
        ) : d.courses.length === 0 ? (
          <PanelEmpty icon={BookOpen}>No courses have been added for your section this semester.</PanelEmpty>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
            {d.courses.map(c => {
              const type = courseType(c.code)
              const { internal: max } = markSplit(type)
              const internal = c.entered.some(e => e.startsWith('CIA')) ? internalMarks(c.code, c.marks) : null
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
                    <Pill tone={c.feedbackDone ? 'green' : 'gold'}>{c.feedbackDone ? 'Feedback given' : 'Feedback due'}</Pill>
                  </div>
                  <div className="mt-auto space-y-2">
                    <div>
                      <div className="flex justify-between text-[11.5px] mb-1"><span className="text-muted-foreground">Internal (CIA) so far</span><span className="font-semibold text-licet-indigo tabular-nums">{internal == null ? '—' : `${internal} / ${max}`}</span></div>
                      <Bar value={internal ?? 0} max={max || 1} />
                    </div>
                    <div className="flex justify-between text-[11.5px]"><span className="text-muted-foreground">Course attendance</span>{subPct == null ? <span className="text-muted-foreground">—</span> : <AttPct value={subPct} />}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <section className="grid gap-6 lg:grid-cols-3">
        <ExamsPanel items={d?.exams ?? []} loading={!d} showSection={false} />
        <Panel kicker="Clause 14" title="Grade record" href="/dashboard/analytics" hrefLabel="Analytics">
          {!d ? <div className="h-40 animate-pulse" /> : d.cgpa.semesters.length === 0 ? <PanelEmpty icon={Award}>Semester GPAs appear here once results are published.</PanelEmpty> : (
            <div className="p-5">
              <div className="flex items-end gap-3 h-36">
                {d.cgpa.semesters.map(s => (
                  <div key={s.semester} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <span className="text-[11.5px] font-semibold text-licet-indigo tabular-nums">{s.gpa.toFixed(2)}</span>
                    <div className="w-full max-w-[42px] rounded-t-md bg-gradient-to-t from-licet-indigo to-licet-violet" style={{ height: `${Math.max(6, s.gpa * 10)}%` }} />
                    <span className="text-[10.5px] text-muted-foreground">Sem {s.semester}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-muted-foreground mt-3">CGPA <b className="text-licet-indigo">{d.cgpa.cgpa.toFixed(2)}</b> over {d.cgpa.totalCredits} credits</p>
            </div>
          )}
        </Panel>
        <Panel kicker="My class" title={section || 'My class'}>
          <ul className="divide-y divide-border text-[13px]">
            {[
              { icon: Hash, label: 'Register no.', value: me?.register_number ?? '—' },
              { icon: IdCard, label: 'Roll no.', value: me?.roll_number ?? '—' },
              { icon: Mail, label: 'Email', value: me?.email ?? '—' },
              { icon: CalendarRange, label: 'Semester', value: `${sem} · ${semesterTerm()}` },
              { icon: UserRound, label: 'Class advisor', value: d?.advisor ?? 'To be assigned' },
              { icon: GraduationCap, label: 'Head of Dept.', value: d?.hod ?? '—' },
            ].map(r => (
              <li key={r.label} className="flex items-center gap-3 px-5 py-2.5">
                <r.icon size={15} className="text-licet-violet shrink-0" />
                <span className="w-28 text-muted-foreground shrink-0">{r.label}</span>
                <span className="text-licet-indigo font-medium truncate">{r.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <NoticesPanel items={d?.notices ?? []} loading={!d} />
        <EventsPanel items={d?.events ?? []} loading={!d} />
        <Panel kicker="Placement cell" title="Placement drives" href="/dashboard/placements">
          {!d ? <div className="h-40 animate-pulse" /> : d.placements.length === 0 ? <PanelEmpty icon={Briefcase}>No active placement drives.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {d.placements.map(p => (
                <ListRow key={p.id} href="/dashboard/placements">
                  <Initials name={p.company_name} className="w-8 h-8 !rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{p.company_name}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{p.role_title}{p.visit_date ? ` · ${fmtDate(p.visit_date)}` : ''}</p>
                  </div>
                  {p.package_lpa ? <Pill tone="green">{p.package_lpa} LPA</Pill> : null}
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <DocumentsPanel items={d?.docs ?? []} loading={!d} />
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
