"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen, Users, CalendarClock, ClipboardCheck, Award, Heart, Lock, ShieldAlert, BellRing, KeyRound,
  AlertTriangle, UserCheck, Clock3, CalendarRange, NotebookPen, IdCard, Mail, BadgeCheck, GraduationCap,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { courseType } from "@/lib/regulations"
import {
  SECTIONS, PERIODS, currentSemester, semesterStart, dayPhase, loadWeekTimetables, loadSectionAttendance,
  loadStudentAttendance, loadUpcomingEvents, loadNotices, loadUpcomingExams, loadRecentDocuments, loadParentMobiles, todayName, fmtDate, fmtTime,
  type SectionAttendance, type StudentAttendance, type EventItem, type NoticeItem, type ExamItem, type DocItem, type WeekTimetable,
} from "@/lib/dashboard"
import { academicYear, semesterTerm } from "@/lib/utils"
import { Hero, HeroChip, HeroPanel, Kpi, KpiSkeleton, Panel, PanelEmpty, Bar, AttPct, Pill, Initials, ListRow, Schedule, phaseLabel, CallParent } from "./widgets"
import { NoticesPanel, EventsPanel, ExamsPanel, DocumentsPanel, TodoPanel, WeekGrid, daysUntil, type Todo } from "./panels"
import { DepartmentPeople } from "@/components/site/people"

type Subject = { id: string; code: string; name: string; semester: number; section: string; credits: number }
export type FacultyMe = {
  id: string; full_name: string; email: string; advisor_section: string | null
  employee_id?: string | null; designation?: string | null; can_reset_passwords?: boolean | null
}
type Leave = { id: string; leave_type: string; from_date: string; to_date: string; status: string; created_at: string }
type CourseRow = Subject & { strength: number; graded: number; assessments: string[]; locked: string[] }

const TYPE_LABEL: Record<string, string> = { THEORY: 'Theory', LAB_INTEGRATED: 'Theory + Lab', LAB: 'Laboratory', PROJECT: 'Project', FORMATION: 'Formation' }

interface FacultyData {
  subjects: CourseRow[]
  week: Record<string, WeekTimetable>
  sectionAtt: Record<string, SectionAttendance>
  lowInMyClasses: StudentAttendance[]
  classMobiles: Record<string, string>
  attendanceRecords: number
  advisor: null | { section: string; strength: number; low: StudentAttendance[]; alerts: number; mustChange: number; mobiles: Record<string, string> }
  hodName: string | null
  leaves: Leave[]
  notices: NoticeItem[]
  events: EventItem[]
  exams: ExamItem[]
  docs: DocItem[]
}

