"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Briefcase, Users, BookOpen, Building, Loader2, Calendar } from "lucide-react"

type Profile = Database['public']['Tables']['profiles']['Row']

interface Event {
  id: string
  type: 'ASSOCIATION' | 'GUEST_LECTURE' | 'INDUSTRIAL_VISIT' | 'WORKSHOP' | 'SYMPOSIUM' | 'OTHER'
  title: string
  description: string
  date: string
  venue: string
  speaker?: string
  organization?: string
  sections: string
  created_by: string
  created_at: string
}

const EVENT_TYPES = {
  ASSOCIATION:      { label: 'Association Event', icon: Users,    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
  GUEST_LECTURE:    { label: 'Guest Lecture',      icon: BookOpen, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  INDUSTRIAL_VISIT: { label: 'Industrial Visit',   icon: Building, color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  WORKSHOP:         { label: 'Workshop',            icon: Briefcase,color: 'text-green-500 bg-green-500/10 border-green-500/20' },
  SYMPOSIUM:        { label: 'Symposium',           icon: Users,    color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  OTHER:            { label: 'Other',               icon: Calendar, color: 'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors border-white/10' },
}

export function EventsModule() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [events, setEvents]     = useState<Event[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState<string>('ALL')
  const [form, setForm] = useState({
    type: 'GUEST_LECTURE', title: '', description: '',
    date: '', venue: '', speaker: '', organization: '', sections: 'ALL'
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const canPost   = isHOD || isFaculty

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadEvents = async () => {
    const { data } = await supabase.from('announcements').select('*')
      .like('audience', 'EVENT:%')
      .order('created_at', { ascending: false })

    if (!data) return
    const parsed: Event[] = data.map(a => {
      try {
        const body = JSON.parse(a.body)
        return { id: a.id, ...body, created_by: a.created_by, created_at: a.created_at }
      } catch {
        return null
      }
    }).filter(Boolean)
    setEvents(parsed)
  }

  useEffect(() => { loadEvents() }, [])

  const postEvent = async () => {
    if (!profile || !form.title || !form.date) return
    setSaving(true)
    await supabase.from('announcements').insert({
      title: `EVENT: ${form.title}`,
      body: JSON.stringify(form),
      audience: `EVENT:${form.type}`,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    setSaving(false)
    setForm({ type: 'GUEST_LECTURE', title: '', description: '', date: '', venue: '', speaker: '', organization: '', sections: 'ALL' })
    setShowForm(false)
    loadEvents()
  }

  const filtered = filter === 'ALL' ? events : events.filter(e => e.type === filter)
  const upcoming = filtered.filter(e => new Date(e.date) >= new Date())
  const past     = filtered.filter(e => new Date(e.date) < new Date())

  const EventCard = ({ event }: { event: Event }) => {
    const meta = EVENT_TYPES[event.type] ?? EVENT_TYPES.OTHER
    const Icon = meta.icon
    return (
      <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-5 hover:border-primary/30 transition-all">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded border ${meta.color} flex-shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
              {event.sections !== 'ALL' && (
                <span className="font-mono text-xs text-slate-400">{event.sections}</span>
              )}
            </div>
            <h3 className="font-bold text-sm">{event.title}</h3>
            {event.speaker && <p className="font-mono text-xs text-slate-400 mt-0.5">Speaker: {event.speaker}</p>}
            {event.organization && <p className="font-mono text-xs text-slate-400">Org: {event.organization}</p>}
            <p className="text-sm text-slate-400 mt-1">{event.description}</p>
            <div className="flex items-center gap-4 mt-2 font-mono text-xs text-slate-400">
              <span>📅 {new Date(event.date).toLocaleDateString()}</span>
              {event.venue && <span>📍 {event.venue}</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-cyan-400">// SECTION: EVENTS</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Events & Association</h1>
          <p className="font-mono text-xs text-slate-400 mt-1">
            Guest lectures, industrial visits, workshops, symposiums and association events
          </p>
        </div>
        {canPost && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Add Event
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Object.entries(EVENT_TYPES).map(([type, meta]) => {
          const Icon = meta.icon
          const count = events.filter(e => e.type === type).length
          return (
            <button key={type} onClick={() => setFilter(filter === type ? 'ALL' : type)}
              className={`bg-[#0a101d]/60 backdrop-blur-xl border rounded-lg p-3 text-center transition-all ${filter === type ? 'border-primary' : 'border-white/10 hover:border-cyan-500/50'}`}>
              <Icon className={`w-4 h-4 mx-auto mb-1 ${meta.color.split(' ')[0]}`} />
              <p className="text-lg font-bold">{count}</p>
              <p className="font-mono text-xs text-slate-400 leading-tight">{meta.label.split(' ')[0]}</p>
            </button>
          )
        })}
      </div>

      {/* Post form */}
      {showForm && canPost && (
        <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-cyan-400">// NEW EVENT</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Event Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Event title"
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">Venue</label>
              <input value={form.venue} onChange={e => setForm({...form, venue: e.target.value})}
                placeholder="e.g. Seminar Hall, Room 301"
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            {(form.type === 'GUEST_LECTURE' || form.type === 'WORKSHOP') && (
              <>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Speaker/Resource Person</label>
                  <input value={form.speaker} onChange={e => setForm({...form, speaker: e.target.value})}
                    placeholder="Name and designation"
                    className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-slate-400">Organization</label>
                  <input value={form.organization} onChange={e => setForm({...form, organization: e.target.value})}
                    placeholder="Company / Institution"
                    className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="font-mono text-xs text-slate-400">For Sections</label>
              <select value={form.sections} onChange={e => setForm({...form, sections: e.target.value})}
                className="w-full h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                <option value="ALL">All Sections</option>
                {['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-slate-400">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Event description, agenda, objectives..."
                rows={3}
                className="w-full px-3 py-2 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
          </div>
          <button onClick={postEvent} disabled={saving || !form.title || !form.date}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
            {saving ? 'Posting...' : 'Post Event'}
          </button>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-mono text-xs text-cyan-400">// UPCOMING ({upcoming.length})</h2>
          {upcoming.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-mono text-xs text-slate-400">// PAST EVENTS ({past.length})</h2>
          {past.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {events.length === 0 && (
        <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="font-mono text-sm text-slate-400">No events yet</p>
        </div>
      )}
    </div>
  )
}
