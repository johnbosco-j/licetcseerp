// Excel export: gathers department data for a scope (department / section /
// student) and period, and builds one .xlsx workbook with a sheet per dataset.
// Everything is read through the signed-in user's own session, so database
// access rules apply: a student can only ever export their own records.

import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { courseResult, attendanceStatus } from "@/lib/regulations"
import type { MarkRow } from "@/lib/cia-scheme"

export type Scope =
  | { kind: "department" }
  | { kind: "section"; section: string }
  | { kind: "student"; id: string; label: string }

export type Period = { from: string | null; to: string | null; label: string }   // ISO dates, inclusive

export const DATASETS = [
  { id: "students",   label: "Student details",             hint: "Names, roll and register numbers, section, contact and parent / guardian mobile", staffOnly: true },
  { id: "attSummary", label: "Attendance summary",          hint: "Hours, attended, on duty, percentage and exam eligibility per student" },
  { id: "dayAtt",     label: "Attendance register",         hint: "Every class hour with course and status" },
  { id: "subjAtt",    label: "Course attendance",           hint: "Hours and percentage per student per course" },
  { id: "marks",      label: "Marks (all assessments)",     hint: "CIA components and semester-end marks" },
  { id: "results",    label: "Course results",              hint: "Internal, SEE, total, grade and result per course (Regulations 2024)" },
  { id: "leaves",     label: "Leave applications",          hint: "Type, dates, status and review" },
  { id: "grievances", label: "Grievances",                  hint: "Category, status and resolution" },
  { id: "alerts",     label: "Attendance alerts",           hint: "Absence alerts and when they were cleared" },
  { id: "promotion",  label: "Promotion history",           hint: "Year-to-year section changes" },
  { id: "offers",     label: "Placement offers",            hint: "Company, role, package and status of each offer" },
  { id: "courses",    label: "Courses & allotment",         hint: "Course list with allotted faculty", departmentOnly: true },
  { id: "finance",    label: "Finance ledger",              hint: "Department ledger entries", departmentOnly: true },
  { id: "inventory",  label: "Assets & inventory",          hint: "Department assets and service dates", departmentOnly: true },
  { id: "placements", label: "Placement drives",            hint: "Companies, roles and packages", departmentOnly: true },
] as const
export type DatasetId = typeof DATASETS[number]["id"]

type Row = Record<string, unknown>
type Progress = (msg: string) => void

const PAGE = 1000

// A Supabase query builder; typed loosely because tables are chosen at run time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any

/** Paginated read (Supabase returns at most 1000 rows per request). */
async function readAll(build: () => Query, onPage?: (n: number) => void): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    onPage?.(rows.length)
    if (!data || data.length < PAGE) break
  }
  return rows
}

/** Same, but restricted to a list of students (in chunks, to keep URLs short). */
async function readForStudents(ids: string[] | null, column: string, build: () => Query, onPage?: (n: number) => void): Promise<Row[]> {
  if (!ids) return readAll(build, onPage)
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    out.push(...await readAll(() => build().in(column, chunk), n => onPage?.(out.length + n)))
  }
  return out
}

const d = (v: unknown) => (v ? String(v).slice(0, 10) : "")
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "")
const cap = (s: unknown) => (s ? String(s).charAt(0) + String(s).slice(1).toLowerCase().replace(/_/g, " ") : "")

export interface ExportOptions {
  scope: Scope
  period: Period
  datasets: DatasetId[]
  generatedBy: string
  onProgress?: Progress
}

