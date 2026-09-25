"use client"

export const dynamic = "force-dynamic"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Mail, Phone, CalendarCheck, Award, CalendarMinus, AlertCircle, Briefcase, TrendingUp,
  Download, Loader2, UserRound, Scale, BookOpen,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { isTier1 } from "@/lib/roles"
import { semesterStart, fmtDate } from "@/lib/dashboard"
import { formatMobile } from "@/lib/utils"
import { courseResult, attendanceStatus, type MarkMap } from "@/lib/regulations"
import { buildWorkbook, downloadWorkbook, DATASETS } from "@/lib/export"
import { Kpi, Panel, PanelEmpty, Pill, Bar, AttPct, Ring } from "@/components/dashboard/widgets"
import { toast } from "@/components/toaster"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]
type Leave = Database["public"]["Tables"]["leaves"]["Row"]
type Offer = Database["public"]["Tables"]["placement_offers"]["Row"]
type Subject = { id: string; code: string; name: string; semester: number }
type Mark = { subject_id: string; exam_type: string; marks_obtained: number; max_marks: number }
type Alert = { id: string; date: string; alert_type: string; missed_parts: number[]; met_hod: boolean; cleared_at: string | null }
type Grievance = { id: string; category: string; subject_line: string; status: string; created_at: string }
type History = { from_section: string | null; to_section: string | null; from_sem: number | null; to_sem: number | null; academic_year: string | null; promoted_at: string | null }

