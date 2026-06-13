"use client"

export const dynamic = "force-dynamic"
import { sendEmail, emailTemplates } from "@/lib/email"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Check, Clock, AlertTriangle, Loader2, Heart } from "lucide-react"

type Leave = Database['public']['Tables']['leaves']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const STATUS_COLORS = {
  PENDING:  'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  APPROVED: 'text-green-500 bg-green-500/10 border-green-500/20',
  REJECTED: 'text-red-500 bg-red-500/10 border-red-500/20',
}

const LEAVE_TYPES = ['Medical','Personal','Family Emergency','Academic Event','Sports','Other']

export default function LeavesPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [leaves, setLeaves]     = useState<Leave[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState<'ALL'|'PENDING'|'APPROVED'|'REJECTED'>('ALL')
  const [form, setForm] = useState({
    leave_type: 'Medical', from_date: '', to_date: '', reason: ''
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const isStudent = authUser?.type === 'student'

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadLeaves = async () => {
    if (!profile) return
    let query = supabase.from('leaves').select('*').order('created_at', { ascending: false })
    if (!isHOD) query = query.eq('applicant_id', profile.id)

    const { data } = await query
    if (!data) return
    setLeaves(data)

    // Load applicant profiles for HOD view
    if (isHOD && data.length) {
      const ids = [...new Set(data.map(l => l.applicant_id))]
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      if (profs) {
        const map: Record<string, Profile> = {}
        profs.forEach(p => { map[p.id] = p })
        setProfiles(map)
      }
    }
  }

  useEffect(() => { if (profile) loadLeaves() }, [profile])

  const applyLeave = async () => {
    if (!profile || !form.from_date || !form.to_date || !form.reason) return
    setSaving(true)
    const { error } = await supabase.from('leaves').insert({
      applicant_id: profile.id,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      reason: form.reason,
      status: 'PENDING'
    })
    setSaving(false)
    if (!error) {
      setForm({ leave_type: 'Medical', from_date: '', to_date: '', reason: '' })
      setShowForm(false)
      loadLeaves()
    }
  }

  const reviewLeave = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    if (!profile) return
    await supabase.from('leaves').update({
      status,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', id)

    // Send email notification
    const leave = leaves.find(l => l.id === id)
    if (leave) {
      const { data: applicant } = await supabase.from('profiles')
        .select('full_name, email').eq('id', leave.applicant_id).single()
      if (applicant?.email) {
        const tmpl = emailTemplates.leaveDecision(
          applicant.full_name, status, leave.leave_type,
          new Date(leave.from_date).toLocaleDateString(),
          new Date(leave.to_date).toLocaleDateString()
        )
        await sendEmail({ to: applicant.email, ...tmpl })
      }
    }
    loadLeaves()
  }

  const getDays = (from: string, to: string) => {
    const diff = new Date(to).getTime() - new Date(from).getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1
  }

  const filtered = filter === 'ALL' ? leaves : leaves.filter(l => l.status === filter)

  const stats = {
    total:    leaves.length,
    pending:  leaves.filter(l => l.status === 'PENDING').length,
    approved: leaves.filter(l => l.status === 'APPROVED').length,
    rejected: leaves.filter(l => l.status === 'REJECTED').length,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: LEAVES</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Leave Management</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            {isHOD ? 'Review and approve leave applications' : 'Apply and track your leave requests'}
          </p>
        </div>
        {!isHOD && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" /> Apply Leave
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-foreground' },
          { label: 'Pending',  value: stats.pending,  color: 'text-yellow-500' },
          { label: 'Approved', value: stats.approved, color: 'text-green-500' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="font-mono text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Apply form */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-primary">// NEW LEAVE APPLICATION</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Leave Type</label>
              <select value={form.leave_type} onChange={e => setForm({...form, leave_type: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">From Date</label>
                <input type="date" value={form.from_date} onChange={e => setForm({...form, from_date: e.target.value})}
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">To Date</label>
                <input type="date" value={form.to_date} onChange={e => setForm({...form, to_date: e.target.value})}
                  min={form.from_date}
                  className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Reason *</label>
              <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                placeholder="Describe the reason for leave..."
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
            {form.from_date && form.to_date && (
              <div className="sm:col-span-2 font-mono text-xs text-muted-foreground">
                Duration: <span className="text-primary font-bold">{getDays(form.from_date, form.to_date)} day(s)</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={applyLeave} disabled={saving || !form.from_date || !form.to_date || !form.reason}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-accent font-mono text-xs rounded hover:bg-accent/80 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['ALL','PENDING','APPROVED','REJECTED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
            {f} {f !== 'ALL' && `(${stats[f.toLowerCase() as keyof typeof stats]})`}
          </button>
        ))}
      </div>

      {/* Leaves list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Heart className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-mono text-sm text-muted-foreground">No leave applications found</p>
          </div>
        ) : filtered.map(leave => {
          const applicant = profiles[leave.applicant_id]
          const days = getDays(leave.from_date, leave.to_date)
          return (
            <div key={leave.id} className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {isHOD && applicant && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {applicant.full_name.split(' ').map(n => n[0]).slice(0,2).join('')}
                      </div>
                      <span className="font-medium text-sm">{applicant.full_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{applicant.section}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-mono text-xs px-2 py-0.5 bg-accent rounded border border-border">
                      {leave.leave_type}
                    </span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS]}`}>
                      {leave.status}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{days} day(s)</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mb-1">
                    {new Date(leave.from_date).toLocaleDateString()} → {new Date(leave.to_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">{leave.reason}</p>
                  {leave.review_note && (
                    <p className="font-mono text-xs text-muted-foreground mt-2 italic">Note: {leave.review_note}</p>
                  )}
                </div>
                {isHOD && leave.status === 'PENDING' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => reviewLeave(leave.id, 'APPROVED')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 transition-colors">
                      <Check className="w-3 h-3" /> Approve
                    </button>
                    <button onClick={() => reviewLeave(leave.id, 'REJECTED')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white font-mono text-xs rounded hover:bg-red-700 transition-colors">
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 font-mono text-xs text-muted-foreground">
                Applied: {new Date(leave.created_at).toLocaleDateString()}
                {leave.reviewed_at && ` · Reviewed: ${new Date(leave.reviewed_at).toLocaleDateString()}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