async function loadFaculty(me: FacultyMe): Promise<FacultyData> {
  const { data: allMine } = await supabase.from('subjects').select('id, code, name, semester, section, credits').eq('faculty_id', me.id)
  const subjects = (allMine ?? []).filter(s => SECTIONS.includes(s.section) && s.semester === currentSemester(s.section)) as Subject[]
  const ids = subjects.map(s => s.id)
  const mySections = [...new Set(subjects.map(s => s.section))]
  const sections = [...new Set([...mySections, ...(me.advisor_section ? [me.advisor_section] : [])])]
  const head = { count: 'exact' as const, head: true }

  const [studentsRes, marksRes, locksRes, week, sectionAtt, allAtt, attRes, leavesRes, hodRes, notices, events, exams, docs, alertsRes, mustRes] = await Promise.all([
    sections.length ? supabase.from('profiles').select('section').eq('role', 'STUDENT').eq('is_active', true).in('section', sections).range(0, 4999) : Promise.resolve({ data: [] as { section: string | null }[] }),
    ids.length ? supabase.from('marks').select('subject_id, student_id, exam_type').in('subject_id', ids).range(0, 19999) : Promise.resolve({ data: [] as { subject_id: string; student_id: string; exam_type: string }[] }),
    ids.length ? supabase.from('subject_locks').select('subject_id, lock_type').in('subject_id', ids) : Promise.resolve({ data: [] as { subject_id: string; lock_type: string }[] }),
    loadWeekTimetables(SECTIONS),
    loadSectionAttendance(),
    sections.length ? loadStudentAttendance() : Promise.resolve([] as StudentAttendance[]),
    supabase.from('day_attendance').select('id', head).eq('marked_by', me.id).gte('date', semesterStart()),
    supabase.from('leaves').select('id, leave_type, from_date, to_date, status, created_at').eq('applicant_id', me.id).order('created_at', { ascending: false }).limit(4),
    supabase.from('profiles').select('full_name').eq('role', 'HOD').eq('is_active', true).limit(1).maybeSingle(),
    loadNotices(['ALL', 'PROFESSOR', 'FACULTY', ...SECTIONS], 5),
    loadUpcomingEvents(4),
    loadUpcomingExams(sections.length ? sections : undefined, 5),
    loadRecentDocuments(undefined, 4),
    me.advisor_section ? supabase.from('attendance_alerts').select('id', head).eq('section', me.advisor_section).is('cleared_at', null) : Promise.resolve({ count: 0 }),
    me.advisor_section ? supabase.from('profiles').select('id', head).eq('role', 'STUDENT').eq('section', me.advisor_section).eq('must_change_password', true) : Promise.resolve({ count: 0 }),
  ])

  const strength: Record<string, number> = {}
  for (const r of studentsRes.data ?? []) if (r.section) strength[r.section] = (strength[r.section] ?? 0) + 1
  const marks = marksRes.data ?? []
  const low = allAtt.filter(s => s.sessions > 0 && s.pct < 75).sort((a, b) => a.pct - b.pct)
  const advisees = me.advisor_section ? low.filter(s => s.section === me.advisor_section) : []
  const lowInMyClasses = low.filter(s => mySections.includes(s.section))
  const mobiles = await loadParentMobiles([...new Set([...advisees, ...lowInMyClasses.slice(0, 15)].map(s => s.student_id))])

  return {
    subjects: subjects.map(s => {
      const m = marks.filter(x => x.subject_id === s.id)
      return {
        ...s,
        strength: strength[s.section] ?? 0,
        graded: new Set(m.map(x => x.student_id)).size,
        assessments: [...new Set(m.map(x => x.exam_type))],
        locked: (locksRes.data ?? []).filter(l => l.subject_id === s.id).map(l => l.lock_type),
      }
    }).sort((a, b) => a.section.localeCompare(b.section) || a.code.localeCompare(b.code)),
    week, sectionAtt,
    lowInMyClasses, classMobiles: mobiles,
    attendanceRecords: attRes.count ?? 0,
    advisor: me.advisor_section ? {
      section: me.advisor_section,
      strength: strength[me.advisor_section] ?? 0,
      low: advisees, mobiles,
      alerts: alertsRes.count ?? 0,
      mustChange: mustRes.count ?? 0,
    } : null,
    hodName: hodRes.data?.full_name ?? null,
    leaves: (leavesRes.data ?? []) as Leave[],
    notices, events, exams, docs,
  }
}

const ASSESSMENTS: [string, string][] = [['CIA1', 'CIA 1'], ['CIA2', 'CIA 2'], ['SEM_END', 'SEE']]

