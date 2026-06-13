"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Bell, Plus, X, AlertTriangle, Clock, Users, BookOpen, Loader2 } from "lucide-react"

type Announcement = Database['public']['Tables']['announcements']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const AUDIENCE_LABELS: Record<string, { label: string; color: string }> = {
  ALL:      { label: 'All',          color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  FACULTY:  { label: 'Faculty Only', color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
  STUDENTS: { label: 'Students',     color: 'text-green-500 bg-green-500/10 border-green-500/20' },
  'I CSE-A':   { label: 'I CSE-A',   color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  'I CSE-B':   { label: 'I CSE-B',   color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  'II CSE-A':  { label: 'II CSE-A',  color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  'II CSE-B':  { label: 'II CSE-B',  color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  'III CSE-A': { label: 'III CSE-A', color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  'III CSE-B': { label: 'III CSE-B', color: 'text-red-500 bg-red-500/10 border-red-500/20' },
}

export default function NoticesPage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [notices, setNotices]     = useState<Announcement[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [filterAudience, setFilterAudience] = useState('ALL')
  const [form, setForm] = useState({
    title: '', body: '', audience: 'ALL',
    is_urgent: false, expires_at: ''
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadNotices = async () => {
    if (!authUser) return
    setLoading(true)
    let query = supabase.from('announcements').select('*').order('created_at', { ascending: false })

    // Filter expired
    query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

    // Students only see notices relevant to them
    if (isStudent) {
      const section = (authUser.data as { section?: string })?.section ?? ''
      query = query.in('audience', ['ALL', 'STUDENTS', section])
    } else if (isFaculty) {
      query = query.in('audience', ['ALL', 'PROFESSOR', ...SECTIONS])
    }

    const { data } = await query
    if (data) setNotices(data)
    setLoading(false)
  }

  useEffect(() => { if (authUser) loadNotices() }, [authUser])

  const postNotice = async () => {
    if (!profile || !form.title.trim() || !form.body.trim()) return
    setSaving(true)
    const { error } = await supabase.from('announcements').insert({
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      is_urgent: form.is_urgent,
      expires_at: form.expires_at || null,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    setSaving(false)
    if (!error) {
      setForm({ title: '', body: '', audience: 'ALL', is_urgent: false, expires_at: '' })
      setShowForm(false)
      loadNotices()
    }
  }

  const deleteNotice = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id)
    loadNotices()
  }

  const canPost = isHOD || isFaculty
  const filtered = filterAudience === 'ALL'
    ? notices
    : notices.filter(n => n.audience === filterAudience)

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: NOTICES</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Notices & Announcements</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            {isStudent ? 'Circulars and announcements from your department'
              : 'Post and manage departmental notices'}
          </p>
        </div>
        {canPost && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" />
            Post Notice
          </button>
        )}
      </div>

      {/* Post form */}
      {showForm && canPost && (
        <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-primary">// NEW NOTICE</span>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Notice title..."
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Body *</label>
              <textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})}
                placeholder="Notice content..."
                rows={4}
                className="w-full px-3 py-2 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Audience</label>
              <select value={form.audience} onChange={e => setForm({...form, audience: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                <option value="ALL">All (Students + Faculty)</option>
                <option value="PROFESSOR">Faculty Only</option>
                <option value="STUDENTS">All Students</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s} only</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Expires On (optional)</label>
              <input type="date" value={form.expires_at} onChange={e => setForm({...form, expires_at: e.target.value})}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                onClick={() => setForm({...form, is_urgent: !form.is_urgent})}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border font-mono text-xs transition-all ${form.is_urgent ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'border-border text-muted-foreground hover:border-red-500/30'}`}>
                <AlertTriangle className="w-3 h-3" />
                {form.is_urgent ? 'Marked Urgent' : 'Mark as Urgent'}
              </button>
              <button onClick={postNotice} disabled={saving || !form.title || !form.body}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                {saving ? 'Posting...' : 'Post Notice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',   value: notices.length,                                          icon: Bell },
          { label: 'Urgent',  value: notices.filter(n => n.is_urgent).length,                 icon: AlertTriangle },
          { label: 'Today',   value: notices.filter(n => new Date(n.created_at).toDateString() === new Date().toDateString()).length, icon: Clock },
          { label: 'For You', value: filtered.length,                                         icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{value}</p>
              <p className="font-mono text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      {(isHOD || isFaculty) && (
        <div className="flex flex-wrap gap-2">
          {['ALL', 'PROFESSOR', 'STUDENTS', ...SECTIONS].map(aud => (
            <button key={aud} onClick={() => setFilterAudience(aud)}
              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${filterAudience === aud ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {aud}
            </button>
          ))}
        </div>
      )}

      {/* Notices list */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-mono text-sm text-muted-foreground">No notices yet</p>
          </div>
        ) : filtered.map(notice => {
          const aud = AUDIENCE_LABELS[notice.audience] ?? { label: notice.audience, color: 'text-muted-foreground bg-accent border-border' }
          return (
            <div key={notice.id}
              className={`bg-card border rounded-lg p-5 transition-all hover:border-primary/30 ${notice.is_urgent ? 'border-red-500/30' : 'border-border'}`}>
              <div className="flex items-start gap-3">
                {notice.is_urgent && (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm">{notice.title}</h3>
                      {notice.is_urgent && (
                        <span className="font-mono text-xs px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded">URGENT</span>
                      )}
                      <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${aud.color}`}>{aud.label}</span>
                    </div>
                    {(isHOD || (isFaculty && notice.created_by === profile?.id)) && (
                      <button onClick={() => deleteNotice(notice.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notice.body}</p>
                  <div className="flex items-center gap-4 mt-3 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(notice.created_at)}
                    </span>
                    {notice.expires_at && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Expires {new Date(notice.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
