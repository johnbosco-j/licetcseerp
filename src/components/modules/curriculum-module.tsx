"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import {
  BookOpen, Plus, Pencil, Trash2, Save, X,
  ChevronDown, ChevronUp, Users, Loader2, AlertTriangle, Check
} from "lucide-react"

// ── Types ────────────────────────────────────────────────
interface Subject {
  id: string
  code: string
  name: string
  semester: number
  credits: number
  section: string | null
  academic_year: string | null
  faculty_id: string | null
  department_id: string | null
}

interface Faculty {
  id: string
  full_name: string
  email: string
}

interface FormState {
  code: string
  name: string
  credits: string
  faculty_id: string
}

const EMPTY_FORM: FormState = { code: "", name: "", credits: "3", faculty_id: "" }

const SECTIONS = [
  "I CSE-A", "I CSE-B",
  "II CSE-A", "II CSE-B",
  "III CSE-A", "III CSE-B",
  "IV CSE-A", "IV CSE-B",
]

// Each year has odd sem (Jul–Nov) and even sem (Jan–May)
const SEM_MAP: Record<string, [number, number]> = {
  "I CSE-A":   [1, 2],
  "I CSE-B":   [1, 2],
  "II CSE-A":  [3, 4],
  "II CSE-B":  [3, 4],
  "III CSE-A": [5, 6],
  "III CSE-B": [5, 6],
  "IV CSE-A":  [7, 8],
  "IV CSE-B":  [7, 8],
}

const SEM_LABEL: Record<number, string> = {
  1:"I", 2:"II", 3:"III", 4:"IV", 5:"V", 6:"VI", 7:"VII", 8:"VIII"
}

const CREDIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const DEPT_ID = "00000000-0000-0000-0000-000000000001"

// ── Component ────────────────────────────────────────────
function getCurrentSemParity(): "odd" | "even" {
  const m = new Date().getMonth() + 1
  return m >= 6 ? "odd" : "even"
}

