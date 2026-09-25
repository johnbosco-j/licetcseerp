"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Users, GraduationCap, BookOpen, ClipboardCheck, ShieldAlert, Award, Heart, MessageSquareWarning,
  BellRing, UserCog, KeyRound, Briefcase, Wallet, Boxes, History, CheckCircle2,
  AlertTriangle, CalendarCheck,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { loadDepartmentTotals, type DepartmentTotals } from "@/lib/cgpa"
import {
  SECTIONS, currentSemester, isFinalYear, isoDate, semesterStart, dayPhase, loadTodaysTimetables, loadSectionAttendance,
  loadStudentAttendance, loadUpcomingEvents, loadNotices, loadUpcomingExams, loadRecentDocuments, timeAgo, fmtDate, inr,
  type SectionAttendance, type StudentAttendance, type EventItem, type NoticeItem, type ExamItem, type DocItem, type Period, type Slot,
} from "@/lib/dashboard"
import { academicYear, semesterTerm } from "@/lib/utils"
import {
  Hero, HeroChip, HeroPanel, Kpi, KpiSkeleton, Panel, PanelEmpty, Bar, AttPct, Pill, Initials, ListRow, phaseLabel,
} from "./widgets"
import { NoticesPanel, EventsPanel, ExamsPanel, DocumentsPanel } from "./panels"

type Staff = { id: string; full_name: string; role: string; advisor_section: string | null; designation: string | null }
type Subject = { id: string; code: string; name: string; semester: number; section: string; faculty_id: string | null; credits: number }
type Leave = { id: string; leave_type: string; from_date: string; to_date: string; created_at: string; applicant_id: string; status: string }
type Grievance = { id: string; subject_line: string; category: string; status: string; created_at: string; student_id: string }
type Placement = { id: string; company_name: string; role_title: string; package_lpa: number | null; visit_date: string | null }
type Activity = { key: string; actor: string; text: string; at: string; count: number }

interface HodData {
  strength: Record<string, number>
  mustChange: number
  staff: Staff[]
  subjects: Subject[]
  sectionAtt: Record<string, SectionAttendance>
  lowStudents: StudentAttendance[]
  totals: DepartmentTotals | null
  pendingLeaves: (Leave & { name: string; who: string })[]
  staffOnLeave: string[]
  grievances: (Grievance & { name: string })[]
  grievanceCounts: Record<string, number>
  alerts: number
  events: EventItem[]
  notices: NoticeItem[]
  exams: ExamItem[]
  docs: DocItem[]
  placements: Placement[]
  finance: { credit: number; debit: number; entries: number }
  inventory: { total: number; maintenance: number; serviceDue: number }
  activity: Activity[]
  today: Record<string, { period: Period; slot: Slot }[]>
}

const TABLE_LABEL: Record<string, string> = {
  marks: 'marks', day_attendance: 'attendance', attendance: 'subject attendance', profiles: 'profiles',
  subjects: 'courses', leaves: 'leave applications', grievances: 'grievances', subject_locks: 'locks',
  finance_ledger: 'finance entries', announcements: 'notices / documents', attendance_alerts: 'attendance alerts',
  inventory: 'inventory', placements: 'placement drives', promotion_log: 'promotion',
}
const ACTION_LABEL: Record<string, string> = { INSERT: 'added', UPDATE: 'updated', DELETE: 'removed' }