const EXAM_PART: Record<string, string> = { CAT: "CAT", CT: "Class test", ACTIVITY: "Activity", LAB: "Lab", EXP: "Experiments", VIVA: "Viva", RECORD: "Record" }
const examLabel = (t: string) => t === "SEM_END" ? "Semester end" : t.replace(/^CIA(\d)_?(.*)$/, (_, n, part) => `CIA ${n}${part ? " " + (EXAM_PART[part] ?? part.toLowerCase()) : ""}`)
const LEAVE_TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red" } as const

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [me, setMe] = useState<AuthUser | null>(null)
  const [student, setStudent] = useState<Profile | null>(null)
  const [missing, setMissing] = useState(false)
  const [advisor, setAdvisor] = useState<string | null>(null)
  const [day, setDay] = useState<{ date: string; part: number; status: string }[]>([])
  const [subjAtt, setSubjAtt] = useState<{ subject_id: string; status: string }[]>([])
  const [subjects, setSubjects] = useState<Record<string, Subject>>({})
  const [marks, setMarks] = useState<Mark[]>([])
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [exporting, setExporting] = useState(false)

  const tier1 = me?.type === "staff" && isTier1(me.data)

  useEffect(() => {
    const stored = localStorage.getItem("licet_user")
    if (!stored) { router.push("/login"); return }
    const au = JSON.parse(stored) as AuthUser
    if (au.type !== "staff") { router.replace("/dashboard"); return }
    setMe(au)
  }, [router])

  useEffect(() => {
    if (!me || !id) return
    const from = semesterStart()
    ;(async () => {
      const { data: s } = await supabase.from("profiles").select("*").eq("id", id).eq("role", "STUDENT").maybeSingle()
      if (!s) { setMissing(true); return }
      setStudent(s)
      const [adv, dayRes, subjRes, marksRes, leavesRes, alertsRes, grvRes, histRes, offersRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("advisor_section", s.section ?? "").in("role", ["PROFESSOR", "HOD"]).limit(1),
        supabase.from("day_attendance").select("date, part, status").eq("student_id", id).gte("date", from).order("date", { ascending: false }).limit(2000),
        supabase.from("attendance").select("subject_id, status").eq("student_id", id).gte("date", from).limit(5000),
        supabase.from("marks").select("subject_id, exam_type, marks_obtained, max_marks").eq("student_id", id),
        supabase.from("leaves").select("*").eq("applicant_id", id).order("from_date", { ascending: false }),
        supabase.from("attendance_alerts").select("id, date, alert_type, missed_parts, met_hod, cleared_at").eq("student_id", id).order("date", { ascending: false }).limit(50),
        supabase.from("grievances").select("id, category, subject_line, status, created_at").eq("student_id", id).order("created_at", { ascending: false }),
        supabase.from("student_promotion_history").select("from_section, to_section, from_sem, to_sem, academic_year, promoted_at").eq("student_id", id).order("promoted_at", { ascending: false }),
        supabase.from("placement_offers").select("*").eq("student_id", id).order("offer_date", { ascending: false }),
      ])
      setAdvisor(adv.data?.[0]?.full_name ?? null)
      setDay(dayRes.data ?? [])
      setSubjAtt(subjRes.data ?? [])
      setMarks((marksRes.data ?? []) as Mark[])
      setLeaves(leavesRes.data ?? [])
      setAlerts((alertsRes.data ?? []) as Alert[])
      setGrievances(grvRes.data ?? [])
      setHistory(histRes.data ?? [])
      setOffers(offersRes.data ?? [])
      const subjIds = [...new Set([...(subjRes.data ?? []).map(r => r.subject_id), ...(marksRes.data ?? []).map(r => r.subject_id)])]
      if (subjIds.length) {
        const { data: subs } = await supabase.from("subjects").select("id, code, name, semester").in("id", subjIds)
        setSubjects(Object.fromEntries((subs ?? []).map(x => [x.id, x as Subject])))
      }
    })()
  }, [me, id])

  // ── Derived figures ──
  const present = day.filter(d => d.status === "PRESENT" || d.status === "LATE").length
  const dayPct = day.length ? (100 * present) / day.length : null
  const absences = day.filter(d => d.status === "ABSENT")
  const absentDays = new Set(absences.map(a => a.date)).size

  const subjectRows = useMemo(() => {
    const m = new Map<string, { total: number; present: number }>()
    for (const r of subjAtt) {
      const x = m.get(r.subject_id) ?? { total: 0, present: 0 }
      x.total++; if (r.status === "PRESENT" || r.status === "LATE" || r.status === "EXCUSED") x.present++
      m.set(r.subject_id, x)
    }
    return [...m.entries()].map(([sid, v]) => ({ sid, ...v, pct: (100 * v.present) / v.total }))
      .sort((a, b) => (subjects[a.sid]?.code ?? "").localeCompare(subjects[b.sid]?.code ?? ""))
  }, [subjAtt, subjects])

  const markGroups = useMemo(() => {
    const g = new Map<string, Mark[]>()
    for (const m of marks) g.set(m.subject_id, [...(g.get(m.subject_id) ?? []), m])
    return [...g.entries()].map(([sid, list]) => {
      const code = subjects[sid]?.code ?? ""
      const map: MarkMap = Object.fromEntries(list.map(m => [m.exam_type, Number(m.marks_obtained)]))
      return { sid, list, result: code ? courseResult(code, map) : null }
    }).sort((a, b) => (subjects[b.sid]?.semester ?? 0) - (subjects[a.sid]?.semester ?? 0) || (subjects[a.sid]?.code ?? "").localeCompare(subjects[b.sid]?.code ?? ""))
  }, [marks, subjects])

  const avgMarkPct = marks.length ? (100 * marks.reduce((s, m) => s + Number(m.marks_obtained), 0)) / marks.reduce((s, m) => s + Number(m.max_marks), 0) : null
  const openAlerts = alerts.filter(a => !a.cleared_at).length
  const bestOffer = offers.reduce<number | null>((b, o) => (o.package_lpa != null && (b == null || Number(o.package_lpa) > b) ? Number(o.package_lpa) : b), null)

  const exportStudent = async () => {
    if (!student) return
    setExporting(true)
    try {
      const { workbook } = await buildWorkbook({
        scope: { kind: "student", id: student.id, label: student.full_name },
        period: { from: null, to: null, label: "All records" },
        datasets: DATASETS.filter(d => !("departmentOnly" in d && d.departmentOnly)).map(d => d.id),
        generatedBy: me?.data.full_name ?? "",
      })
      downloadWorkbook(workbook, `${student.roll_number ?? student.full_name}_record.xlsx`.replace(/\s+/g, "_"))
      toast.success("Student record downloaded")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    }
    setExporting(false)
  }

  if (missing) return (
    <div className="p-6">
      <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
        <UserRound className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">This student record was not found. It may have been archived after graduation.</p>
        <Link href="/dashboard/students" className="inline-block mt-4 text-[13px] font-semibold text-licet-violet hover:underline">Back to student records</Link>
      </div>
    </div>
  )

  if (!student) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading student record…</div>
  )

  const status = dayPct == null ? null : attendanceStatus(dayPct)

  return (
    <div className="p-6 space-y-6">
      <Link href="/dashboard/students" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-licet-violet hover:text-licet-indigo">
        <ArrowLeft size={14} /> Student records
      </Link>

      {/* Identity */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-licet-indigo to-licet-violet text-white p-6 sm:p-7">
        <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center">
          <div className="self-start rounded-full bg-white p-1.5 shadow-lg shadow-black/20 shrink-0"><Ring value={dayPct} size={116} sub="attendance" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Student record</p>
            <h1 className="font-serif text-[32px] font-semibold leading-tight !text-white mt-1">{student.full_name}</h1>
            <p className="text-[13.5px] text-licet-cream/85 mt-1">
              {student.section} · Batch {student.batch_year ?? "—"}
              {student.roll_number && <> · Roll {student.roll_number}</>}
              {student.register_number && <> · Reg. {student.register_number}</>}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[13px]">
              <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 text-[#F8D88D] hover:underline"><Mail size={13} />{student.email}</a>
              {student.phone && <a href={`tel:+91${student.phone}`} className="inline-flex items-center gap-1.5 text-[#F8D88D] hover:underline"><Phone size={13} />{formatMobile(student.phone)}</a>}
              {student.parent_mobile && <a href={`tel:+91${student.parent_mobile}`} className="inline-flex items-center gap-1.5 text-[#F8D88D] hover:underline"><Phone size={13} />Parent / guardian {formatMobile(student.parent_mobile)}</a>}
            </div>
            <p className="text-[12.5px] text-licet-cream/75 mt-2">Class advisor: {advisor ?? "not assigned"}{!student.is_active && " · Account inactive"}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {status && <span className={`self-start lg:self-end text-[12px] font-semibold px-3 py-1 rounded-full ${status.tone === "good" ? "bg-green-100 text-green-900" : status.tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"}`}>{status.label}</span>}
            <button onClick={exportStudent} disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white text-licet-indigo text-[13px] font-semibold hover:bg-licet-cream disabled:opacity-60">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download full record (Excel)
            </button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Sessions this semester" value={day.length} sub={`${present} attended · ${absentDays} day${absentDays === 1 ? "" : "s"} with absence`} icon={CalendarCheck} meter={dayPct} />
        <Kpi label="Average marks" value={avgMarkPct == null ? "—" : `${Math.round(avgMarkPct)}%`} sub={`${marks.length} assessment${marks.length === 1 ? "" : "s"} recorded`} icon={Award} tone={avgMarkPct == null ? "default" : avgMarkPct >= 60 ? "good" : avgMarkPct >= 45 ? "warn" : "bad"} />
        <Kpi label="Leave applications" value={leaves.length} sub={`${leaves.filter(l => l.status === "PENDING").length} pending`} icon={CalendarMinus} />
        <Kpi label="Open alerts" value={openAlerts} sub={`${alerts.length} in total`} icon={AlertCircle} tone={openAlerts ? "bad" : "good"} />
        <Kpi label="Placement offers" value={offers.length} sub={bestOffer != null ? `Best ₹${bestOffer} LPA` : "None recorded"} icon={Briefcase} />
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        {/* Subject attendance */}
        <Panel kicker="This semester" title="Course-wise attendance">
          {subjectRows.length === 0 ? <PanelEmpty icon={CalendarCheck}>No course attendance recorded this semester.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {subjectRows.map(r => (
                <li key={r.sid} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate"><span className="font-semibold text-licet-indigo">{subjects[r.sid]?.code}</span> {subjects[r.sid]?.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{r.present}/{r.total} · <AttPct value={r.pct} /></span>
                  </div>
                  <div className="mt-1.5"><Bar value={r.pct} tone="att" /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Recent absences */}
        <Panel kicker="This semester" title="Recent absences">
          {absences.length === 0 ? <PanelEmpty icon={CalendarCheck}>No absences this semester.</PanelEmpty> : (
            <ul className="divide-y divide-border max-h-[340px] overflow-y-auto">
              {absences.slice(0, 40).map(a => (
                <li key={a.date + a.part} className="px-5 py-2.5 flex items-center justify-between text-[13px]">
                  <span>{fmtDate(a.date, true)}</span>
                  <Pill tone="red">Part {["I", "II", "III"][a.part - 1] ?? a.part}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Marks */}
      <Panel kicker="All semesters" title="Assessments & results">
        {markGroups.length === 0 ? <PanelEmpty icon={BookOpen}>No marks recorded yet.</PanelEmpty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5">Course</th><th className="px-3 py-2.5">Sem</th><th className="px-3 py-2.5">Assessments</th>
                  <th className="px-3 py-2.5">Internal</th><th className="px-3 py-2.5">Grade</th><th className="px-5 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {markGroups.map(({ sid, list, result }) => (
                  <tr key={sid} className="align-top">
                    <td className="px-5 py-3"><span className="font-semibold text-licet-indigo">{subjects[sid]?.code}</span><span className="block text-muted-foreground">{subjects[sid]?.name}</span></td>
                    <td className="px-3 py-3 tabular-nums">{subjects[sid]?.semester ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {list.map(m => <Pill key={m.exam_type} tone="indigo">{examLabel(m.exam_type)} {Number(m.marks_obtained)}/{Number(m.max_marks)}</Pill>)}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{result ? `${Math.round(result.internal)}/${result.internalMax}` : "—"}</td>
                    <td className="px-3 py-3 font-semibold">{result && !result.pending ? result.grade : "—"}</td>
                    <td className="px-5 py-3">{!result ? "—" : result.pending ? <Pill tone="neutral">Awaiting SEE</Pill> : result.passed ? <Pill tone="green">Pass</Pill> : <Pill tone="red">{result.reason ?? "Fail"}</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid xl:grid-cols-2 gap-6">
        <Panel kicker="History" title="Leave applications" href="/dashboard/leaves" hrefLabel="Leave management">
          {leaves.length === 0 ? <PanelEmpty icon={CalendarMinus}>No leave applications{tier1 ? "" : " visible to you"}.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {leaves.map(l => (
                <li key={l.id} className="px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{l.leave_type}</span>
                    <Pill tone={LEAVE_TONE[l.status]}>{l.status.toLowerCase()}</Pill>
                  </div>
                  <p className="text-muted-foreground">{fmtDate(l.from_date, true)} – {fmtDate(l.to_date, true)} · {l.reason}</p>
                  {l.review_note && <p className="text-[12px] text-licet-violet mt-0.5">Remark: {l.review_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel kicker="History" title="Attendance alerts" href="/dashboard/alerts" hrefLabel="All alerts">
          {alerts.length === 0 ? <PanelEmpty icon={AlertCircle}>No attendance alerts.</PanelEmpty> : (
            <ul className="divide-y divide-border max-h-[340px] overflow-y-auto">
              {alerts.map(a => (
                <li key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                  <span>{fmtDate(a.date, true)} · {a.alert_type.replace(/_/g, " ").toLowerCase()} {a.missed_parts?.length ? `(Part ${a.missed_parts.join(", ")})` : ""}</span>
                  {a.cleared_at ? <Pill tone="green">cleared</Pill> : a.met_hod ? <Pill tone="amber">met HOD</Pill> : <Pill tone="red">open</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel kicker="Training & placement" title="Placement offers" href="/dashboard/placements" hrefLabel="Placements">
          {offers.length === 0 ? <PanelEmpty icon={Briefcase}>No offers recorded.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {offers.map(o => (
                <li key={o.id} className="px-5 py-3 flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0"><span className="font-semibold text-licet-indigo">{o.company_name}</span> {o.role_title && <span className="text-muted-foreground">· {o.role_title}</span>}<span className="block text-[12px] text-muted-foreground">{fmtDate(o.offer_date, true)} · {o.offer_type.replace("_", " ").toLowerCase()}</span></span>
                  <span className="shrink-0 text-right">{o.package_lpa != null && <span className="block font-semibold tabular-nums">₹{Number(o.package_lpa)} LPA</span>}<Pill tone={o.status === "DECLINED" ? "red" : o.status === "OFFERED" ? "amber" : "green"}>{o.status.toLowerCase()}</Pill></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel kicker="Progression" title="Promotion history">
          {history.length === 0 ? <PanelEmpty icon={TrendingUp}>No promotions recorded yet.</PanelEmpty> : (
            <ul className="divide-y divide-border">
              {history.map((h, i) => (
                <li key={i} className="px-5 py-2.5 flex items-center justify-between text-[13px]">
                  <span>{h.from_section} → <span className="font-semibold">{h.to_section}</span> <span className="text-muted-foreground">(Sem {h.from_sem} → {h.to_sem})</span></span>
                  <span className="text-muted-foreground">{h.academic_year}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {tier1 && (
          <Panel kicker="Confidential" title="Grievances" href="/dashboard/grievances" hrefLabel="Grievance redressal">
            {grievances.length === 0 ? <PanelEmpty icon={Scale}>No grievances filed.</PanelEmpty> : (
              <ul className="divide-y divide-border">
                {grievances.map(g => (
                  <li key={g.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate"><span className="font-semibold">{g.category}</span> · {g.subject_line}</span>
                    <Pill tone={g.status === "RESOLVED" || g.status === "CLOSED" ? "green" : "amber"}>{g.status.replace("_", " ").toLowerCase()}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
