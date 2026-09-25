"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Briefcase, Users, BookOpen, Building, Loader2, Calendar, Pencil, Trash2, Search, Download } from "lucide-react"
import * as XLSX from "xlsx"
import { toast, reportResult } from "@/components/toaster"

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
  ASSOCIATION:      { label: 'Association Event', icon: Users,    color: 'text-purple-700 bg-purple-50 border-purple-200' },
  GUEST_LECTURE:    { label: 'Guest Lecture',      icon: BookOpen, color: 'text-blue-700 bg-blue-50 border-blue-200' },
  INDUSTRIAL_VISIT: { label: 'Industrial Visit',   icon: Building, color: 'text-orange-700 bg-orange-50 border-orange-200' },
  WORKSHOP:         { label: 'Workshop',            icon: Briefcase,color: 'text-green-700 bg-green-50 border-green-200' },
  SYMPOSIUM:        { label: 'Symposium',           icon: Users,    color: 'text-red-700 bg-red-50 border-red-200' },
  OTHER:            { label: 'Other',               icon: Calendar, color: 'text-muted-foreground bg-accent border-border' },
}

export default function EventsPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [events, setEvents]     = useState<Event[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState<string>('ALL')
  const [search, setSearch]     = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    type: 'GUEST_LECTURE', title: '', description: '',
    date: '', venue: '', speaker: '', organization: '', sections: 'ALL'
  })

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff'
  const isStudent = authUser?.type === 'student'
  const canPost   = isHOD || isFaculty
  const canManage = (e: Event) => isHOD || (!!profile && e.created_by === profile.id)

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

  const EMPTY = { type: 'GUEST_LECTURE', title: '', description: '', date: '', venue: '', speaker: '', organization: '', sections: 'ALL' }

  const postEvent = async () => {
    if (!profile) return
    if (!form.title.trim() || !form.date) { toast.error('Title and date are required.'); return }
    setSaving(true)
    const row = {
      title: `EVENT: ${form.title.trim()}`,
      body: JSON.stringify({ ...form, title: form.title.trim() }),
      audience: `EVENT:${form.type}`,
    }
    const { error } = editingId
      ? await supabase.from('announcements').update(row).eq('id', editingId)
      : await supabase.from('announcements').insert({ ...row, is_urgent: false, created_by: profile.id, department_id: '00000000-0000-0000-0000-000000000001' })
    setSaving(false)
    if (!reportResult(error, editingId ? 'Event updated' : 'Event posted')) return
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(false)
    loadEvents()
  }

  const editEvent = (e: Event) => {
    setForm({ type: e.type, title: e.title, description: e.description ?? '', date: e.date, venue: e.venue ?? '', speaker: e.speaker ?? '', organization: e.organization ?? '', sections: e.sections ?? 'ALL' })
    setEditingId(e.id)
    setShowForm(true)
    document.getElementById('scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteEvent = async (e: Event) => {
    if (!confirm(`Delete the event "${e.title}"?`)) return
    const { error } = await supabase.from('announcements').delete().eq('id', e.id)
    if (reportResult(error, 'Event deleted')) loadEvents()
  }

  const exportXLSX = () => {
    const rows = filtered.map(e => ({
      Date: e.date, Type: (EVENT_TYPES[e.type] ?? EVENT_TYPES.OTHER).label, Title: e.title, Venue: e.venue ?? '',
      'Resource person': e.speaker ?? '', Organisation: e.organization ?? '', 'For': e.sections === 'ALL' ? 'All sections' : e.sections, Description: e.description ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No events' }]), 'Events')
    XLSX.writeFile(wb, `CSE_Events_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const mySection = isStudent ? (authUser?.data as { section?: string })?.section : null
  const q = search.trim().toLowerCase()
  const filtered = events
    .filter(e => filter === 'ALL' || e.type === filter)
    .filter(e => !mySection || e.sections === 'ALL' || e.sections === mySection)
    .filter(e => !q || [e.title, e.description, e.venue, e.speaker, e.organization].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date))
  const todayIso = new Date().toLocaleDateString('en-CA')
  const upcoming = filtered.filter(e => e.date >= todayIso)
  const past     = filtered.filter(e => e.date < todayIso).reverse()

  const EventCard = ({ event }: { event: Event }) => {
    const meta = EVENT_TYPES[event.type] ?? EVENT_TYPES.OTHER
    const Icon = meta.icon
    return (
      <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-all">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded border ${meta.color} flex-shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
              {event.sections !== 'ALL' && (
                <span className="font-mono text-xs text-muted-foreground">{event.sections}</span>
              )}
            </div>
            <h3 className="font-bold text-sm">{event.title}</h3>
            {event.speaker && <p className="font-mono text-xs text-muted-foreground mt-0.5">Speaker: {event.speaker}</p>}
            {event.organization && <p className="font-mono text-xs text-muted-foreground">Org: {event.organization}</p>}
            <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
            <div className="flex items-center gap-4 mt-2 font-mono text-xs text-muted-foreground">
              <span>📅 {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {event.venue && <span>📍 {event.venue}</span>}
            </div>
          </div>
          {canManage(event) && (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => editEvent(event)} className="p-1.5 text-muted-foreground hover:text-licet-indigo hover:bg-licet-cream/60 rounded" title="Edit event" aria-label={`Edit ${event.title}`}><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteEvent(event)} className="p-1.5 text-muted-foreground hover:text-red-700 hover:bg-red-50 rounded" title="Delete event" aria-label={`Delete ${event.title}`}><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="eyebrow">EVENTS</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Events & Association</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
            Guest lectures, industrial visits, workshops, symposiums and association events
          </p>
        </div>
        <div className="flex gap-2">
        {canPost && (
          <button onClick={exportXLSX} className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
        {canPost && (
          <button onClick={() => { setEditingId(null); setForm(EMPTY); setShowForm(!showForm) }}
            className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm">
            <Plus className="w-3 h-3" /> Add Event
          </button>
        )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Object.entries(EVENT_TYPES).map(([type, meta]) => {
          const Icon = meta.icon
          const count = events.filter(e => e.type === type).length
          return (
            <button key={type} onClick={() => setFilter(filter === type ? 'ALL' : type)}
              className={`bg-card border rounded-lg p-3 text-center transition-all ${filter === type ? 'border-primary' : 'border-border hover:border-primary/50'}`}>
              <Icon className={`w-4 h-4 mx-auto mb-1 ${meta.color.split(' ')[0]}`} />
              <p className="font-serif text-[22px] font-semibold text-licet-indigo">{count}</p>
              <p className="font-mono text-xs text-muted-foreground leading-tight">{meta.label.split(' ')[0]}</p>
            </button>
          )
        })}
      </div>

      {/* Post form */}
      {showForm && canPost && (
        <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{editingId ? 'EDIT EVENT' : 'NEW EVENT'}</span>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Event Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Event title"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Venue</label>
              <input value={form.venue} onChange={e => setForm({...form, venue: e.target.value})}
                placeholder="e.g. Seminar Hall, Room 301"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            {(form.type === 'GUEST_LECTURE' || form.type === 'WORKSHOP') && (
              <>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Speaker/Resource Person</label>
                  <input value={form.speaker} onChange={e => setForm({...form, speaker: e.target.value})}
                    placeholder="Name and designation"
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground">Organization</label>
                  <input value={form.organization} onChange={e => setForm({...form, organization: e.target.value})}
                    placeholder="Company / Institution"
                    className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">For Sections</label>
              <select value={form.sections} onChange={e => setForm({...form, sections: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                <option value="ALL">All Sections</option>
                {['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Event description, agenda, objectives..."
                rows={3}
                className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
            </div>
          </div>
          <button onClick={postEvent} disabled={saving || !form.title || !form.date}
            className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Post Event'}
          </button>
        </div>
      )}

      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events, speakers, venues"
          className="w-full h-9 pl-9 pr-3 bg-white border border-input rounded-md text-[13px] focus:border-licet-violet focus:outline-none" />
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="eyebrow">UPCOMING ({upcoming.length})</h2>
          {upcoming.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="eyebrow">PAST EVENTS ({past.length})</h2>
          {past.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {events.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No events match your search.</p>
      )}

      {events.length === 0 && (
        <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground">No events yet</p>
        </div>
      )}
    </div>
  )
}