async function loadHod(): Promise<HodData> {
  const today = isoDate()
  const head = { count: 'exact' as const, head: true }
  const [
    studentsRes, mustChangeRes, staffRes, subjectsRes, sectionAtt, allAtt, totals, leavesRes, onLeaveRes,
    grievRes, alertsRes, events, notices, placementsRes, financeRes, inventoryRes, auditRes, todayTT, exams, docs,
  ] = await Promise.all([
    supabase.from('profiles').select('section').eq('role', 'STUDENT').eq('is_active', true).range(0, 4999),
    supabase.from('profiles').select('id', head).eq('role', 'STUDENT').eq('must_change_password', true),
    supabase.from('profiles').select('id, full_name, role, advisor_section, designation').in('role', ['HOD', 'PROFESSOR']).eq('is_active', true).order('full_name'),
    supabase.from('subjects').select('id, code, name, semester, section, faculty_id, credits').range(0, 4999),
    loadSectionAttendance(),
    loadStudentAttendance(),
    loadDepartmentTotals().catch(() => null),
    supabase.from('leaves').select('id, leave_type, from_date, to_date, created_at, applicant_id, status').eq('status', 'PENDING').order('created_at').limit(50),
    supabase.from('leaves').select('applicant_id').eq('status', 'APPROVED').lte('from_date', today).gte('to_date', today),
    supabase.from('grievances').select('id, subject_line, category, status, created_at, student_id').order('created_at', { ascending: false }).range(0, 999),
    supabase.from('attendance_alerts').select('id', head).is('cleared_at', null),
    loadUpcomingEvents(4),
    loadNotices(['ALL', 'STUDENTS', 'PROFESSOR', 'FACULTY', ...SECTIONS], 5),
    supabase.from('placements').select('id, company_name, role_title, package_lpa, visit_date').eq('is_active', true).order('visit_date', { ascending: true, nullsFirst: false }).limit(4),
    supabase.from('finance_ledger').select('txn_type, amount').range(0, 9999),
    supabase.from('inventory').select('status, next_service_date').range(0, 9999),
    supabase.from('audit_log').select('at, actor, action, table_name').order('at', { ascending: false }).limit(300),
    loadTodaysTimetables(SECTIONS),
    loadUpcomingExams(undefined, 6),
    loadRecentDocuments(undefined, 5),
  ])

  const strength: Record<string, number> = Object.fromEntries(SECTIONS.map(s => [s, 0]))
  for (const r of studentsRes.data ?? []) if (r.section && r.section in strength) strength[r.section]++

  const staff = (staffRes.data ?? []) as Staff[]
  const staffName = new Map(staff.map(s => [s.id, s.full_name]))

  // Names for leave applicants and grievance authors (students or staff)
  const leaves = (leavesRes.data ?? []) as Leave[]
  const grievances = (grievRes.data ?? []) as Grievance[]
  const openGrievances = grievances.filter(g => g.status === 'OPEN' || g.status === 'IN_PROGRESS').slice(0, 4)
  const ids = [...new Set([...leaves.map(l => l.applicant_id), ...openGrievances.map(g => g.student_id)])].filter(id => !staffName.has(id))
  const people = new Map<string, { name: string; section: string | null }>()
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, full_name, section').in('id', ids)
    for (const p of data ?? []) people.set(p.id, { name: p.full_name, section: p.section })
  }
  const nameOf = (id: string) => staffName.get(id) ?? people.get(id)?.name ?? 'Unknown'
  const whoOf = (id: string) => staffName.has(id) ? 'Faculty' : people.get(id)?.section ?? 'Student'

  const grievanceCounts: Record<string, number> = {}
  for (const g of grievances) grievanceCounts[g.status] = (grievanceCounts[g.status] ?? 0) + 1

  let credit = 0, debit = 0
  for (const f of financeRes.data ?? []) {
    if (f.txn_type === 'CREDIT') credit += Number(f.amount); else debit += Number(f.amount)
  }
  const soon = new Date(); soon.setDate(soon.getDate() + 30)
  const inv = inventoryRes.data ?? []

  // Group bulk edits (e.g. a whole class's marks) into one line per actor/table/minute.
  const activity: Activity[] = []
  for (const a of auditRes.data ?? []) {
    const key = `${a.actor}|${a.table_name}|${a.action}|${a.at.slice(0, 16)}`
    const last = activity[activity.length - 1]
    if (last?.key === key) { last.count++; continue }
    if (activity.length >= 8) break
    activity.push({
      key, at: a.at, count: 1,
      actor: a.actor ? (staffName.get(a.actor) ?? people.get(a.actor)?.name ?? 'A user') : 'System',
      text: `${ACTION_LABEL[a.action] ?? a.action.toLowerCase()} ${TABLE_LABEL[a.table_name] ?? a.table_name.replace(/_/g, ' ')}`,
    })
  }

  return {
    strength,
    mustChange: mustChangeRes.count ?? 0,
    staff,
    subjects: (subjectsRes.data ?? []) as Subject[],
    sectionAtt,
    lowStudents: allAtt.filter(s => s.sessions > 0 && s.pct < 75).sort((a, b) => a.pct - b.pct),
    totals,
    pendingLeaves: leaves.map(l => ({ ...l, name: nameOf(l.applicant_id), who: whoOf(l.applicant_id) })),
    staffOnLeave: [...new Set((onLeaveRes.data ?? []).map(l => l.applicant_id))].filter(id => staffName.has(id)).map(id => staffName.get(id)!),
    grievances: openGrievances.map(g => ({ ...g, name: nameOf(g.student_id) })),
    grievanceCounts,
    alerts: alertsRes.count ?? 0,
    events, notices, exams, docs,
    placements: (placementsRes.data ?? []) as Placement[],
    finance: { credit, debit, entries: financeRes.data?.length ?? 0 },
    inventory: {
      total: inv.length,
      maintenance: inv.filter(i => i.status === 'MAINTENANCE').length,
      serviceDue: inv.filter(i => i.next_service_date && i.next_service_date <= isoDate(soon) && i.status !== 'RETIRED').length,
    },
    activity,
    today: todayTT,
  }
}

