"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Award, Building, Loader2, ExternalLink } from "lucide-react"

type Placement = Database['public']['Tables']['placements']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export function PlacementsModule() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({
    company_name: '', role_title: '', package_lpa: '',
    visit_date: '', description: '', apply_url: ''
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isStudent = authUser?.type === 'student'
  const DEPT      = '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadPlacements = async () => {
    const { data } = await supabase.from('placements').select('*')
      .eq('department_id', DEPT).order('created_at', { ascending: false })
    if (data) setPlacements(data)
  }

  useEffect(() => { loadPlacements() }, [])

  const postPlacement = async () => {
    if (!profile || !form.company_name || !form.role_title) return
    setSaving(true)
    await supabase.from('placements').insert({
      department_id: DEPT,
      company_name: form.company_name,
      role_title: form.role_title,
      package_lpa: form.package_lpa ? Number(form.package_lpa) : null,
      visit_date: form.visit_date || null,
      description: form.description || null,
      apply_url: form.apply_url || null,
      is_active: true,
      created_by: profile.id
    })
    setSaving(false)
    setForm({ company_name: '', role_title: '', package_lpa: '', visit_date: '', description: '', apply_url: '' })
    setShowForm(false)
    loadPlacements()
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('placements').update({ is_active: !current }).eq('id', id)
    loadPlacements()
  }

  const active   = placements.filter(p => p.is_active)
  const inactive = placements.filter(p => !p.is_active)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-cyan-400">// SECTION: PLACEMENTS</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Placements</h1>
          <p className="font-mono text-xs text-slate-400 mt-1">
            {isStudent ? 'Active placement drives and opportunities'
              : 'Manage placement drives and company visits'}
          </p>
        </div>
        {isHOD && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Add Drive
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Drives',   value: active.length },
          { label: 'Total Companies', value: placements.length },
          { label: 'Closed Drives',   value: inactive.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
            <p className="font-mono text-xs text-slate-400 mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && isHOD && (
        <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-cyan-400">// NEW PLACEMENT DRIVE</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'company_name', label: 'Company Name *', placeholder: 'e.g. Zoho Corporation' },
              { key: 'role_title',   label: 'Role / Position *', placeholder: 'e.g. Software Engineer' },
              { key: 'package_lpa',  label: 'Package (LPA)', placeholder: 'e.g. 6.5', type: 'number' },
              { key: 'visit_date',   label: 'Visit Date', placeholder: '', type: 'date' },
              { key: 'apply_url',    label: 'Apply URL', placeholder: 'https://...' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key} className="space-y-1">
                <label className="font-mono text-xs text-slate-400">{label}</label>
                <input type={type ?? 'text'} value={(form as any)[key]} placeholder={placeholder}
                  onChange={e => setForm({...form, [key]: e.target.value})}
                  className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
            ))}
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-slate-400">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Job description, eligibility criteria..."
                rows={3}
                className="w-full px-3 py-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
          </div>
          <button onClick={postPlacement} disabled={saving || !form.company_name || !form.role_title}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Award className="w-3 h-3" />}
            {saving ? 'Posting...' : 'Post Drive'}
          </button>
        </div>
      )}

      {/* Active drives */}
      <div className="space-y-3">
        <h2 className="font-mono text-xs text-cyan-400">// ACTIVE DRIVES ({active.length})</h2>
        {active.length === 0 ? (
          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-8 text-center">
            <Building className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="font-mono text-sm text-slate-400">No active placement drives</p>
          </div>
        ) : active.map(p => (
          <div key={p.id} className="bg-[#0a101d]/60 backdrop-blur-xl border border-green-500/20 rounded-lg p-5 hover:border-green-500/40 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-sm">{p.company_name}</h3>
                  <span className="font-mono text-xs px-2 py-0.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded">ACTIVE</span>
                  {p.package_lpa && <span className="font-mono text-xs text-cyan-400">₹{p.package_lpa} LPA</span>}
                </div>
                <p className="text-sm text-slate-400">{p.role_title}</p>
                {p.visit_date && <p className="font-mono text-xs text-slate-400 mt-1">Visit: {new Date(p.visit_date).toLocaleDateString()}</p>}
                {p.description && <p className="text-sm text-slate-400 mt-2">{p.description}</p>}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {p.apply_url && (
                  <a href={p.apply_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 transition-colors">
                    <ExternalLink className="w-3 h-3" /> Apply
                  </a>
                )}
                {isHOD && (
                  <button onClick={() => toggleActive(p.id, p.is_active)}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80">
                    Close Drive
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Past drives */}
      {inactive.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-mono text-xs text-slate-400">// PAST DRIVES ({inactive.length})</h2>
          {inactive.map(p => (
            <div key={p.id} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4 opacity-60 hover:opacity-80 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{p.company_name}</p>
                  <p className="font-mono text-xs text-slate-400">{p.role_title} {p.package_lpa ? `· ₹${p.package_lpa} LPA` : ''}</p>
                </div>
                {isHOD && (
                  <button onClick={() => toggleActive(p.id, p.is_active)}
                    className="font-mono text-xs px-2 py-1 border border-white/10 rounded hover:border-cyan-500/50 text-slate-400">
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
