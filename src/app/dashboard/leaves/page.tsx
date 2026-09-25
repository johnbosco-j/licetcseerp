"use client"

export const dynamic = "force-dynamic"
import { notifyLeaveDecision } from "@/lib/send-notification"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import { safeUrl } from "@/lib/utils"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Check, Loader2, Heart, Search, Download, Trash2, Paperclip, Inbox, FileText } from "lucide-react"
import { toast, reportResult } from "@/components/toaster"

type Leave = Database['public']['Tables']['leaves']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Status = Leave['status']

const STATUS_COLORS: Record<Status, string> = {
  PENDING:  'text-amber-700 bg-amber-50 border-amber-200',
  APPROVED: 'text-green-700 bg-green-50 border-green-200',
  REJECTED: 'text-red-700 bg-red-50 border-red-200',
}

const STUDENT_TYPES = ['Medical', 'Personal', 'Family Emergency', 'On Duty (OD)', 'Academic Event', 'Sports', 'Other']
const STAFF_TYPES   = ['Casual Leave', 'Medical Leave', 'On Duty (OD)', 'Earned Leave', 'Compensatory Off', 'Other']
const EMPTY_FORM = { leave_type: '', from_date: '', to_date: '', reason: '', document_url: '' }

const getDays = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function LeavesPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [leaves, setLeaves]     = useState<Leave[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [tab, setTab]           = useState<'review' | 'mine'>('mine')
  const [filter, setFilter]     = useState<'ALL' | Status>('ALL')
  const [search, setSearch]     = useState('')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [note, setNote]         = useState('')
  const [form, setForm]         = useState(EMPTY_FORM)

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isStudent = authUser?.type === 'student'
  const advisorOf = profile?.advisor_section ?? null
  const canReview = isHOD || !!advisorOf
  const canApply  = !isHOD
  const types     = isStudent ? STUDENT_TYPES : STAFF_TYPES

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  useEffect(() => { if (profile) setTab(isHOD || profile.advisor_section ? 'review' : 'mine') }, [profile, isHOD])

  // RLS returns: your own applications, plus (HOD) everything or (class advisor) your section's students.
  const loadLeaves = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data, error } = await supabase.from('leaves').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    const rows = data ?? []
    setLeaves(rows)
    const ids = [...new Set(rows.map(l => l.applicant_id).filter(id => id !== profile.id))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      setProfiles(Object.fromEntries((profs ?? []).map(p => [p.id, p])))
    }
    setLoading(false)
  }, [profile])

  useEffect(() => { loadLeaves() }, [loadLeaves])

  const applyLeave = async () => {
    if (!profile) return
    const leaveType = form.leave_type || types[0]
    if (!form.from_date || !form.to_date || !form.reason.trim()) { toast.error('Fill in the dates and the reason.'); return }
    if (form.to_date < form.from_date) { toast.error("The end date can't be before the start date."); return }
    if (form.document_url && !safeUrl(form.document_url)) { toast.error('The supporting document link must start with http:// or https://'); return }
    const overlap = leaves.find(l => l.applicant_id === profile.id && l.status !== 'REJECTED' && l.from_date <= form.to_date && l.to_date >= form.from_date)
    if (overlap) { toast.error(`You already have a ${overlap.status.toLowerCase()} application for ${fmt(overlap.from_date)} – ${fmt(overlap.to_date)}.`); return }
    setSaving(true)
    const { error } = await supabase.from('leaves').insert({
      applicant_id: profile.id,
      leave_type: leaveType,
      from_date: form.from_date,
      to_date: form.to_date,
      reason: form.reason.trim(),
      document_url: form.document_url.trim() || null,
      status: 'PENDING'
    })
    setSaving(false)
    if (reportResult(error, isStudent ? 'Leave application sent to your class advisor' : 'Leave application submitted')) {
      setForm(EMPTY_FORM)
      setShowForm(false)
      loadLeaves()
    }
  }

  const withdraw = async (leave: Leave) => {
    if (!confirm(`Withdraw your ${leave.leave_type} application for ${fmt(leave.from_date)} – ${fmt(leave.to_date)}?`)) return
    const { error } = await supabase.from('leaves').delete().eq('id', leave.id)
    if (reportResult(error, 'Application withdrawn')) loadLeaves()
  }

  const reviewLeave = async (leave: Leave, status: 'APPROVED' | 'REJECTED') => {
    if (!profile) return
    if (status === 'REJECTED' && !note.trim()) { toast.error('Add a remark explaining why the leave is rejected.'); return }
    const { error } = await supabase.from('leaves').update({
      status,
      review_note: note.trim() || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', leave.id)
    if (!reportResult(error, `Leave ${status === 'APPROVED' ? 'approved' : 'rejected'}`)) return
    setReviewing(null)
    setNote('')
    const applicant = profiles[leave.applicant_id]
    if (applicant?.email) {
      notifyLeaveDecision(applicant.email, applicant.full_name, status, leave.leave_type,
        fmt(leave.from_date), fmt(leave.to_date), note.trim() || undefined).catch(() => {})
    }
    loadLeaves()
  }

  const mine = leaves.filter(l => l.applicant_id === profile?.id)
  const toReview = leaves.filter(l => l.applicant_id !== profile?.id)
  const list = tab === 'review' ? toReview : mine

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter(l => (filter === 'ALL' || l.status === filter) && (!q || [profiles[l.applicant_id]?.full_name, profiles[l.applicant_id]?.roll_number, profiles[l.applicant_id]?.section, l.leave_type, l.reason].some(v => v?.toLowerCase().includes(q))))
  }, [list, filter, search, profiles])

  const count = (s: Status) => list.filter(l => l.status === s).length
  const onLeaveToday = toReview.filter(l => { const t = new Date().toISOString().slice(0, 10); return l.status === 'APPROVED' && l.from_date <= t && l.to_date >= t }).length

  const exportXLSX = () => {
    const rows = shown.map(l => {
      const p = profiles[l.applicant_id] ?? (l.applicant_id === profile?.id ? profile : null)
      return {
        'Applicant': p?.full_name ?? '', 'Roll No': p?.roll_number ?? '', 'Section': p?.section ?? (p?.role === 'STUDENT' ? '' : 'Staff'),
        'Leave type': l.leave_type, 'From': l.from_date, 'To': l.to_date, 'Days': getDays(l.from_date, l.to_date),
        'Reason': l.reason, 'Status': l.status, 'Remark': l.review_note ?? '', 'Applied on': l.created_at.slice(0, 10), 'Reviewed on': l.reviewed_at?.slice(0, 10) ?? '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No applications match the current filter' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Leave applications')
    XLSX.writeFile(wb, `Leave_applications_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const input = "w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none"

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">LEAVES</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Leave Management</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
            {isHOD ? 'Review leave applications from faculty and students'
              : advisorOf ? `Apply for your own leave and review applications from ${advisorOf} as class advisor`
              : isStudent ? 'Apply for leave or on-duty. Your class advisor reviews each application.'
              : 'Apply for leave and track the HOD’s decision'}
          </p>
        </div>
        <div className="flex gap-2">
          {canReview && (
            <button onClick={exportXLSX} className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
          {canApply && (
            <button onClick={() => { setShowForm(!showForm); setTab('mine') }}
              className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm transition-colors">
              <Plus className="w-3 h-3" /> Apply Leave
            </button>
          )}
        </div>
      </div>

      {canReview && canApply && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {([['review', `To review (${toReview.filter(l => l.status === 'PENDING').length})`], ['mine', `My applications (${mine.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${tab === k ? 'bg-white text-licet-indigo shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pending',  value: count('PENDING'),  color: 'text-amber-700' },
          { label: 'Approved', value: count('APPROVED'), color: 'text-green-700' },
          { label: 'Rejected', value: count('REJECTED'), color: 'text-red-700' },
          tab === 'review'
            ? { label: 'On leave today', value: onLeaveToday, color: 'text-licet-indigo' }
            : { label: 'Days approved', value: mine.filter(l => l.status === 'APPROVED').reduce((s, l) => s + getDays(l.from_date, l.to_date), 0), color: 'text-licet-indigo' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Apply form */}
      {showForm && canApply && (
        <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">NEW LEAVE APPLICATION</span>
            <button onClick={() => setShowForm(false)} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Leave Type</label>
              <select value={form.leave_type || types[0]} onChange={e => setForm({ ...form, leave_type: e.target.value })} className={input}>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">From Date *</label>
                <input type="date" value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value, to_date: form.to_date && form.to_date < e.target.value ? e.target.value : form.to_date })} className={input} />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">To Date *</label>
                <input type="date" value={form.to_date} min={form.from_date} onChange={e => setForm({ ...form, to_date: e.target.value })} className={input} />
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Reason *</label>
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="Describe the reason for leave..." rows={3}
                className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Supporting document link (optional)</label>
              <input value={form.document_url} onChange={e => setForm({ ...form, document_url: e.target.value })}
                placeholder="Medical certificate, OD letter… (Google Drive or OneDrive link)" className={input} />
            </div>
            {form.from_date && form.to_date && form.to_date >= form.from_date && (
              <div className="sm:col-span-2 font-mono text-xs text-muted-foreground">
                Duration: <span className="text-primary font-bold">{getDays(form.from_date, form.to_date)} day(s)</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={applyLeave} disabled={saving || !form.from_date || !form.to_date || !form.reason.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} {f !== 'ALL' && `(${count(f)})`}
          </button>
        ))}
        {tab === 'review' && (
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, roll no, section"
              className="w-full h-9 pl-9 pr-3 bg-white border border-input rounded-md text-[13px] focus:border-licet-violet focus:outline-none" />
          </div>
        )}
      </div>

      {/* Leaves list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading applications…</div>
        ) : shown.length === 0 ? (
          <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
            {tab === 'review' ? <Inbox className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" /> : <Heart className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />}
            <p className="text-sm text-muted-foreground">{tab === 'review' ? 'No applications to review' : 'You have not applied for leave yet'}</p>
          </div>
        ) : shown.map(leave => {
          const applicant = profiles[leave.applicant_id]
          const days = getDays(leave.from_date, leave.to_date)
          const reviewable = tab === 'review' && leave.status === 'PENDING'
          const doc = safeUrl(leave.document_url)
          return (
            <div key={leave.id} className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-all">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {tab === 'review' && applicant && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="w-7 h-7 rounded-full bg-licet-cream text-licet-indigo flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                        {applicant.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      {applicant.role === 'STUDENT'
                        ? <Link href={`/dashboard/students/${applicant.id}`} className="font-semibold text-sm text-licet-indigo hover:underline">{applicant.full_name}</Link>
                        : <span className="font-semibold text-sm">{applicant.full_name}</span>}
                      <span className="text-xs text-muted-foreground">{applicant.role === 'STUDENT' ? `${applicant.section}${applicant.roll_number ? ` · ${applicant.roll_number}` : ''}` : applicant.designation ?? 'Faculty'}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-mono text-xs px-2 py-0.5 bg-accent rounded border border-border">{leave.leave_type}</span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[leave.status]}`}>{leave.status}</span>
                    <span className="font-mono text-xs text-muted-foreground">{days} day{days === 1 ? '' : 's'}</span>
                  </div>
                  <p className="text-[12px] font-semibold text-licet-indigo mb-1">{fmt(leave.from_date)} → {fmt(leave.to_date)}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{leave.reason}</p>
                  {doc && <a href={doc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-licet-violet hover:underline mt-1.5"><Paperclip className="w-3.5 h-3.5" />Supporting document</a>}
                  {leave.review_note && (
                    <p className="text-[12.5px] text-licet-violet mt-2"><FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />Remark: {leave.review_note}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  {reviewable && reviewing !== leave.id && (
                    <>
                      <button onClick={() => { setReviewing(leave.id); setNote('') }}
                        className="flex items-center gap-1 px-3 py-1.5 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">
                        Review
                      </button>
                      <button onClick={() => { setNote(''); reviewLeave(leave, 'APPROVED') }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-700 text-white text-[13px] font-semibold rounded-md hover:bg-green-800 transition-colors">
                        <Check className="w-3 h-3" /> Approve
                      </button>
                    </>
                  )}
                  {tab === 'mine' && leave.status === 'PENDING' && (
                    <button onClick={() => withdraw(leave)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-border bg-white text-red-700 text-[13px] font-semibold rounded-md hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Withdraw
                    </button>
                  )}
                </div>
              </div>
              {reviewing === leave.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus
                    placeholder="Remark for the applicant (required when rejecting)"
                    className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => reviewLeave(leave, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 bg-green-700 text-white text-[13px] font-semibold rounded-md hover:bg-green-800"><Check className="w-3 h-3" /> Approve</button>
                    <button onClick={() => reviewLeave(leave, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-[13px] font-semibold rounded-md hover:bg-red-700"><X className="w-3 h-3" /> Reject</button>
                    <button onClick={() => setReviewing(null)} className="px-3 py-1.5 border border-border rounded-md text-[13px] font-semibold hover:bg-muted">Cancel</button>
                  </div>
                </div>
              )}
              <div className="mt-3 font-mono text-xs text-muted-foreground">
                Applied {fmt(leave.created_at)}
                {leave.reviewed_at && ` · Reviewed ${fmt(leave.reviewed_at)}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