export default function CurriculumModule() {
  const router = useRouter()

  const [authUser, setAuthUser]         = useState<AuthUser | null>(null)
  const [section, setSection]           = useState("II CSE-A")
  const [semParity, setSemParity] = useState<0 | 1>(
    () => (getCurrentSemParity() === "odd" ? 0 : 1)
  ) // 0=odd(Jul-Nov), 1=even(Jan-May)
  const [subjects, setSubjects]         = useState<Subject[]>([])
  const [faculty, setFaculty]           = useState<Faculty[]>([])
  const [loading, setLoading]           = useState(false)
  const [expanded, setExpanded]         = useState<string | null>(null)

  // Add/edit form
  const [showForm, setShowForm]         = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [formSaving, setFormSaving]     = useState(false)
  const [formError, setFormError]       = useState("")

  // Delete confirm
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // Inline faculty assignment
  const [assigningId, setAssigningId]   = useState<string | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)

  // Toast
  const [toast, setToast]               = useState("")

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 3000)
  }

  // Current semester number
  const currentSem = SEM_MAP[section]?.[semParity] ?? 1

  // ── Auth guard ─────────────────────────────────────────
  useEffect(() => {
    // dashboard/layout.tsx migrates "excelsior_user" -> "licet_user" and removes the old key,
    // so by the time this module mounts, "excelsior_user" no longer exists. Check "licet_user" first.
    const stored = localStorage.getItem("licet_user") || localStorage.getItem("excelsior_user")
    if (!stored) { router.push("/login"); return }
    const user = JSON.parse(stored) as AuthUser
    if (user.type !== "staff" || user.data.role !== "HOD") {
      router.push("/dashboard"); return
    }
    setAuthUser(user)
  }, [router])

  // ── Load faculty list ──────────────────────────────────
  useEffect(() => {
    if (!authUser) return
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "PROFESSOR")
      .order("full_name")
      .then(({ data }) => setFaculty((data as Faculty[]) ?? []))
  }, [authUser])

  // ── Load subjects for section+semester ────────────────
  const loadSubjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .eq("section", section)
      .eq("semester", currentSem)
      .order("code")
    if (!error) setSubjects((data as Subject[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (authUser) loadSubjects()
  }, [authUser, section, semParity])

  // ── Helpers ────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError("")
    setShowForm(true)
  }

  const openEdit = (s: Subject) => {
    setEditingId(s.id)
    setForm({
      code: s.code,
      name: s.name,
      credits: String(s.credits),
      faculty_id: s.faculty_id ?? "",
    })
    setFormError("")
    setShowForm(true)
    setExpanded(null)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError("")
  }

  const validateForm = () => {
    if (!form.code.trim()) return "Subject code is required."
    if (!form.name.trim()) return "Subject name is required."
    if (!form.credits || isNaN(Number(form.credits))) return "Valid credits required."
    // Check duplicate code in same section+sem (ignore self when editing)
    const dup = subjects.find(
      s => s.code.toUpperCase() === form.code.trim().toUpperCase() && s.id !== editingId
    )
    if (dup) return `Code "${form.code.trim().toUpperCase()}" already exists in this section/semester.`
    return ""
  }

  // ── Save (add or edit) ────────────────────────────────
  const saveSubject = async () => {
    const err = validateForm()
    if (err) { setFormError(err); return }
    setFormSaving(true)
    setFormError("")

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      credits: Number(form.credits),
      semester: currentSem,
      section,
      department_id: DEPT_ID,
      faculty_id: form.faculty_id || null,
      academic_year: new Date().getFullYear().toString(),
    }

    if (editingId) {
      const { error } = await (supabase.from("subjects") as any)
        .update(payload)
        .eq("id", editingId)
      if (error) { setFormError("Failed to update: " + error.message); setFormSaving(false); return }
      showToast("Subject updated successfully")
    } else {
      const { error } = await (supabase.from("subjects") as any)
        .insert(payload)
      if (error) { setFormError("Failed to add: " + error.message); setFormSaving(false); return }
      showToast("Subject added successfully")
    }

    setFormSaving(false)
    closeForm()
    loadSubjects()
  }

  // ── Delete ─────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from("subjects").delete().eq("id", deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { showToast("❌ Delete failed: " + error.message); return }
    showToast("Subject removed")
    setExpanded(null)
    loadSubjects()
  }

  // ── Assign faculty ─────────────────────────────────────
  const assignFaculty = async (subjectId: string, facultyId: string) => {
    setAssignSaving(true)
    const { error } = await (supabase.from("subjects") as any)
      .update({ faculty_id: facultyId || null })
      .eq("id", subjectId)
    setAssignSaving(false)
    if (error) { showToast("❌ Assignment failed"); return }
    showToast("Faculty assigned")
    setAssigningId(null)
    loadSubjects()
  }

  // ── Derived ────────────────────────────────────────────
  const totalCredits = subjects.reduce((s, x) => s + (x.credits ?? 0), 0)
  const facultyMap   = Object.fromEntries(faculty.map(f => [f.id, f]))

  if (!authUser) return null

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ padding: "32px 36px", maxWidth: "960px" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "72px", right: "24px", zIndex: 100,
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: "8px", padding: "12px 18px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          display: "flex", alignItems: "center", gap: "8px",
          fontSize: "13px", color: "#111827",
        }}>
          <Check size={15} style={{ color: "#16a34a" }} />
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <p style={{
          fontSize: "10px", fontWeight: 600, letterSpacing: "0.16em",
          color: "#1d3557", textTransform: "uppercase", margin: "0 0 8px",
        }}>
          HOD · Curriculum Management
        </p>
        <h2 style={{
          fontSize: "24px", fontWeight: 600, color: "#111827",
          margin: "0 0 4px", letterSpacing: "-0.01em",
        }}>
          Subject Allotment
        </h2>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
          Add, edit, remove subjects and assign faculty per section and semester.
        </p>
      </div>

      {/* Controls row */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        flexWrap: "wrap", marginBottom: "24px",
      }}>
        {/* Section picker */}
        <div>
          <p style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 6px" }}>
            Section
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)} style={{
                padding: "6px 12px", borderRadius: "6px",
                border: section === s ? "1.5px solid #1d3557" : "1px solid #e5e7eb",
                background: section === s ? "#1d3557" : "#ffffff",
                color: section === s ? "#ffffff" : "#374151",
                fontSize: "12px", fontWeight: section === s ? 600 : 400,
                cursor: "pointer", transition: "all 0.12s",
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Semester parity toggle */}
        <div style={{ marginLeft: "auto" }}>
          <p style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 6px" }}>
            Semester
          </p>
          <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: "7px", overflow: "hidden" }}>
            {[
              { label: `Sem ${SEM_LABEL[SEM_MAP[section]?.[0]]} (Jul–Nov)`, val: 0 },
              { label: `Sem ${SEM_LABEL[SEM_MAP[section]?.[1]]} (Jan–May)`, val: 1 },
            ].map(({ label, val }) => (
              <button key={val} onClick={() => setSemParity(val as 0 | 1)} style={{
                padding: "7px 16px", border: "none",
                background: semParity === val ? "#1d3557" : "#ffffff",
                color: semParity === val ? "#ffffff" : "#374151",
                fontSize: "12px", fontWeight: semParity === val ? 600 : 400,
                cursor: "pointer", transition: "all 0.12s",
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        background: "#ffffff", border: "1px solid #e5e7eb",
        borderRadius: "8px", padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <div style={{ display: "flex", gap: "28px" }}>
          <div>
            <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Section</p>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#111827", margin: 0 }}>{section}</p>
          </div>
          <div>
            <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Semester</p>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#111827", margin: 0 }}>
              Semester {SEM_LABEL[currentSem]}
            </p>
          </div>
          <div>
            <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Subjects</p>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#111827", margin: 0 }}>{subjects.length}</p>
          </div>
          <div>
            <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Credits</p>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#111827", margin: 0 }}>{totalCredits}</p>
          </div>
        </div>

        {/* Add button */}
        <button onClick={openAdd} style={{
          display: "flex", alignItems: "center", gap: "7px",
          padding: "9px 18px", borderRadius: "7px",
          background: "#1d3557", color: "#ffffff",
          border: "none", fontSize: "13px", fontWeight: 600,
          cursor: "pointer", transition: "background 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#16304d"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "#1d3557"}>
          <Plus size={15} /> Add Subject
        </button>
      </div>

      {/* ── Add/Edit Form ───────────────────────────────── */}
      {showForm && (
        <div style={{
          background: "#ffffff", border: "1.5px solid #1d3557",
          borderRadius: "10px", padding: "24px", marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111827", margin: 0 }}>
              {editingId ? "Edit Subject" : "Add New Subject"}
            </h3>
            <button onClick={closeForm} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: "14px", marginBottom: "14px" }}>
            {/* Code */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#374151", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
                Subject Code *
              </label>
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. CS24501"
                style={{
                  width: "100%", height: "38px", padding: "0 10px",
                  border: "1.5px solid #e5e7eb", borderRadius: "6px",
                  fontSize: "13px", color: "#111827", outline: "none",
                  boxSizing: "border-box", fontFamily: "monospace",
                  textTransform: "uppercase",
                }}
                onFocus={e => e.target.style.borderColor = "#1d3557"}
                onBlur={e => e.target.style.borderColor = "#e5e7eb"}
              />
            </div>

            {/* Name */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#374151", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
                Subject Name *
              </label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Data Structures and Algorithms"
                style={{
                  width: "100%", height: "38px", padding: "0 10px",
                  border: "1.5px solid #e5e7eb", borderRadius: "6px",
                  fontSize: "13px", color: "#111827", outline: "none",
                  boxSizing: "border-box", fontFamily: "inherit",
                }}
                onFocus={e => e.target.style.borderColor = "#1d3557"}
                onBlur={e => e.target.style.borderColor = "#e5e7eb"}
              />
            </div>

            {/* Credits */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#374151", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
                Credits *
              </label>
              <select
                value={form.credits}
                onChange={e => setForm({ ...form, credits: e.target.value })}
                style={{
                  width: "100%", height: "38px", padding: "0 8px",
                  border: "1.5px solid #e5e7eb", borderRadius: "6px",
                  fontSize: "13px", color: "#111827", outline: "none",
                  background: "#ffffff", fontFamily: "inherit",
                }}
                onFocus={e => e.target.style.borderColor = "#1d3557"}
                onBlur={e => e.target.style.borderColor = "#e5e7eb"}
              >
                {CREDIT_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Faculty assignment in form */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#374151", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
              Assign Faculty (optional)
            </label>
            <select
              value={form.faculty_id}
              onChange={e => setForm({ ...form, faculty_id: e.target.value })}
              style={{
                width: "100%", maxWidth: "420px", height: "38px", padding: "0 8px",
                border: "1.5px solid #e5e7eb", borderRadius: "6px",
                fontSize: "13px", color: "#111827", outline: "none",
                background: "#ffffff", fontFamily: "inherit",
              }}
              onFocus={e => e.target.style.borderColor = "#1d3557"}
              onBlur={e => e.target.style.borderColor = "#e5e7eb"}
            >
              <option value="">— Unassigned —</option>
              {faculty.map(f => (
                <option key={f.id} value={f.id}>{f.full_name} ({f.email})</option>
              ))}
            </select>
          </div>

          {/* Context info */}
          <div style={{
            padding: "8px 12px", borderRadius: "6px",
            background: "#f0f7ff", border: "1px solid #bfdbfe",
            fontSize: "12px", color: "#1d4ed8", marginBottom: "16px",
          }}>
            Adding to: <strong>{section}</strong> · Semester <strong>{SEM_LABEL[currentSem]}</strong>
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              padding: "10px 12px", borderRadius: "6px",
              background: "#fef2f2", border: "1px solid #fecaca",
              fontSize: "12px", color: "#dc2626", marginBottom: "14px",
              display: "flex", alignItems: "center", gap: "7px",
            }}>
              <AlertTriangle size={14} /> {formError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={saveSubject} disabled={formSaving} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "9px 20px", borderRadius: "7px",
              background: formSaving ? "#6b7280" : "#1d3557",
              color: "#ffffff", border: "none",
              fontSize: "13px", fontWeight: 600,
              cursor: formSaving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
              {formSaving
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                : <><Save size={14} /> {editingId ? "Update Subject" : "Add Subject"}</>
              }
            </button>
            <button onClick={closeForm} style={{
              padding: "9px 16px", borderRadius: "7px",
              background: "transparent", color: "#6b7280",
              border: "1px solid #e5e7eb", fontSize: "13px",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ───────────────────────── */}
      {deleteId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#ffffff", borderRadius: "12px",
            padding: "32px", maxWidth: "400px", width: "90%",
            textAlign: "center",
          }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#fef2f2", border: "1px solid #fecaca",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <Trash2 size={20} style={{ color: "#dc2626" }} />
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>
              Remove Subject?
            </h3>
            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 24px", lineHeight: 1.5 }}>
              This will permanently remove the subject from <strong>{section}</strong> Semester {SEM_LABEL[currentSem]}.
              Existing attendance and marks data will not be deleted.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={confirmDelete} disabled={deleting} style={{
                padding: "9px 20px", borderRadius: "7px",
                background: "#dc2626", color: "#ffffff",
                border: "none", fontSize: "13px", fontWeight: 600,
                cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}>
                {deleting ? "Removing…" : "Yes, Remove"}
              </button>
              <button onClick={() => setDeleteId(null)} style={{
                padding: "9px 16px", borderRadius: "7px",
                background: "transparent", color: "#374151",
                border: "1px solid #e5e7eb", fontSize: "13px",
                cursor: "pointer", fontFamily: "inherit",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subject List ────────────────────────────────── */}
      {loading ? (
        <div style={{
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: "8px", padding: "48px",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "10px", color: "#9ca3af", fontSize: "13px",
        }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          Loading subjects…
        </div>
      ) : subjects.length === 0 ? (
        <div style={{
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: "8px", padding: "64px 48px",
          textAlign: "center",
        }}>
          <BookOpen size={36} style={{ color: "#d1d5db", margin: "0 auto 16px", display: "block" }} />
          <p style={{ fontSize: "15px", fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            No subjects yet
          </p>
          <p style={{ fontSize: "13px", color: "#9ca3af", margin: "0 0 20px" }}>
            No subjects found for {section} · Semester {SEM_LABEL[currentSem]}
          </p>
          <button onClick={openAdd} style={{
            display: "inline-flex", alignItems: "center", gap: "7px",
            padding: "9px 18px", borderRadius: "7px",
            background: "#1d3557", color: "#ffffff",
            border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={14} /> Add First Subject
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {subjects.map((sub, idx) => {
            const isOpen = expanded === sub.id
            const assignedFaculty = sub.faculty_id ? facultyMap[sub.faculty_id] : null
            const isAssigning = assigningId === sub.id

            return (
              <div key={sub.id} style={{
                background: "#ffffff",
                border: isOpen ? "1.5px solid #1d3557" : "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}>
                {/* Row header */}
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "14px 18px", gap: "14px",
                }}>
                  {/* Index */}
                  <span style={{
                    width: "24px", height: "24px", borderRadius: "50%",
                    background: "#f1f5f9", color: "#475569",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: 600, flexShrink: 0,
                  }}>{idx + 1}</span>

                  {/* Code badge */}
                  <span style={{
                    fontFamily: "monospace", fontSize: "11px", fontWeight: 700,
                    padding: "3px 8px", borderRadius: "5px",
                    background: "#eff6ff", color: "#1d4ed8",
                    border: "1px solid #bfdbfe", flexShrink: 0,
                  }}>{sub.code}</span>

                  {/* Name */}
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#111827", flex: 1 }}>
                    {sub.name}
                  </span>

                  {/* Credits */}
                  <span style={{
                    fontSize: "11px", color: "#6b7280",
                    padding: "2px 8px", borderRadius: "4px",
                    background: "#f9fafb", border: "1px solid #e5e7eb",
                    flexShrink: 0,
                  }}>
                    {sub.credits} cr
                  </span>

                  {/* Faculty chip */}
                  <span style={{
                    fontSize: "11px", flexShrink: 0,
                    padding: "3px 10px", borderRadius: "5px",
                    background: assignedFaculty ? "#f0fdf4" : "#f9fafb",
                    color: assignedFaculty ? "#15803d" : "#9ca3af",
                    border: `1px solid ${assignedFaculty ? "#bbf7d0" : "#e5e7eb"}`,
                    maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {assignedFaculty ? assignedFaculty.full_name : "Unassigned"}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button onClick={() => openEdit(sub)} title="Edit" style={{
                      padding: "5px", borderRadius: "5px", border: "1px solid #e5e7eb",
                      background: "transparent", cursor: "pointer", color: "#6b7280",
                      display: "flex", transition: "all 0.12s",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#eff6ff"; (e.currentTarget as HTMLButtonElement).style.color = "#1d4ed8" }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280" }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(sub.id)} title="Remove" style={{
                      padding: "5px", borderRadius: "5px", border: "1px solid #e5e7eb",
                      background: "transparent", cursor: "pointer", color: "#6b7280",
                      display: "flex", transition: "all 0.12s",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; (e.currentTarget as HTMLButtonElement).style.color = "#dc2626" }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280" }}>
                      <Trash2 size={13} />
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : sub.id)} title="Details" style={{
                      padding: "5px", borderRadius: "5px", border: "1px solid #e5e7eb",
                      background: isOpen ? "#1d3557" : "transparent",
                      cursor: "pointer", color: isOpen ? "#ffffff" : "#6b7280",
                      display: "flex", transition: "all 0.12s",
                    }}>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div style={{
                    borderTop: "1px solid #e5e7eb",
                    padding: "16px 18px",
                    background: "#f9fafb",
                  }}>
                    <div style={{ display: "flex", gap: "32px", alignItems: "flex-start", flexWrap: "wrap" }}>

                      {/* Info grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "6px 24px" }}>
                        {[
                          ["Section", section],
                          ["Semester", `Semester ${SEM_LABEL[currentSem]}`],
                          ["Credits", `${sub.credits} credits`],
                          ["Code", sub.code],
                          ["Academic Year", sub.academic_year ?? "—"],
                          ["Subject ID", sub.id.slice(0, 8) + "…"],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                            <p style={{ fontSize: "12px", fontWeight: 500, color: "#374151", margin: 0, fontFamily: label === "Code" || label === "Subject ID" ? "monospace" : "inherit" }}>{val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Faculty assignment inline */}
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <p style={{ fontSize: "10px", color: "#9ca3af", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Faculty Assignment
                        </p>
                        {isAssigning ? (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <select
                              defaultValue={sub.faculty_id ?? ""}
                              onChange={async e => await assignFaculty(sub.id, e.target.value)}
                              disabled={assignSaving}
                              style={{
                                flex: 1, height: "34px", padding: "0 8px",
                                border: "1.5px solid #1d3557", borderRadius: "6px",
                                fontSize: "12px", color: "#111827", outline: "none",
                                background: "#ffffff", fontFamily: "inherit",
                              }}>
                              <option value="">— Unassigned —</option>
                              {faculty.map(f => (
                                <option key={f.id} value={f.id}>{f.full_name}</option>
                              ))}
                            </select>
                            <button onClick={() => setAssigningId(null)} style={{
                              padding: "6px", borderRadius: "6px",
                              border: "1px solid #e5e7eb", background: "transparent",
                              cursor: "pointer", color: "#6b7280", display: "flex",
                            }}>
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{
                              fontSize: "13px", fontWeight: 500,
                              color: assignedFaculty ? "#111827" : "#9ca3af",
                            }}>
                              {assignedFaculty
                                ? `${assignedFaculty.full_name} · ${assignedFaculty.email}`
                                : "No faculty assigned"}
                            </span>
                            <button onClick={() => setAssigningId(sub.id)} style={{
                              display: "flex", alignItems: "center", gap: "5px",
                              padding: "5px 10px", borderRadius: "5px",
                              border: "1px solid #e5e7eb", background: "#ffffff",
                              fontSize: "11px", color: "#374151", cursor: "pointer",
                            }}>
                              <Users size={12} /> Change
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  )
}