"use client"
import { toTitleCase } from "@/lib/utils"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Search, Edit2, Trash2, Loader2, Users, AlertTriangle, Check } from "lucide-react"
import { addStudentAdmin, deleteStudentAdmin } from "@/app/actions"

type Profile = Database['public']['Tables']['profiles']['Row']

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export default function StudentsPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [sectionFilter, setSectionFilter] = useState("ALL")
  
  // Form State
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState("")
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState({ full_name: '', email: '', section: 'I CSE-A', batch_year: new Date().getFullYear() })

  const isHOD = authUser?.type === 'staff' && authUser.data.role === 'HOD'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type === 'student') { router.push('/dashboard'); return } // Restrict access
    loadStudents()
  }, [router])

  const loadStudents = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles')
      .select('*')
      .eq('role', 'STUDENT')
      .order('full_name')
    if (data) setStudents(data)
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.full_name || !form.email || !form.section || !form.batch_year) return
    setSaving(true)
    setError("")

    if (editId) {
      // Update existing profile
      const { error: updErr } = await supabase.from('profiles').update({
        full_name: form.full_name,
        section: form.section,
        batch_year: form.batch_year
      }).eq('id', editId)

      if (updErr) setError(updErr.message)
      else {
        setShowForm(false)
        loadStudents()
      }
    } else {
      // Add new student via Server Action
      const password = form.email.split('@')[0] + '123' // Default password
      const res = await addStudentAdmin({ ...form, password })
      
      if (res.error) setError(res.error)
      else {
        setShowForm(false)
        loadStudents()
      }
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${name}? This will also delete their attendance and marks.`)) return
    
    setLoading(true)
    const res = await deleteStudentAdmin(id)
    if (res.error) { setError(res.error); setLoading(false) }
    else loadStudents()
  }

  const openEdit = (student: Profile) => {
    setForm({
      full_name: student.full_name,
      email: student.email,
      section: student.section ?? 'I CSE-A',
      batch_year: student.batch_year ?? new Date().getFullYear()
    })
    setEditId(student.id)
    setShowForm(true)
  }

  const openAdd = () => {
    setForm({ full_name: '', email: '', section: 'I CSE-A', batch_year: new Date().getFullYear() })
    setEditId(null)
    setShowForm(true)
  }

  const filtered = students.filter(s => {
    const matchSec = sectionFilter === 'ALL' || s.section === sectionFilter
    const matchSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) || 
                        s.email.toLowerCase().includes(search.toLowerCase())
    return matchSec && matchSearch
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: STUDENTS</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Student Directory</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">Manage student profiles, sections, and access</p>
        </div>
        {isHOD && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" /> Add Student
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full h-10 pl-9 pr-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
        </div>
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
          className="h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
          <option value="ALL">All Sections</option>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-primary">// {editId ? 'EDIT' : 'ADD'} STUDENT</span>
                <h2 className="font-bold text-sm mt-1">{editId ? 'Update Profile' : 'Register New Student'}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">Email Address *</label>
                <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={!!editId}
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none disabled:opacity-50" />
                {!editId && <p className="font-mono text-[10px] text-muted-foreground">Default password will be email prefix + '123'</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Section *</label>
                  <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}
                    className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Batch Year *</label>
                  <input type="number" value={form.batch_year} onChange={e => setForm({...form, batch_year: Number(e.target.value)})}
                    className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>
              
              {error && (
                <div className="font-mono text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.full_name || !form.email}
                className="flex-1 h-10 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Student'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="flex-1 h-10 bg-accent font-mono text-xs rounded hover:bg-accent/80">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="p-4 font-mono text-xs text-muted-foreground font-normal w-12">#</th>
              <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Student Details</th>
              <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Section</th>
              <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Batch</th>
              <th className="p-4 font-mono text-xs text-muted-foreground font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="font-mono text-sm text-muted-foreground">No students found matching your criteria</p>
                </td>
              </tr>
            ) : filtered.map((s, idx) => (
              <tr key={s.id} className="hover:bg-accent/20 transition-colors">
                <td className="p-4 font-mono text-xs text-muted-foreground">{idx + 1}</td>
                <td className="p-4">
                  <p className="text-sm font-medium">{toTitleCase(s.full_name)}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{s.email}</p>
                </td>
                <td className="p-4">
                  <span className="font-mono text-xs px-2 py-0.5 bg-accent rounded border border-border">
                    {s.section ?? 'UNASSIGNED'}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs text-muted-foreground">{s.batch_year ?? '—'}</td>
                <td className="p-4 text-right">
                  {isHOD && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s.id, s.full_name)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