export async function buildWorkbook(opts: ExportOptions): Promise<{ workbook: XLSX.WorkBook; counts: Record<string, number> }> {
  const { scope, period, datasets, onProgress = () => {} } = opts
  const want = (id: DatasetId) => datasets.includes(id)
  const counts: Record<string, number> = {}
  const sheets: [string, Row[]][] = []

  // ── Students in scope ──
  onProgress("Reading student list…")
  let studentQuery: () => Query = () => supabase.from("profiles").select("*").eq("role", "STUDENT").order("section").order("roll_number")
  if (scope.kind === "section") { const s = scope.section; studentQuery = () => supabase.from("profiles").select("*").eq("role", "STUDENT").eq("section", s).order("roll_number") }
  if (scope.kind === "student") { const id = scope.id; studentQuery = () => supabase.from("profiles").select("*").eq("id", id) }
  const students = await readAll(studentQuery)
  const byId = new Map(students.map(s => [String(s.id), s]))
  const ids = scope.kind === "department" ? null : students.map(s => String(s.id))
  const who = (id: unknown) => {
    const s = byId.get(String(id))
    return { "Roll No": s?.roll_number ?? "", "Register No": s?.register_number ?? "", "Name": s?.full_name ?? "", "Section": s?.section ?? "" }
  }

  // Staff names (marked by, reviewed by, allotted faculty)
  const { data: staff } = await supabase.from("profiles").select("id, full_name").in("role", ["HOD", "PROFESSOR"])
  const staffName = new Map((staff ?? []).map(s => [s.id, s.full_name]))

  // Subjects (for codes and names)
  const needSubjects = want("subjAtt") || want("dayAtt") || want("marks") || want("results") || want("courses")
  const subjects = needSubjects ? await readAll(() => supabase.from("subjects").select("*").order("semester").order("code")) : []
  const subj = new Map(subjects.map(s => [String(s.id), s]))

  // Date columns compare as dates; timestamp columns use whole days in Indian Standard Time.
  const inRange = (q: Query, col: string, time = false): Query => {
    let r = q
    if (period.from) r = r.gte(col, time ? `${period.from}T00:00:00+05:30` : period.from)
    if (period.to) r = r.lte(col, time ? `${period.to}T23:59:59.999+05:30` : period.to)
    return r
  }

  if (want("students")) {
    sheets.push(["Students", students.map(s => ({
      ...who(s.id), "Email": s.email, "Batch": s.batch_year ?? "", "Parent / Guardian Mobile": s.parent_mobile ?? "",
      "Status": s.is_active ? "Active" : "Inactive",
    }))])
  }

  // ── Attendance ──
  if (want("dayAtt") || want("attSummary") || want("subjAtt")) {
    onProgress("Reading attendance register…")
    // One row per class hour; each student on its list was present unless marked absent.
    const sessions = await readAll(() => {
      let q = inRange(supabase.from("attendance_sessions").select("date, period_no, subject_id, label, roster, absent, on_duty, taken_by, status").order("date").order("period_no"), "date")
      if (ids && ids.length <= 150) q = q.overlaps("roster", ids)
      return q
    }, n => onProgress(`Reading attendance register… ${n.toLocaleString("en-IN")} hours`))
    // Students cannot read whole registers (they name classmates); their own hours come from my_attendance.
    if (scope.kind === "student" && sessions.length === 0) {
      const { data: terms } = await supabase.from("academic_terms").select("id, starts_on, ends_on")
      for (const t of (terms ?? []) as { id: string; starts_on: string | null; ends_on: string | null }[]) {
        if ((period.from && t.ends_on && t.ends_on < period.from) || (period.to && t.starts_on && t.starts_on > period.to)) continue
        const { data: mine } = await supabase.rpc("my_attendance", { p_term: t.id })
        for (const h of (mine ?? []) as { date: string; period_no: number; subject_id: string | null; label: string | null; present: boolean; on_duty: boolean }[]) {
          if ((period.from && h.date < period.from) || (period.to && h.date > period.to)) continue
          sessions.push({ date: h.date, period_no: h.period_no, subject_id: h.subject_id, label: h.label, roster: [scope.id],
            absent: h.present ? [] : [scope.id], on_duty: h.on_duty ? [scope.id] : [], taken_by: null })
        }
      }
    }
    const wanted = ids ? new Set(ids) : null
    const rows: { student_id: string; date: string; period: number; subject_id: string | null; label: string | null; status: "PRESENT" | "ABSENT" | "OD"; taken_by: unknown }[] = []
    for (const h of sessions) {
      const absent = new Set(h.absent as string[]), od = new Set((h.on_duty as string[] | null) ?? [])
      for (const sid of h.roster as string[]) {
        if (wanted && !wanted.has(sid)) continue
        rows.push({ student_id: sid, date: String(h.date), period: Number(h.period_no), subject_id: (h.subject_id as string | null) ?? null, label: (h.label as string | null) ?? null,
          status: absent.has(sid) ? "ABSENT" : od.has(sid) ? "OD" : "PRESENT", taken_by: h.taken_by })
      }
    }
    const courseOf = (r: { subject_id: string | null; label: string | null }) => { const c = r.subject_id ? subj.get(r.subject_id) : null; return { code: c?.code ?? "", name: c?.name ?? r.label ?? "" } }
    const statusText = { PRESENT: "Present", ABSENT: "Absent", OD: "On duty" }
    if (want("dayAtt")) {
      sheets.push(["Attendance register", rows.map(r => ({
        "Date": d(r.date), "Period": r.period, "Course Code": courseOf(r).code, "Course": courseOf(r).name, ...who(r.student_id),
        "Status": statusText[r.status], "Marked by": staffName.get(String(r.taken_by)) ?? "",
      }))])
    }
    if (want("attSummary")) {
      const agg = new Map<string, { n: number; p: number; od: number; a: number }>()
      for (const r of rows) {
        const x = agg.get(r.student_id) ?? { n: 0, p: 0, od: 0, a: 0 }
        x.n++; if (r.status === "ABSENT") x.a++; else { x.p++; if (r.status === "OD") x.od++ }
        agg.set(r.student_id, x)
      }
      sheets.push(["Attendance summary", students.map(s => {
        const x = agg.get(String(s.id))
        const pct = x?.n ? Math.round(x.p / x.n * 1000) / 10 : null
        const st = pct == null ? null : attendanceStatus(pct)
        return {
          ...who(s.id), "Hours": x?.n ?? 0, "Attended (incl. on duty)": x?.p ?? 0, "On duty": x?.od ?? 0, "Absent": x?.a ?? 0,
          "Attendance %": pct ?? "", "Eligibility": st ? (st.eligible === "YES" ? "Eligible" : st.eligible === "CONDONATION" ? "Condonation required" : "Shortage of attendance (SA)") : "No records",
        }
      })])
    }
    if (want("subjAtt")) {
      const agg = new Map<string, { student_id: string; subject_id: string | null; label: string | null; n: number; p: number }>()
      for (const r of rows) {
        const k = `${r.student_id}|${r.subject_id ?? r.label}`
        const x = agg.get(k) ?? { student_id: r.student_id, subject_id: r.subject_id, label: r.label, n: 0, p: 0 }
        x.n++; if (r.status !== "ABSENT") x.p++
        agg.set(k, x)
      }
      sheets.push(["Course attendance", [...agg.values()].map(x => ({
        ...who(x.student_id), "Course Code": courseOf(x).code, "Course": courseOf(x).name,
        "Hours": x.n, "Attended": x.p, "Attendance %": Math.round(x.p / x.n * 1000) / 10,
      }))])
    }
  }

  // ── Marks and results ──
  if (want("marks") || want("results")) {
    onProgress("Reading marks…")
    const rows = await readForStudents(ids, "student_id",
      () => inRange(supabase.from("marks").select("student_id, subject_id, exam_type, marks_obtained, max_marks, absent, faculty_id, recorded_at").order("recorded_at"), "recorded_at", true))
    if (want("marks")) {
      sheets.push(["Marks", rows.map(r => {
        const s = subj.get(String(r.subject_id))
        return {
          ...who(r.student_id), "Semester": s?.semester ?? "", "Course Code": s?.code ?? "", "Course": s?.name ?? "",
          "Assessment": String(r.exam_type).replace(/_/g, " "), "Marks": r.absent ? "AB" : Number(r.marks_obtained), "Out of": Number(r.max_marks),
          "Entered by": staffName.get(String(r.faculty_id)) ?? "", "Recorded": dt(r.recorded_at),
        }
      })])
    }
    if (want("results")) {
      const groups = new Map<string, MarkRow[]>()
      for (const r of rows) {
        const k = `${r.student_id}|${r.subject_id}`
        groups.set(k, [...(groups.get(k) ?? []), { exam_type: String(r.exam_type), marks_obtained: Number(r.marks_obtained), max_marks: Number(r.max_marks), absent: !!r.absent }])
      }
      sheets.push(["Course results", [...groups.entries()].map(([k, m]) => {
        const [sid, subId] = k.split("|"); const s = subj.get(subId); const res = courseResult(String(s?.code ?? ""), m, s?.cia_scheme)
        return {
          ...who(sid), "Semester": s?.semester ?? "", "Course Code": s?.code ?? "", "Course": s?.name ?? "", "Credits": s?.credits ?? "",
          "Internal": `${res.internal} / ${res.internalMax}`, "SEE": res.see == null ? "Not entered" : `${res.see} / ${res.seeMax}`,
          "Total": res.pending ? "" : res.total, "Grade": res.grade, "Result": res.pending ? "Pending SEE" : res.passed ? "Pass" : "Fail",
        }
      }).sort((a, b) => String(a["Roll No"]).localeCompare(String(b["Roll No"])) || String(a["Course Code"]).localeCompare(String(b["Course Code"])))])
    }
  }

  // ── Requests and records ──
  if (want("leaves")) {
    onProgress("Reading leave applications…")
    const build = () => {
      let q = supabase.from("leaves").select("*").order("from_date")
      if (period.from) q = q.gte("to_date", period.from)
      if (period.to) q = q.lte("from_date", period.to)
      return q
    }
    const rows = await readForStudents(ids, "applicant_id", build)
    sheets.push(["Leaves", rows.filter(r => scope.kind !== "department" || byId.has(String(r.applicant_id)) || staffName.has(String(r.applicant_id))).map(r => ({
      ...(byId.has(String(r.applicant_id)) ? who(r.applicant_id) : { "Roll No": "", "Register No": "", "Name": staffName.get(String(r.applicant_id)) ?? "", "Section": "Faculty" }),
      "Type": r.leave_type, "From": d(r.from_date), "To": d(r.to_date), "Reason": r.reason, "Status": cap(r.status),
      "Reviewed by": staffName.get(String(r.reviewed_by)) ?? "", "Review note": r.review_note ?? "", "Applied": dt(r.created_at),
    }))])
  }
  if (want("grievances")) {
    onProgress("Reading grievances…")
    const rows = await readForStudents(ids, "student_id", () => inRange(supabase.from("grievances").select("*").order("created_at"), "created_at", true))
    sheets.push(["Grievances", rows.map(r => ({
      ...who(r.student_id), "Raised": dt(r.created_at), "Category": r.category, "Subject": r.subject_line, "Description": r.description,
      "Status": cap(r.status), "Resolution": r.resolution ?? "", "Updated": dt(r.updated_at),
    }))])
  }
  if (want("alerts")) {
    onProgress("Reading attendance alerts…")
    const rows = await readForStudents(ids, "student_id", () => inRange(supabase.from("attendance_alerts").select("*").order("date"), "date"))
    sheets.push(["Attendance alerts", rows.map(r => ({
      "Date": d(r.date), ...who(r.student_id), "Type": cap(r.alert_type), "Parts missed": Array.isArray(r.missed_parts) ? (r.missed_parts as unknown[]).join(", ") : "",
      "Email sent": r.email_sent ? "Yes" : "No", "Met HOD": r.met_hod ? "Yes" : "No", "Cleared": dt(r.cleared_at), "Notes": r.notes ?? "",
    }))])
  }
  if (want("promotion")) {
    const rows = await readForStudents(ids, "student_id", () => inRange(supabase.from("student_promotion_history").select("*").order("promoted_at"), "promoted_at", true))
    sheets.push(["Promotion history", rows.map(r => ({
      ...who(r.student_id), "Academic Year": r.academic_year, "From": r.from_section, "To": r.to_section === "GRADUATED" ? "Graduated" : r.to_section,
      "From Semester": r.from_sem, "To Semester": r.to_section === "GRADUATED" ? "" : r.to_sem, "Date": dt(r.promoted_at),
    }))])
  }

  if (want("offers")) {
    onProgress("Reading placement offers…")
    // Department scope reads every offer, including those of graduates who are no longer on the rolls.
    const rows = await readForStudents(ids, "student_id", () => inRange(supabase.from("placement_offers").select("*").order("offer_date"), "offer_date"))
    sheets.push(["Placement offers", rows.map(r => ({
      "Roll No": r.roll_number ?? "", "Name": r.student_name, "Section": r.section ?? "", "Batch": r.batch_year ?? "",
      "Company": r.company_name, "Role": r.role_title ?? "", "Package (LPA)": r.package_lpa ?? "", "Type": cap(r.offer_type),
      "Status": cap(r.status), "Offer date": d(r.offer_date), "Notes": r.notes ?? "",
    }))])
  }

  // ── Department-level ──
  if (scope.kind === "department") {
    if (want("courses")) {
      sheets.push(["Courses", subjects.map(s => ({
        "Section": s.section, "Semester": s.semester, "Code": s.code, "Course": s.name, "Credits": s.credits,
        "Faculty": staffName.get(String(s.faculty_id)) ?? "Not allotted", "Academic Year": s.academic_year ?? "",
      }))])
    }
    if (want("finance")) {
      const rows = await readAll(() => inRange(supabase.from("finance_ledger").select("*").order("created_at"), "created_at", true))
      sheets.push(["Finance ledger", rows.map(r => ({
        "No.": r.sequence_no, "Date": dt(r.created_at), "Type": cap(r.txn_type), "Category": r.category, "Description": r.description,
        "Amount (₹)": Number(r.amount), "Reference": r.reference_no ?? "", "Entered by": staffName.get(String(r.created_by)) ?? "",
      }))])
    }
    if (want("inventory")) {
      const rows = await readAll(() => supabase.from("inventory").select("*").order("asset_tag"))
      sheets.push(["Inventory", rows.map(r => ({
        "Asset Tag": r.asset_tag, "Name": r.name, "Category": r.category, "Status": cap(r.status), "Location": r.location ?? "",
        "Purchased": d(r.purchase_date), "Value (₹)": r.purchase_value ?? "", "Next Service": d(r.next_service_date), "Notes": r.notes ?? "",
      }))])
    }
    if (want("placements")) {
      const rows = await readAll(() => supabase.from("placements").select("*").order("visit_date"))
      sheets.push(["Placements", rows.map(r => ({
        "Company": r.company_name, "Role": r.role_title, "Package (LPA)": r.package_lpa ?? "", "Visit Date": d(r.visit_date),
        "Active": r.is_active ? "Yes" : "No", "Apply Link": r.apply_url ?? "",
      }))])
    }
  }

  // ── Workbook ──
  onProgress("Building the Excel file…")
  const wb = XLSX.utils.book_new()
  const scopeLabel = scope.kind === "department" ? "Entire department" : scope.kind === "section" ? `Section ${scope.section}` : `Student: ${scope.label}`
  const summary: (string | number)[][] = [
    ["LICET Things — Department of Computer Science & Engineering"],
    ["Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai"],
    [],
    ["Scope", scopeLabel],
    ["Period", period.label],
    ["Generated", new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })],
    ["Generated by", opts.generatedBy],
    [],
    ["Sheet", "Rows"],
  ]
  for (const [name, rows] of sheets) { counts[name] = rows.length; summary.push([name, rows.length]) }
  summary.push([], ["Confidential: contains personal data of students. Share only for official department purposes."])
  const ws0 = XLSX.utils.aoa_to_sheet(summary)
  ws0["!cols"] = [{ wch: 24 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws0, "Summary")

  for (const [name, rows] of sheets) {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["No records for this scope and period"]])
    if (rows.length) {
      const headers = Object.keys(rows[0])
      ws["!cols"] = headers.map(h => ({ wch: Math.min(48, Math.max(h.length + 2, ...rows.slice(0, 300).map(r => String(r[h] ?? "").length + 1))) }))
      ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  return { workbook: wb, counts }
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { compression: true })
}