export default function HodDashboard({ name, greeting, designation }: { name: string; greeting: string; designation?: string | null }) {
  const [d, setD] = useState<HodData | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    loadHod().then(setD).catch(() => setError(true))
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const anyClassesToday = d ? Object.values(d.today).some(x => x.length > 0) : true
  const phase = dayPhase(now, anyClassesToday)

  // Derived figures
  const totalStudents = d ? Object.values(d.strength).reduce((a, b) => a + b, 0) : 0
  const faculty = d?.staff.filter(s => s.role === 'PROFESSOR') ?? []
  const advisors = new Map((d?.staff ?? []).filter(s => s.advisor_section).map(s => [s.advisor_section!, s.full_name]))
  const currentSubjects = (d?.subjects ?? []).filter(s => SECTIONS.includes(s.section) && !isFinalYear(s.section) && s.semester === currentSemester(s.section))
  const unallotted = currentSubjects.filter(s => !s.faculty_id)
  const semAtt = d ? Object.values(d.sectionAtt).reduce((acc, s) => ({ n: acc.n + s.sessions, p: acc.p + s.present }), { n: 0, p: 0 }) : { n: 0, p: 0 }
  const semAttPct = semAtt.n ? Math.round(semAtt.p / semAtt.n * 100) : null
  const below65 = d ? Object.values(d.sectionAtt).reduce((a, s) => a + s.below_65, 0) : 0
  const todayMarked = d ? Object.values(d.sectionAtt).reduce((acc, s) => ({ n: acc.n + s.today_sessions, p: acc.p + s.today_present }), { n: 0, p: 0 }) : { n: 0, p: 0 }

  // Parts whose teaching has already started today, per section (from its timetable)
  const t = now.getHours() * 60 + now.getMinutes()
  const started = (p: Period) => { const [h, m] = p.start.split(':').map(Number); return t >= h * 60 + m }
  const partsDue = (section: string) => [...new Set((d?.today[section] ?? []).map(x => x.period).filter(started).map(p => p.part))].sort()
  const sectionsUnmarked = d ? SECTIONS.filter(s => partsDue(s).some(p => !(d.sectionAtt[s]?.today_parts ?? []).includes(p))) : []

  const workload = faculty.map(f => {
    const subs = currentSubjects.filter(s => s.faculty_id === f.id)
    return { ...f, courses: subs.length, credits: subs.reduce((a, s) => a + Number(s.credits || 0), 0), sections: [...new Set(subs.map(s => s.section))] }
  }).sort((a, b) => b.courses - a.courses || a.full_name.localeCompare(b.full_name))

  const attention = d ? [
    { label: 'Leave applications awaiting approval', count: d.pendingLeaves.length, href: '/dashboard/leaves', icon: Heart, tone: 'warn' as const },
    { label: 'Open grievances', count: (d.grievanceCounts.OPEN ?? 0) + (d.grievanceCounts.IN_PROGRESS ?? 0), href: '/dashboard/grievances', icon: MessageSquareWarning, tone: 'warn' as const },
    { label: 'Attendance alerts to clear', count: d.alerts, href: '/dashboard/alerts', icon: BellRing, tone: 'warn' as const },
    { label: 'Sections with today’s attendance pending', count: sectionsUnmarked.length, href: '/dashboard/attendance', icon: CalendarCheck, tone: 'warn' as const },
    { label: 'Students below 75% attendance', count: d.lowStudents.length, href: '/dashboard/analytics', icon: ShieldAlert, tone: 'warn' as const },
    { label: 'Courses without an allotted faculty', count: unallotted.length, href: '/dashboard/subjects', icon: BookOpen, tone: 'info' as const },
    { label: 'Sections without a class advisor', count: SECTIONS.length - advisors.size, href: '/dashboard/accounts', icon: UserCog, tone: 'info' as const },
    { label: 'Students yet to set their own password', count: d.mustChange, href: '/dashboard/accounts', icon: KeyRound, tone: 'info' as const },
  ] : []
  const openItems = attention.filter(a => a.count > 0).length

  return (
    <div className="space-y-6">
      <Hero
        kicker={`${greeting}${name ? `, ${name}` : ''}`}
        title={<>Department of <span className="italic">Computer Science</span> &amp; Engineering</>}
        subtitle={`${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${designation ?? 'Head of Department'} · Department overview`}
        chips={<>
          <HeroChip tone="gold">{semesterTerm()} · {academicYear(new Date(), true)}</HeroChip>
          <HeroChip tone={phase.kind === 'period' ? 'live' : 'plain'}>{phaseLabel(phase)}</HeroChip>
          {d && d.staffOnLeave.length > 0 && <HeroChip>{d.staffOnLeave.length} faculty on leave today</HeroChip>}
        </>}
        actions={[
          { href: '/dashboard/attendance', label: 'Attendance' },
          { href: '/dashboard/leaves', label: 'Review leaves' },
          { href: '/dashboard/notices', label: 'Post a notice' },
          { href: '/dashboard/reports', label: 'Reports' },
        ]}
        aside={
          <HeroPanel title="Today at a glance">
            {!d ? <div className="h-[92px] animate-pulse rounded bg-white/10" /> : (
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { v: todayMarked.n ? `${Math.round(todayMarked.p / todayMarked.n * 100)}%` : '—', l: 'Present' },
                  { v: `${SECTIONS.length - sectionsUnmarked.length}/${SECTIONS.length}`, l: 'Sections up to date' },
                  { v: String(openItems), l: 'Items to act on' },
                ].map(x => (
                  <div key={x.l}>
                    <p className="font-serif text-[30px] font-semibold leading-none text-white">{x.v}</p>
                    <p className="text-[10.5px] text-licet-cream/75 mt-1.5 leading-tight">{x.l}</p>
                  </div>
                ))}
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

      {/* KPIs */}
      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {!d ? <KpiSkeleton /> : <>
          <Kpi label="Students" value={totalStudents} icon={Users} href="/dashboard/students"
            sub={['I', 'II', 'III', 'IV'].map(y => `${y}: ${SECTIONS.filter(s => s.startsWith(y + ' ')).reduce((a, s) => a + d.strength[s], 0)}`).join(' · ')} />
          <Kpi label="Faculty" value={faculty.length} icon={GraduationCap} href="/dashboard/accounts"
            sub={`${advisors.size} of ${SECTIONS.length} sections have a class advisor`} />
          <Kpi label="Courses this semester" value={currentSubjects.length} icon={BookOpen} href="/dashboard/subjects"
            tone={unallotted.length ? 'warn' : 'default'}
            sub={unallotted.length ? `${unallotted.length} awaiting faculty allotment` : 'All courses allotted'} />
          <Kpi label="Semester attendance" value={semAttPct == null ? '—' : `${semAttPct}%`} icon={ClipboardCheck} href="/dashboard/attendance-analysis"
            meter={semAttPct} sub={semAtt.n ? `${semAtt.n.toLocaleString('en-IN')} session records since semester start` : 'No attendance marked this semester'} />
          <Kpi label="Below 75%" value={d.lowStudents.length} icon={ShieldAlert} href="/dashboard/analytics"
            tone={d.lowStudents.length ? 'bad' : 'good'} sub={below65 ? `${below65} below 65% (SA, not eligible)` : 'Eligibility per Regulations 2024 cl. 7'} />
          <Kpi label="Assessment pass rate" value={d.totals?.passRate == null ? '—' : `${d.totals.passRate}%`} icon={Award} href="/dashboard/marks"
            sub={d.totals?.markEntries ? `Share of ${d.totals.markEntries.toLocaleString('en-IN')} mark entries scoring ≥ 45%` : 'No marks entered yet'} />
        </>}
      </section>

      {/* Attention + today's attendance */}
      <section className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Panel kicker="Action centre" title="Needs your attention"
          actions={d && <Pill tone={openItems ? 'amber' : 'green'}>{openItems ? `${openItems} open` : 'All clear'}</Pill>}>
          {!d ? <div className="p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div> : (
            <ul className="divide-y divide-border">
              {attention.map(a => (
                <ListRow key={a.label} href={a.href}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.count === 0 ? 'bg-green-50 text-green-700' : a.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-licet-cream text-licet-indigo'}`}>
                    {a.count === 0 ? <CheckCircle2 size={15} /> : <a.icon size={15} />}
                  </span>
                  <span className={`flex-1 text-[13.5px] ${a.count === 0 ? 'text-muted-foreground' : 'text-licet-indigo font-medium'}`}>{a.label}</span>
                  <span className={`min-w-8 h-6 px-2 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums ${a.count === 0 ? 'text-green-800' : a.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-licet-cream text-licet-indigo'}`}>{a.count}</span>
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>

        <Panel kicker={`${new Date().toLocaleDateString('en-IN', { weekday: 'long' })} · three-part attendance`} title="Today’s attendance by section" href="/dashboard/attendance-analysis" hrefLabel="Analysis">
          {!d ? <div className="p-5 grid grid-cols-2 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div> : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SECTIONS.map(section => {
                const a = d.sectionAtt[section]
                const scheduled = [...new Set((d.today[section] ?? []).map(x => x.period.part))]
                const due = partsDue(section)
                const pct = a?.today_sessions ? Math.round(a.today_present / a.today_sessions * 100) : null
                return (
                  <Link key={section} href="/dashboard/attendance" prefetch
                    className="group rounded-lg border border-border bg-white p-3 hover:border-licet-gold hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-bold text-licet-indigo">{section}</span>
                      <AttPct value={pct} />
                    </div>
                    <div className="flex gap-1 mt-2.5">
                      {([1, 2, 3] as const).map(part => {
                        const marked = a?.today_parts?.includes(part)
                        const isDue = due.includes(part)
                        const hasClass = scheduled.includes(part)
                        return (
                          <span key={part} title={`Part ${part}: ${marked ? 'marked' : isDue ? 'pending' : hasClass ? 'later today' : 'no class'}`}
                            className={`flex-1 h-6 rounded text-[10px] font-bold flex items-center justify-center border ${marked ? 'bg-green-700 border-green-700 text-white' : isDue ? 'bg-amber-50 border-amber-300 text-amber-800' : hasClass ? 'bg-white border-border text-muted-foreground' : 'bg-muted border-transparent text-muted-foreground/50'}`}>
                            P{part}
                          </span>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {d.strength[section]} students{a?.today_sessions ? ` · ${a.today_present}/${a.today_sessions} present` : ''}
                    </p>
                  </Link>
                )
              })}
              <div className="col-span-full flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-700" />Marked</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />Due, not marked</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-border" />Later today</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-muted" />No class</span>
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* Section overview */}
      <Panel kicker="All eight sections" title="Section overview" href="/dashboard/students" hrefLabel="Students">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground bg-licet-paper/60 whitespace-nowrap">
                <th className="px-5 py-2.5">Section</th>
                <th className="px-3 py-2.5">Semester</th>
                <th className="px-3 py-2.5 text-right">Students</th>
                <th className="px-3 py-2.5">Class advisor</th>
                <th className="px-3 py-2.5 text-right">Courses</th>
                <th className="px-3 py-2.5 w-[180px]">Semester attendance</th>
                <th className="px-3 py-2.5 text-right">Below 75%</th>
                <th className="px-5 py-2.5 text-right">Classes today</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SECTIONS.map(section => {
                const a = d?.sectionAtt[section]
                const pct = a?.sessions ? a.present / a.sessions * 100 : null
                const subs = currentSubjects.filter(s => s.section === section)
                const open = subs.filter(s => !s.faculty_id).length
                const final = isFinalYear(section)
                return (
                  <tr key={section} className="hover:bg-licet-cream/25">
                    <td className="px-5 py-3 font-semibold text-licet-indigo whitespace-nowrap">{section}</td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">Sem {currentSemester(section)}{final && <span className="ml-1.5"><Pill>Pre-R2024</Pill></span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{d ? d.strength[section] : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {advisors.get(section) ? <span className="text-licet-indigo">{advisors.get(section)}</span>
                        : d ? <Link href="/dashboard/accounts" className="text-amber-800 hover:underline">Not assigned</Link> : '—'}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {final ? <span className="text-muted-foreground">To be added</span>
                        : <>{subs.length}{open > 0 && <span className="ml-1.5"><Pill tone="amber">{open} unallotted</Pill></span>}</>}
                    </td>
                    <td className="px-3 py-3">
                      {pct == null ? <span className="text-muted-foreground text-[12px]">No records yet</span> : (
                        <div className="flex items-center gap-2"><div className="flex-1"><Bar value={pct} tone="att" /></div><AttPct value={pct} /></div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {a?.below_75 ? <span className="font-semibold text-red-800">{a.below_75}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{d ? (d.today[section]?.length || '—') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Students at risk + faculty workload */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel kicker="Regulations 2024 · clause 7" title="Students below 75% attendance" href="/dashboard/analytics" hrefLabel="Analytics">
          {!d ? <div className="h-48 animate-pulse" /> : d.lowStudents.length === 0 ? (
            <PanelEmpty icon={ShieldAlert}>Every student with recorded attendance is at or above 75% this semester.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
              {d.lowStudents.slice(0, 12).map(s => (
                <li key={s.student_id} className="flex items-center gap-3 px-5 py-2.5">
                  <Initials name={s.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{s.full_name}</p>
                    <p className="text-[11.5px] text-muted-foreground">{s.section} · {s.present}/{s.sessions} sessions</p>
                  </div>
                  <Pill tone={s.pct < 65 ? 'red' : 'amber'}>{s.pct < 65 ? 'SA' : 'Condonation'}</Pill>
                  <span className="w-12 text-right"><AttPct value={s.pct} /></span>
                </li>
              ))}
              {d.lowStudents.length > 12 && <li className="px-5 py-2.5 text-[12px] text-muted-foreground">and {d.lowStudents.length - 12} more</li>}
            </ul>
          )}
        </Panel>

        <Panel kicker={`${semesterTerm()} allotment`} title="Faculty workload" href="/dashboard/subjects" hrefLabel="Allot courses">
          {!d ? <div className="h-48 animate-pulse" /> : workload.length === 0 ? (
            <PanelEmpty icon={GraduationCap}>No faculty accounts yet.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
              {workload.map(f => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Initials name={f.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{f.full_name}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">
                      {[f.designation ?? 'Faculty', f.advisor_section && `Class advisor, ${f.advisor_section}`].filter(Boolean).join(' · ')}{f.sections.length ? ` · teaches ${f.sections.join(', ')}` : ''}
                    </p>
                  </div>
                  {f.courses === 0 ? <Pill>No courses</Pill> : <Pill tone="indigo">{f.courses} course{f.courses === 1 ? '' : 's'} · {f.credits} cr</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Requests: leaves, grievances */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel kicker="Awaiting approval" title="Leave applications" href="/dashboard/leaves">
          {!d ? <div className="h-40 animate-pulse" /> : d.pendingLeaves.length === 0 ? (
            <PanelEmpty icon={Heart}>No leave applications are waiting for you.{d.staffOnLeave.length ? ` On leave today: ${d.staffOnLeave.join(', ')}.` : ''}</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {d.pendingLeaves.slice(0, 6).map(l => (
                <ListRow key={l.id} href="/dashboard/leaves">
                  <Initials name={l.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-licet-indigo truncate">{l.name} <span className="text-muted-foreground font-normal">· {l.who}</span></p>
                    <p className="text-[11.5px] text-muted-foreground">{l.leave_type} · {fmtDate(l.from_date)}{l.to_date !== l.from_date ? ` – ${fmtDate(l.to_date)}` : ''}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(l.created_at)}</span>
                </ListRow>
              ))}
            </ul>
          )}
        </Panel>

        <Panel kicker="Student welfare" title="Grievances" href="/dashboard/grievances">
          {!d ? <div className="h-40 animate-pulse" /> : (
            <>
              <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
                {[['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed']].map(([k, l]) => (
                  <div key={k} className="px-3 py-3 text-center">
                    <p className={`font-serif text-[24px] font-semibold leading-none ${k === 'OPEN' && d.grievanceCounts[k] ? 'text-amber-800' : 'text-licet-indigo'}`}>{d.grievanceCounts[k] ?? 0}</p>
                    <p className="text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground mt-1">{l}</p>
                  </div>
                ))}
              </div>
              {d.grievances.length === 0 ? <PanelEmpty icon={MessageSquareWarning}>No open grievances.</PanelEmpty> : (
                <ul className="divide-y divide-border">
                  {d.grievances.map(g => (
                    <ListRow key={g.id} href="/dashboard/grievances">
                      <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0"><MessageSquareWarning size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-licet-indigo truncate">{g.subject_line || g.category}</p>
                        <p className="text-[11.5px] text-muted-foreground truncate">{g.name} · {g.category}</p>
                      </div>
                      <Pill tone={g.status === 'OPEN' ? 'amber' : 'indigo'}>{g.status === 'OPEN' ? 'Open' : 'In progress'}</Pill>
                    </ListRow>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>
      </section>

      {/* Examinations, notices, events */}
      <section className="grid gap-6 lg:grid-cols-3">
        <ExamsPanel items={d?.exams ?? []} loading={!d} />
        <NoticesPanel items={d?.notices ?? []} loading={!d} showAudience />
        <EventsPanel items={d?.events ?? []} loading={!d} />
      </section>

      {/* Placements, resources, documents */}
      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel kicker="Department" title="Placements & resources">
          {!d ? <div className="h-40 animate-pulse" /> : (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-3 divide-x divide-border">
                <Link href="/dashboard/finance" className="px-4 py-3 hover:bg-licet-cream/30">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase text-muted-foreground"><Wallet size={12} />Balance</p>
                  <p className={`font-serif text-[20px] font-semibold mt-1 ${d.finance.credit - d.finance.debit < 0 ? 'text-red-800' : 'text-licet-indigo'}`}>{inr(d.finance.credit - d.finance.debit)}</p>
                  <p className="text-[11px] text-muted-foreground">{d.finance.entries} ledger entries</p>
                </Link>
                <Link href="/dashboard/inventory" className="px-4 py-3 hover:bg-licet-cream/30">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase text-muted-foreground"><Boxes size={12} />Assets</p>
                  <p className="font-serif text-[20px] font-semibold mt-1 text-licet-indigo">{d.inventory.total}</p>
                  <p className={`text-[11px] ${d.inventory.maintenance + d.inventory.serviceDue ? 'text-amber-800' : 'text-muted-foreground'}`}>{d.inventory.maintenance} in maintenance · {d.inventory.serviceDue} service due</p>
                </Link>
                <Link href="/dashboard/placements" className="px-4 py-3 hover:bg-licet-cream/30">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase text-muted-foreground"><Briefcase size={12} />Drives</p>
                  <p className="font-serif text-[20px] font-semibold mt-1 text-licet-indigo">{d.placements.length}</p>
                  <p className="text-[11px] text-muted-foreground">active placement drives</p>
                </Link>
              </div>
              {d.placements.length === 0 ? <PanelEmpty icon={Briefcase}>No active placement drives.</PanelEmpty> : (
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
            </div>
          )}
        </Panel>
        <DocumentsPanel items={d?.docs ?? []} loading={!d} />
      </section>

      {/* Audit trail */}
      <Panel kicker="Examination Policy §16 · audit trail" title="Recent activity" href="/dashboard/audit" hrefLabel="Audit log">
        {!d ? <div className="h-32 animate-pulse" /> : d.activity.length === 0 ? <PanelEmpty icon={History}>No recorded changes yet.</PanelEmpty> : (
          <ul className="grid md:grid-cols-2 divide-y md:divide-y-0 divide-border">
            {d.activity.map((a, i) => (
              <li key={`${a.key}-${i}`} className={`flex items-center gap-3 px-5 py-2.5 ${i >= 2 ? 'md:border-t md:border-border' : ''} ${i % 2 === 1 ? 'md:border-l md:border-border' : ''}`}>
                <span className="w-2 h-2 rounded-full bg-licet-gold shrink-0" />
                <p className="flex-1 min-w-0 text-[13px] text-licet-indigo truncate">
                  <span className="font-semibold">{a.actor}</span> {a.text}{a.count > 1 ? ` (${a.count} entries)` : ''}
                </p>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[11px] text-muted-foreground text-center">
        Semester figures count attendance from {fmtDate(semesterStart(), true)} · eligibility bands follow LICET Regulations 2024
      </p>
    </div>
  )
}
