"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { getActiveSemester } from '@/lib/semester';
import { Search, Edit2, Trash2, Plus, Loader2, Download, X, Users, AlertTriangle, Check } from "lucide-react"
import { addStudentAdmin, deleteStudentAdmin } from "@/app/actions"
import * as XLSX from "xlsx"

type Profile = Database['public']['Tables']['profiles']['Row']

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export function StudentsModule() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [students, setStudents]   = useState<Profile[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sectionFilter, setSectionFilter] = useState("ALL")
  const [isLoading, setIsLoading] = useState(true)
  const [isHOD, setIsHOD] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState("")
  const [editId, setEditId]     = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [form, setForm] = useState({
    full_name: '', email: '', section: 'I CSE-A', batch_year: new Date().getFullYear()
  })

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const user = JSON.parse(stored) as AuthUser
    setAuthUser(user)
    setIsHOD(user.type === 'staff' && user.data.role === 'HOD')
    loadStudents()
  }, [router])

  const loadStudents = async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('profiles').select('*').eq('role', 'STUDENT').order('full_name', { ascending: true })
    if (data) setStudents(data)
    setIsLoading(false)
  }

  const openAdd = () => {
    setForm({ full_name: '', email: '', section: 'I CSE-A', batch_year: new Date().getFullYear() })
    setEditId(null)
    setFormError("")
    setShowForm(true)
  }

  const openEdit = (student: Profile) => {
    setForm({
      full_name: student.full_name,
      email: student.email,
      section: student.section ?? 'I CSE-A',
      batch_year: student.batch_year ?? new Date().getFullYear()
    })
    setEditId(student.id)
    setFormError("")
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.full_name || !form.email || !form.section || !form.batch_year) return
    setSaving(true)
    setFormError("")

    if (editId) {
      const { error: updErr } = await supabase.from('profiles').update({
        full_name: form.full_name,
        section: form.section,
        batch_year: form.batch_year
      }).eq('id', editId)
      if (updErr) setFormError(updErr.message)
      else { setShowForm(false); loadStudents() }
    } else {
      const password = form.email.split('@')[0] + '123'
      const res = await addStudentAdmin({ ...form, password })
      if (res.error) setFormError(res.error)
      else { setShowForm(false); loadStudents() }
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This will also remove their attendance and marks records.`)) return
    setDeleteError("")
    setIsLoading(true)
    const res = await deleteStudentAdmin(id)
    if (res.error) { setDeleteError(res.error); setIsLoading(false) }
    else loadStudents()
  }

  const exportToExcel = () => {
    if (!students || students.length === 0) return
    const ws = XLSX.utils.json_to_sheet(students.map(s => ({
      Name: s.full_name || 'Unknown',
      Email: s.email || 'N/A',
      Section: s.section || 'Unassigned',
      Batch: s.batch_year || 'N/A'
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Students")
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = "Student_Directory.xlsx"
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); window.URL.revokeObjectURL(url)
  }

  const filtered = students.filter(s => {
    const matchSec = sectionFilter === 'ALL' || s.section === sectionFilter
    const matchSearch = s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchSec && matchSearch
  })

  return (
    <>
      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0a101d] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="font-mono text-[10px] text-cyan-500 uppercase tracking-widest">
                  // {editId ? 'EDIT' : 'ADD'} STUDENT
                </span>
                <h2 className="font-bold text-sm mt-1 text-white">
                  {editId ? 'Update Profile' : 'Register New Student'}
                </h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-mono text-xs text-slate-400">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                  placeholder="e.g. Abisharose S"
                  className="w-full h-10 px-3 bg-white/5 border border-white/10 rounded text-white font-mono text-sm focus:border-cyan-500/50 focus:outline-none transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-slate-400">Email Address *</label>
                <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  disabled={!!editId} placeholder="student@licet.ac.in"
                  className="w-full h-10 px-3 bg-white/5 border border-white/10 rounded text-white font-mono text-sm focus:border-cyan-500/50 focus:outline-none transition-colors disabled:opacity-40" />
                {!editId && (
                  <p className="font-mono text-[10px] text-slate-500">Default password: email prefix + '123'</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Section *</label>
                  <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}
                    className="w-full h-10 px-3 bg-white/5 border border-white/10 rounded text-white font-mono text-sm focus:border-cyan-500/50 focus:outline-none transition-colors">
                    {SECTIONS.map(s => <option key={s} value={s} className="bg-[#0a101d]">{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Batch Year *</label>
                  <input type="number" value={form.batch_year}
                    onChange={e => setForm({...form, batch_year: Number(e.target.value)})}
                    className="w-full h-10 px-3 bg-white/5 border border-white/10 rounded text-white font-mono text-sm focus:border-cyan-500/50 focus:outline-none transition-colors" />
                </div>
              </div>
              {formError && (
                <div className="flex items-start gap-2 font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {formError}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.full_name || !form.email}
                className="flex-1 h-10 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white font-mono text-xs rounded flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Student'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="flex-1 h-10 bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 font-mono text-xs rounded transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <span className="text-cyan-500 font-mono text-[10px] tracking-[0.2em] uppercase">// DATA NODE: PROFILES</span>
          <h2 className="text-3xl font-bold tracking-widest uppercase mt-1 text-white">Student Directory</h2>
          <p className="font-mono text-xs text-slate-400 mt-1">
            {students.length} students enrolled across {SECTIONS.length} sections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportToExcel} disabled={students.length === 0}
            className="px-4 py-3 bg-white/5 text-white border border-white/10 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Download className="w-4 h-4" /> Export Excel
          </button>
          {isHOD && (
            <button onClick={openAdd}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-cyan-500/40 hover:text-white transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Plus className="w-4 h-4" /> Add Student
            </button>
          )}
        </div>
      </div>

      {/* Delete error banner */}
      {deleteError && (
        <div className="mb-4 flex items-center gap-2 font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {deleteError}
          <button onClick={() => setDeleteError("")} className="ml-auto text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search + Section Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search student records..."
            className="w-full bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-xl h-14 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-light shadow-inner" />
        </div>
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
          className="h-14 px-4 bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-xl text-white font-mono text-sm focus:border-cyan-500/50 focus:outline-none transition-colors">
          <option value="ALL" className="bg-[#0a101d]">All Sections</option>
          {SECTIONS.map(s => <option key={s} value={s} className="bg-[#0a101d]">{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#050b14]/60 backdrop-blur-xl border border-white/10 rounded-[2rem] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.5)] w-full">
        <div className="overflow-x-auto w-full pb-4">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">#</th>
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Name</th>
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Email Identity</th>
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Section</th>
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Batch</th>
                {isHOD && <th className="px-6 py-5 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-cyan-400 font-mono text-xs uppercase tracking-widest">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Querying Database...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="font-mono text-sm text-slate-500">No students found</p>
                </td></tr>
              ) : filtered.map((student, idx) => (
                <tr key={student.id} className="hover:bg-white/[0.05] transition-colors group">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-6 py-4 text-sm text-white font-medium tracking-wide">{student.full_name || 'Unknown'}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-light tracking-wide">{student.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-white">
                      {student.section || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{student.batch_year ?? '—'}</td>
                  {isHOD && (
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(student)} title="Edit student"
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors border border-white/10">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(student.id, student.full_name)} title="Delete student"
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 hover:text-white transition-colors border border-red-500/30">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