export default function FacultyDashboard({ me, name, greeting, embedded = false }: { me: FacultyMe | null; name: string; greeting: string; embedded?: boolean }) {
  const [d, setD] = useState<FacultyData | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!me) return
    loadFaculty(me).then(setD).catch(() => setError(true))
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [me])

  const ids = new Set(d?.subjects.map(s => s.id) ?? [])
  const today = todayName(now)

  // My slots across all section timetables
  const mySlot = (day: string, period: number) => {
    if (!d) return null
    for (const section of SECTIONS) {
      const s = d.week[section]?.[day]?.[period]
      if (s && ids.has(s.subjectId)) return { code: s.subjectCode, name: s.subjectName, section }
    }
    return null
  }
  const todayItems = PERIODS.flatMap(p => { const s = mySlot(today, p.no); return s ? [{ period: p.no, code: s.code, name: s.name, meta: s.section }] : [] })
  const weeklyLoad = d ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].reduce((a, day) => a + PERIODS.filter(p => mySlot(day, p.no)).length, 0) : 0
  const phase = dayPhase(now, d ? todayItems.length > 0 : true)
  const nextClass = todayItems.find(i => (phase.kind === 'period' && i.period >= phase.period.no) || (phase.kind === 'break' && i.period >= phase.next.no) || phase.kind === 'before')

  // Attendance still to be marked for my classes that have already started today
  const t = now.getHours() * 60 + now.getMinutes()
  const started = (no: number) => { const [h, m] = PERIODS[no - 1].start.split(':').map(Number); return t >= h * 60 + m }
  const unmarked = d ? todayItems.filter(i => started(i.period) && !(d.sectionAtt[i.meta]?.today_parts ?? []).includes(PERIODS[i.period - 1].part)) : []

  const mySections = [...new Set(d?.subjects.map(s => s.section) ?? [])]
  const students = mySections.reduce((a, s) => a + (d?.subjects.find(x => x.section === s)?.strength ?? 0), 0)
  const gradedPct = d && d.subjects.length ? Math.round(d.subjects.reduce((a, s) => a + (s.strength ? Math.min(1, s.graded / s.strength) : 0), 0) / d.subjects.length * 100) : null
  const noCia1 = d?.subjects.filter(s => !s.assessments.some(a => a.startsWith('CIA1'))) ?? []
  const partial = d?.subjects.filter(s => s.graded > 0 && s.graded < s.strength) ?? []
  const pendingLeaves = d?.leaves.filter(l => l.status === 'PENDING').length ?? 0
  const examsThisWeek = d?.exams.filter(x => daysUntil(x.date) <= 7) ?? []

  const todos: Todo[] = d ? [
    ...(d.subjects.length === 0 ? [{ label: 'No courses allotted to you this semester', detail: 'Course allotment is done by the HOD on the Subjects page', href: '/dashboard/subjects', icon: BookOpen, tone: 'info' as const }] : []),
    ...(d.subjects.length === 0 ? [] : [
    unmarked.length
      ? { label: 'Attendance to mark for today’s classes', detail: unmarked.map(u => `${u.meta} · P${u.period}`).join(', '), count: unmarked.length, href: '/dashboard/attendance', icon: ClipboardCheck, tone: 'bad' }
      : { label: 'Attendance for today’s classes is up to date', href: '/dashboard/attendance', icon: ClipboardCheck, tone: 'done' },
    partial.length
      ? { label: 'Courses with marks only partly entered', detail: partial.map(s => `${s.code} (${s.section})`).join(', '), count: partial.length, href: '/dashboard/marks', icon: Award, tone: 'warn' }
      : { label: 'No partly entered marks', href: '/dashboard/marks', icon: Award, tone: 'done' },
    noCia1.length
      ? { label: 'Courses without CIA 1 marks yet', detail: noCia1.map(s => `${s.code} (${s.section})`).join(', '), count: noCia1.length, href: '/dashboard/marks', icon: NotebookPen, tone: 'info' }
      : { label: 'CIA 1 marks entered for every course', href: '/dashboard/marks', icon: NotebookPen, tone: 'done' },
    ] as Todo[]),
    ...(d.advisor ? [
      d.advisor.alerts
        ? { label: `Attendance alerts to clear in ${d.advisor.section}`, count: d.advisor.alerts, href: '/dashboard/alerts', icon: BellRing, tone: 'warn' as const }
        : { label: `No open attendance alerts in ${d.advisor.section}`, href: '/dashboard/alerts', icon: BellRing, tone: 'done' as const },
      d.advisor.low.length
        ? { label: `Advisees below 75% attendance`, detail: 'Counsel them and inform parents', count: d.advisor.low.length, href: '/dashboard/analytics', icon: ShieldAlert, tone: 'warn' as const }
        : { label: 'All advisees at or above 75%', href: '/dashboard/analytics', icon: ShieldAlert, tone: 'done' as const },
    ] : []),
    ...(examsThisWeek.length ? [{ label: 'Examinations in the next 7 days', detail: examsThisWeek.map(x => `${x.subject_code} ${fmtDate(x.date)}`).join(', '), count: examsThisWeek.length, href: '/dashboard/examination', icon: CalendarRange, tone: 'info' as const }] : []),
    ...(pendingLeaves ? [{ label: 'Your leave applications awaiting approval', count: pendingLeaves, href: '/dashboard/leaves', icon: Heart, tone: 'info' as const }] : []),
  ] : []
  const openTodos = todos.filter(x => x.tone !== 'done').length

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex items-end justify-between gap-3 pt-2">
          <div>
            <span className="eyebrow">Teaching responsibilities</span>
            <h2 className="font-serif text-[28px] font-semibold leading-tight mt-1">My teaching</h2>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{phaseLabel(phase)}</p>
        </div>
      ) : (
        <Hero
          kicker={`${greeting}${name ? `, ${name}` : ''}`}
          title={me?.full_name ?? 'Faculty Dashboard'}
          subtitle={`${me?.designation ?? 'Faculty'} · Department of Computer Science & Engineering · ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
          chips={<>
            <HeroChip tone="gold">{semesterTerm()} · {academicYear(new Date(), true)}</HeroChip>
            <HeroChip tone={phase.kind === 'period' ? 'live' : 'plain'}>{phaseLabel(phase)}</HeroChip>
            {me?.advisor_section && <HeroChip>Class advisor · {me.advisor_section}</HeroChip>}
            {d && <HeroChip>{openTodos ? `${openTodos} item${openTodos === 1 ? '' : 's'} to do` : 'Nothing pending'}</HeroChip>}
          </>}
          actions={[
            { href: '/dashboard/attendance', label: 'Mark attendance' },
            { href: '/dashboard/marks', label: 'Enter marks' },
            { href: '/dashboard/timetable', label: 'Timetable' },
            { href: '/dashboard/notices', label: 'Post a notice' },
          ]}
          aside={
            <HeroPanel title={nextClass ? (phase.kind === 'period' && nextClass.period === phase.period.no ? 'Current class' : 'Next class') : 'Your classes'}>
              {!d ? <div className="h-[72px] animate-pulse rounded bg-white/10" /> : nextClass ? (
                <div>
                  <p className="font-serif text-[24px] font-semibold leading-tight text-white">{nextClass.name}</p>
                  <p className="text-[12.5px] text-licet-cream/80 mt-1">{nextClass.code} · {nextClass.meta} · Period {nextClass.period} · {fmtTime(PERIODS[nextClass.period - 1].start)}</p>
                </div>
              ) : (
                <p className="text-[13px] text-licet-cream/85">{todayItems.length ? 'No more classes today.' : 'No classes on your timetable today.'}</p>
              )}
            </HeroPanel>
          }
        />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 flex items-center gap-2">
          <AlertTriangle size={15} /> Some figures could not be loaded. Check your connection and refresh the page.
        </div>
      )}

      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {!d ? <KpiSkeleton count={6} /> : <>
          <Kpi label="My courses" value={d.subjects.length} icon={BookOpen} href="/dashboard/subjects"
            sub={d.subjects.length ? `${d.subjects.reduce((a, s) => a + Number(s.credits || 0), 0)} credits this semester` : 'No courses allotted yet'} />
          <Kpi label="Students taught" value={students} icon={Users} sub={mySections.length ? mySections.join(', ') : 'No sections yet'} />
          <Kpi label="Weekly load" value={weeklyLoad} icon={CalendarRange} href="/dashboard/timetable" sub="Periods per week on the timetable" />
          <Kpi label="Classes today" value={todayItems.length} icon={CalendarClock} href="/dashboard/timetable"
            sub={todayItems.length ? todayItems.map(i => `P${i.period}`).join(' · ') : 'Free day'} />
          <Kpi label="Marks entry" value={gradedPct == null ? '—' : `${gradedPct}%`} icon={Award} href="/dashboard/marks"
            tone={gradedPct != null && gradedPct < 100 ? 'warn' : 'default'} sub="Students with marks in your courses" />
          <Kpi label="Attendance marked" value={d.attendanceRecords.toLocaleString('en-IN')} icon={ClipboardCheck} href="/dashboard/attendance"
            sub="Session records this semester" />
        </>}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <TodoPanel items={todos} loading={!d} />
        <Panel kicker={now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} title="Today’s schedule" href="/dashboard/timetable" hrefLabel="Timetable">
          {!d ? <div className="h-56 animate-pulse" /> : (
            <Schedule items={todayItems} phase={phase} empty={<PanelEmpty icon={CalendarClock}>You have no classes on the timetable today.</PanelEmpty>} />
          )}
        </Panel>
      </section>

      <Panel kicker={`${weeklyLoad} periods a week`} title="My weekly timetable" href="/dashboard/timetable" hrefLabel="Full timetable">
        {!d ? <div className="h-56 animate-pulse" /> : (
          <WeekGrid week={Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].filter(day => SECTIONS.some(s => d.week[s]?.[day])).map(day => [day, {}]))}
            phase={phase} emptyNote="None of your courses appear on a section timetable yet."
            cell={(day, p) => { const s = mySlot(day, p); return s ? { code: s.code, sub: s.section } : null }} />
        )}
      </Panel>

      <Panel kicker={`${semesterTerm()} · ${academicYear()}`} title="My courses" href="/dashboard/marks" hrefLabel="Enter marks">
        {!d ? <div className="h-56 animate-pulse" /> : d.subjects.length === 0 ? (
          <PanelEmpty icon={BookOpen}>No courses have been allotted to you for this semester. The HOD allots courses from the Subjects page.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground bg-licet-paper/60 whitespace-nowrap">
                  <th className="px-5 py-2.5">Course</th>
                  <th className="px-3 py-2.5">Section</th>
                  <th className="px-3 py-2.5 w-[150px]">Class attendance</th>
                  <th className="px-3 py-2.5">Assessments</th>
                  <th className="px-5 py-2.5 w-[160px]">Marks entered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.subjects.map(s => {
                  const type = courseType(s.code)
                  const a = d.sectionAtt[s.section]
                  const pct = a?.sessions ? a.present / a.sessions * 100 : null
                  return (
                    <tr key={s.id} className="hover:bg-licet-cream/25">
                      <td className="px-5 py-3">
                        <p className="font-medium text-licet-indigo">{s.name}</p>
                        <p className="text-[11.5px] text-muted-foreground">{s.code} · {TYPE_LABEL[type] ?? type} · {s.credits} cr</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-licet-indigo">{s.section}</span>
                        <p className="text-[11.5px] text-muted-foreground">Sem {s.semester} · {s.strength} students</p>
                      </td>
                      <td className="px-3 py-3">
                        {pct == null ? <span className="text-[12px] text-muted-foreground">No records</span>
                          : <div className="flex items-center gap-2"><div className="flex-1"><Bar value={pct} tone="att" /></div><AttPct value={pct} /></div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ASSESSMENTS.map(([k, l]) => <Pill key={k} tone={s.assessments.some(x => x.startsWith(k)) ? 'green' : 'neutral'}>{l}</Pill>)}
                          {s.locked.length > 0 && <Pill tone="gold"><Lock size={10} />Locked</Pill>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><Bar value={s.graded} max={s.strength || 1} /></div>
                          <span className="text-[12px] tabular-nums text-muted-foreground">{s.graded}/{s.strength}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel kicker="Sections I teach" title="Class snapshot">
          {!d ? <div className="h-48 animate-pulse" /> : mySections.length === 0 ? <PanelEmpty icon={Users}>No sections yet.</PanelEmpty> : (
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              {mySections.map(section => {
                const a = d.sectionAtt[section]
                const pct = a?.sessions ? a.present / a.sessions * 100 : null
                return (
                  <div key={section} className="rounded-lg border border-border p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-licet-indigo">{section}</span>
                      <span className="text-[11.5px] text-muted-foreground">{d.subjects.find(s => s.section === section)?.strength ?? 0} students</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3"><div className="flex-1"><Bar value={pct ?? 0} tone="att" /></div><AttPct value={pct} /></div>
                    <div className="flex items-center justify-between mt-2.5 text-[11.5px]">
                      <span className="text-muted-foreground">{a?.below_75 ? <span className="text-red-800 font-semibold">{a.below_75} below 75%</span> : 'None below 75%'}</span>
                      <span className="flex gap-1">{[1, 2, 3].map(p => <span key={p} className={`w-6 h-5 rounded text-[9.5px] font-bold flex items-center justify-center ${a?.today_parts?.includes(p) ? 'bg-green-700 text-white' : 'bg-muted text-muted-foreground'}`}>P{p}</span>)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
        <Panel kicker="Regulations 2024 · clause 7" title="Students below 75% in my classes" href="/dashboard/analytics" hrefLabel="Analytics">
          {!d ? <div className="h-48 animate-pulse" /> : d.lowInMyClasses.length === 0 ? (
            <PanelEmpty icon={ShieldAlert}>No student in your sections is below 75% this semester.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border max-h-[320px] overflow-y-auto">
              {d.lowInMyClasses.slice(0, 15).map(s => (
                <li key={s.student_id} className="flex items-center gap-3 px-5 py-2.5">
                  <Initials name={s.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-licet-indigo truncate">{s.full_name}</p>
                    <p className="text-[11.5px] text-muted-foreground">{s.section} · {s.present}/{s.sessions} sessions</p>
                  </div>
                  <Pill tone={s.pct < 65 ? 'red' : 'amber'}>{s.pct < 65 ? 'SA' : 'Condonation'}</Pill>
                  <span className="w-11 text-right"><AttPct value={s.pct} /></span>
                  <CallParent mobile={d.classMobiles[s.student_id]} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {d?.advisor && (
        <Panel kicker="Class advisor" title={`${d.advisor.section} at a glance`} href="/dashboard/students" hrefLabel="Students">
          <div className="grid lg:grid-cols-[320px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
            <div className="p-5 grid grid-cols-2 gap-4">
              {(() => {
                const a = d.sectionAtt[d.advisor!.section]
                const pct = a?.sessions ? a.present / a.sessions * 100 : null
                return [
                  { icon: Users, label: 'Students', value: d.advisor!.strength, tone: '' },
                  { icon: UserCheck, label: 'Attendance', value: pct == null ? '—' : `${Math.round(pct)}%`, tone: pct == null ? '' : pct >= 75 ? 'text-green-800' : pct >= 65 ? 'text-amber-800' : 'text-red-800' },
                  { icon: BellRing, label: 'Open alerts', value: d.advisor!.alerts, tone: d.advisor!.alerts ? 'text-amber-800' : '' },
                  { icon: KeyRound, label: 'Default passwords', value: d.advisor!.mustChange, tone: '' },
                ]
              })().map(x => (
                <div key={x.label} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase text-muted-foreground"><x.icon size={12} />{x.label}</p>
                  <p className={`font-serif text-[26px] font-semibold leading-none mt-2 ${x.tone || 'text-licet-indigo'}`}>{x.value}</p>
                </div>
              ))}
              <div className="col-span-2 flex flex-wrap gap-3">
                <Link href="/dashboard/alerts" className="text-[12px] font-semibold text-licet-violet hover:underline">Clear alerts →</Link>
                <Link href="/dashboard/accounts" className="text-[12px] font-semibold text-licet-violet hover:underline">Reset a password →</Link>
              </div>
            </div>
            <div>
              <p className="px-5 pt-4 text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground">Advisees below 75% attendance</p>
              {d.advisor.low.length === 0 ? <PanelEmpty icon={ShieldAlert}>No student in {d.advisor.section} is below 75% this semester.</PanelEmpty> : (
                <ul className="divide-y divide-border max-h-[260px] overflow-y-auto">
                  {d.advisor.low.map(s => (
                    <li key={s.student_id} className="flex items-center gap-3 px-5 py-2.5">
                      <Initials name={s.full_name} />
                      <p className="flex-1 min-w-0 text-[13.5px] text-licet-indigo truncate">{s.full_name}</p>
                      <span className="text-[11.5px] text-muted-foreground">{s.present}/{s.sessions}</span>
                      <Pill tone={s.pct < 65 ? 'red' : 'amber'}>{s.pct < 65 ? 'SA' : 'Condonation'}</Pill>
                      <span className="w-11 text-right"><AttPct value={s.pct} /></span>
                      <CallParent mobile={d.advisor!.mobiles[s.student_id]} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      )}

      {!embedded && (
        <section className="grid gap-6 lg:grid-cols-3">
          <ExamsPanel items={d?.exams ?? []} loading={!d} />
          <NoticesPanel items={d?.notices ?? []} loading={!d} showAudience />
          <EventsPanel items={d?.events ?? []} loading={!d} />
        </section>
      )}

      <section className={`grid gap-6 ${embedded ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {!embedded && <DocumentsPanel items={d?.docs ?? []} loading={!d} />}
        <Panel kicker="Requests" title="My leave applications" href="/dashboard/leaves" actions={pendingLeaves > 0 ? <Pill tone="amber">{pendingLeaves} pending</Pill> : undefined}>
          {!d ? <div className="h-40 animate-pulse" /> : d.leaves.length === 0 ? <PanelEmpty icon={Heart}>You have not applied for leave.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {d.leaves.map(l => (
                <ListRow key={l.id} href="/dashboard/leaves">
                  <span className="w-8 h-8 rounded-lg bg-licet-cream text-licet-indigo flex items-center justify-center shrink-0"><Clock3 size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo">{l.leave_type}</p>
                    <p className="text-[11.5px] text-muted-foreground">{fmtDate(l.from_date)}{l.to_date !== l.from_date ? ` – ${fmtDate(l.to_date)}` : ''}</p>
                  </div>
                  <Pill tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'}>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Pill>
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>
        <Panel kicker="Profile" title="My details" href="/dashboard/change-password" hrefLabel="Change password">
          <ul className="divide-y divide-border text-[13px]">
            {[
              { icon: BadgeCheck, label: 'Designation', value: me?.designation ?? 'Faculty' },
              { icon: IdCard, label: 'Employee ID', value: me?.employee_id ?? '—' },
              { icon: Mail, label: 'Email', value: me?.email ?? '—' },
              { icon: GraduationCap, label: 'Class advisor', value: me?.advisor_section ?? 'Not assigned' },
              { icon: KeyRound, label: 'Password admin', value: me?.can_reset_passwords ? 'Yes' : 'No' },
              { icon: Users, label: 'Head of Department', value: d?.hodName ?? '—' },
            ].map(r => (
              <li key={r.label} className="flex items-center gap-3 px-5 py-2.5">
                <r.icon size={15} className="text-licet-violet shrink-0" />
                <span className="w-36 text-muted-foreground shrink-0">{r.label}</span>
                <span className="text-licet-indigo font-medium truncate">{r.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
      {!embedded && (
        <Panel kicker="Department of Computer Science & Engineering" title="Head of Department, Faculty & Staff" bodyClass="p-5">
          <DepartmentPeople compact />
        </Panel>
      )}
    </div>
  )
}
