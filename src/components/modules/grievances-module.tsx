"use client"

export const dynamic = "force-dynamic"
import { sendEmail, emailTemplates } from "@/lib/email"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react"

type Grievance = Database['public']['Tables']['grievances']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const STATUS_COLORS: Record<string, string> = {
  OPEN:        'text-red-500 bg-red-500/10 border-red-500/20',
  IN_PROGRESS: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  RESOLVED:    'text-green-500 bg-green-500/10 border-green-500/20',
  CLOSED:      'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors border-white/10',
}

const CATEGORIES = ['Academic','Examination','Faculty','Infrastructure','Administration','Ragging','Other']

export function GrievancesModule() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [profiles, setProfiles]   = useState<Record<string, Profile>>({})
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [form, setForm] = useState({ category: 'Academic', subject_line: '', description: '' })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isStudent = authUser?.type === 'student'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadGrievances = async () => {
    if (!profile) return
    let query = supabase.from('grievances').select('*').order('created_at', { ascending: false })
    if (!isHOD) query = query.eq('student_id', profile.id)
    const { data } = await query
    if (!data) return
    setGrievances(data)
    if (isHOD && data.length) {
      const ids = [...new Set(data.map(g => g.student_id))]
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      if (profs) {
        const map: Record<string, Profile> = {}
        profs.forEach(p => { map[p.id] = p })
        setProfiles(map)
      }
    }
  }

  useEffect(() => { if (profile) loadGrievances() }, [profile])

  const submitGrievance = async () => {
    if (!profile || !form.subject_line || !form.description) return
    setSaving(true)
    await supabase.from('grievances').insert({
      student_id: profile.id,
      category: form.category,
      subject_line: form.subject_line,
      description: form.description,
      status: 'OPEN'
    })
    setSaving(false)
    setForm({ category: 'Academic', subject_line: '', description: '' })
    setShowForm(false)
    loadGrievances()
  }

  const updateStatus = async (id: string, status: string, res?: string) => {
    await supabase.from('grievances').update({
      status,
      resolution: res ?? null,
      assigned_to: profile?.id,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    // Send email notification
    const g = grievances.find(x => x.id === id)
    if (g) {
      const { data: student } = await supabase.from('profiles')
        .select('full_name, email').eq('id', g.student_id).single()
      if (student?.email) {
        const tmpl = emailTemplates.grievanceUpdate(student.full_name, g.subject_line, status, res)
        await sendEmail({ to: student.email, ...tmpl })
      }
    }
    setExpanded(null)
    setResolution('')
    loadGrievances()
  }

  const stats = {
    total:       grievances.length,
    open:        grievances.filter(g => g.status === 'OPEN').length,
    in_progress: grievances.filter(g => g.status === 'IN_PROGRESS').length,
    resolved:    grievances.filter(g => g.status === 'RESOLVED' || g.status === 'CLOSED').length,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-cyan-400">// SECTION: GRIEVANCES</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Grievances</h1>
          <p className="font-mono text-xs text-slate-400 mt-1">
            {isHOD ? 'Track and resolve student grievances' : 'Submit and track your grievances'}
          </p>
        </div>
        {isStudent && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" /> New Grievance
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',       value: stats.total,       color: 'text-foreground' },
          { label: 'Open',        value: stats.open,        color: 'text-red-500' },
          { label: 'In Progress', value: stats.in_progress, color: 'text-yellow-500' },
          { label: 'Resolved',    value: stats.resolved,    color: 'text-green-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
            <p className="font-mono text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Submit form */}
      {showForm && isStudent && (
        <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-cyan-400">// NEW GRIEVANCE</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-mono text-xs text-slate-400">Category</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                  className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-slate-400">Subject *</label>
                <input value={form.subject_line} onChange={e => setForm({...form, subject_line: e.target.value})}
                  placeholder="Brief subject of grievance"
                  className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Description *</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Describe your grievance in detail..."
                rows={4}
                className="w-full px-3 py-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
          </div>
          <button onClick={submitGrievance} disabled={saving || !form.subject_line || !form.description}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
            {saving ? 'Submitting...' : 'Submit Grievance'}
          </button>
        </div>
      )}

      {/* Grievances list */}
      <div className="space-y-3">
        {grievances.length === 0 ? (
          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="font-mono text-sm text-slate-400">No grievances — all is well!</p>
          </div>
        ) : grievances.map(g => {
          const applicant = profiles[g.student_id]
          const isExp = expanded === g.id
          return (
            <div key={g.id} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden hover:border-primary/30 transition-all">
              <div className="flex items-start gap-4 p-5 cursor-pointer" onClick={() => setExpanded(isExp ? null : g.id)}>
                <div className="flex-1 min-w-0">
                  {isHOD && applicant && (
                    <p className="font-mono text-xs text-slate-400 mb-1">
                      {applicant.full_name} · {applicant.section}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs px-2 py-0.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded border border-white/10">{g.category}</span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[g.status] ?? ''}`}>{g.status}</span>
                  </div>
                  <p className="font-medium text-sm">{g.subject_line}</p>
                  <p className="font-mono text-xs text-slate-400 mt-1">
                    {new Date(g.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {isExp && (
                <div className="px-5 pb-5 border-t border-white/10 space-y-4 pt-4">
                  <p className="text-sm text-slate-400">{g.description}</p>
                  {g.resolution && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded p-3">
                      <p className="font-mono text-xs text-green-500 font-bold mb-1">Resolution</p>
                      <p className="font-mono text-xs text-slate-400">{g.resolution}</p>
                    </div>
                  )}
                  {isHOD && g.status !== 'CLOSED' && (
                    <div className="space-y-3">
                      <textarea value={resolution} onChange={e => setResolution(e.target.value)}
                        placeholder="Add resolution or response..."
                        rows={2}
                        className="w-full px-3 py-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
                      <div className="flex gap-2 flex-wrap">
                        {g.status === 'OPEN' && (
                          <button onClick={() => updateStatus(g.id, 'IN_PROGRESS')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-yellow-700">
                            <Clock className="w-3 h-3" /> Mark In Progress
                          </button>
                        )}
                        <button onClick={() => updateStatus(g.id, 'RESOLVED', resolution)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-green-700">
                          <CheckCircle2 className="w-3 h-3" /> Mark Resolved
                        </button>
                        <button onClick={() => updateStatus(g.id, 'CLOSED', resolution)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80">
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
