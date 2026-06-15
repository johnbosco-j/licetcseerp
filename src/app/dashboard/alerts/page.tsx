"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Bell, CheckCircle, XCircle, Clock, AlertTriangle, CheckCheck } from "lucide-react"

type Profile = Database['public']['Tables']['profiles']['Row']

interface Alert {
  id: string
  student_id: string | null
  section: string
  date: string
  missed_parts: number[]
  alert_type: string
  met_hod: boolean | null
  met_hod_at: string | null
  cleared_by: string | null
  cleared_at: string | null
  notes: string | null
  created_at: string | null
  student?: { full_name: string; email: string; roll_number: string | null }
}

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

const ALERT_LABELS: Record<string, { label: string; color: string }> = {
  ABSENT_ON_NO_INFO: { label: 'Absent (No Info)',   color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  LATE_THRESHOLD:    { label: '3× Late This Month', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
}

export default function AlertsPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [filterSection, setFilterSection] = useState('')
  const [showResolved, setShowResolved]   = useState(false)
  const [actionMsg, setActionMsg]         = useState('')
  const [bulkClearing, setBulkClearing]   = useState(false)

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'

  useEffect(() => {
    const stored = localStorage.getItem('licet_user') || localStorage.getItem('excelsior_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadAlerts = async () => {
    if (!profile) return
    setLoading(true)

    if (isStudent) {
      // Students see only their own alerts
      const { data } = await (supabase.from('attendance_alerts' as any) as any)
        .select('*').eq('student_id', profile.id).order('created_at', { ascending: false })
      setAlerts(data ?? [])
    } else {
      // Faculty / HOD: join with profiles to get student names
      let query = (supabase.from('attendance_alerts' as any) as any)
        .select('*, student:profiles!student_id(full_name, email, roll_number)')
        .order('created_at', { ascending: false })

      if (isFaculty && profile.section) {
        query = query.eq('section', profile.section)
      }
      if (filterSection) {
        query = query.eq('section', filterSection)
      }
      if (!showResolved) {
        query = query.is('cleared_at', null)
      }

      const { data } = await query
      setAlerts(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { if (profile) loadAlerts() }, [profile, filterSection, showResolved])

  const markMetHOD = async (alertId: string) => {
    await (supabase.from('attendance_alerts' as any) as any)
      .update({ met_hod: true, met_hod_at: new Date().toISOString() })
      .eq('id', alertId)
    setActionMsg('✓ Marked as met HOD')
    setTimeout(() => setActionMsg(''), 3000)
    loadAlerts()
  }

  const clearAlert = async (alertId: string) => {
    if (!profile) return
    await (supabase.from('attendance_alerts' as any) as any)
      .update({ cleared_by: profile.id, cleared_at: new Date().toISOString() })
      .eq('id', alertId)
    setActionMsg('✓ Alert cleared')
    setTimeout(() => setActionMsg(''), 3000)
    loadAlerts()
  }

  const reopenAlert = async (alertId: string) => {
    await (supabase.from('attendance_alerts' as any) as any)
      .update({ cleared_by: null, cleared_at: null })
      .eq('id', alertId)
    setActionMsg('✓ Alert reopened')
    setTimeout(() => setActionMsg(''), 3000)
    loadAlerts()
  }

  // HOD bulk: mark all pending met_hod = true + clear all in one go
  const clearAllMetHOD = async () => {
    if (!profile || !isHOD) return
    setBulkClearing(true)
    const pending = alerts.filter(a => !a.cleared_at)
    const ids = pending.map(a => a.id)
    if (ids.length === 0) { setBulkClearing(false); return }

    await (supabase.from('attendance_alerts' as any) as any)
      .update({
        met_hod: true,
        met_hod_at: new Date().toISOString(),
        cleared_by: profile.id,
        cleared_at: new Date().toISOString(),
      })
      .in('id', ids)

    setBulkClearing(false)
    setActionMsg(`✓ Cleared ${ids.length} alert${ids.length > 1 ? 's' : ''} — all marked as Met HOD`)
    setTimeout(() => setActionMsg(''), 4000)
    loadAlerts()
  }

  const pendingCount  = alerts.filter(a => !a.cleared_at).length
  const metHODCount   = alerts.filter(a => a.met_hod && !a.cleared_at).length
  const resolvedCount = alerts.filter(a => !!a.cleared_at).length

  const visibleAlerts = showResolved ? alerts : alerts.filter(a => !a.cleared_at)

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-primary">// SECTION: ALERTS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Attendance Alerts</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          {isStudent ? 'Your attendance alerts from faculty / HOD' : 'Alerts for absent and late students — students must meet HOD to clear'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="font-mono text-xs text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-bold text-red-500">{pendingCount}</p>
        </div>
        {!isStudent && (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="font-mono text-xs text-muted-foreground mb-1">Met HOD (pending clear)</p>
            <p className="text-2xl font-bold text-yellow-500">{metHODCount}</p>
          </div>
        )}
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="font-mono text-xs text-muted-foreground mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-500">{resolvedCount}</p>
        </div>
      </div>

      {/* Filters + bulk action (HOD only) */}
      {(isHOD || isFaculty) && (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-4">
          {isHOD && (
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Section</label>
              <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
                className="h-9 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                <option value="">All sections</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground cursor-pointer mt-4">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
            Show resolved alerts
          </label>
          {isHOD && pendingCount > 0 && (
            <button onClick={clearAllMetHOD} disabled={bulkClearing}
              className="ml-auto flex items-center gap-2 h-9 px-4 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 disabled:opacity-50">
              <CheckCheck className="w-3.5 h-3.5" />
              {bulkClearing ? 'Clearing...' : `Clear All — Met HOD (${pendingCount})`}
            </button>
          )}
        </div>
      )}

      {actionMsg && (
        <div className="font-mono text-xs text-green-500 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded">
          {actionMsg}
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="font-mono text-sm text-muted-foreground">Loading alerts…</p>
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground">
            {pendingCount === 0 ? 'No alerts — all clear!' : 'No alerts to show. Enable "Show resolved" to see past alerts.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {visibleAlerts.map(alert => {
            const isResolved = !!alert.cleared_at
            const hasMet     = !!alert.met_hod
            const alertInfo  = ALERT_LABELS[alert.alert_type] ?? { label: alert.alert_type, color: 'text-muted-foreground bg-accent border-border' }
            const partsLabel = alert.missed_parts?.length ? `Part ${alert.missed_parts.join(', ')}` : ''

            return (
              <div key={alert.id} className={`flex items-start gap-4 px-6 py-4 ${isResolved ? 'opacity-60' : ''}`}>
                <div className="mt-0.5 flex-shrink-0">
                  {isResolved
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : hasMet
                      ? <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      : <XCircle className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  {/* Student info (staff view) */}
                  {!isStudent && alert.student && (
                    <p className="font-medium text-sm truncate">
                      {alert.student.full_name}
                      {alert.student.roll_number && <span className="font-mono text-xs text-muted-foreground ml-2">{alert.student.roll_number}</span>}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${alertInfo.color}`}>{alertInfo.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{alert.section} · {alert.date}</span>
                    {partsLabel && <span className="font-mono text-xs text-muted-foreground">{partsLabel}</span>}
                  </div>
                  {isStudent && !hasMet && !isResolved && (
                    <p className="font-mono text-xs text-yellow-500 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Please meet the HOD regarding your attendance.
                    </p>
                  )}
                  {hasMet && (
                    <p className="font-mono text-xs text-green-500 mt-1">
                      ✓ Met HOD {alert.met_hod_at ? `on ${alert.met_hod_at.slice(0,10)}` : ''}
                    </p>
                  )}
                  {isResolved && (
                    <p className="font-mono text-xs text-muted-foreground mt-1">
                      Resolved {alert.cleared_at ? alert.cleared_at.slice(0,10) : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {/* Student: Mark Met HOD */}
                  {isStudent && !hasMet && !isResolved && (
                    <button onClick={() => markMetHOD(alert.id)}
                      className="font-mono text-xs px-3 py-1.5 rounded border border-green-500/30 text-green-500 hover:bg-green-500/10 whitespace-nowrap">
                      Met HOD
                    </button>
                  )}
                  {/* HOD: Clear or Reopen */}
                  {isHOD && !isResolved && (
                    <button onClick={() => clearAlert(alert.id)}
                      className="font-mono text-xs px-3 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10 whitespace-nowrap">
                      Clear
                    </button>
                  )}
                  {isHOD && isResolved && showResolved && (
                    <button onClick={() => reopenAlert(alert.id)}
                      className="font-mono text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 whitespace-nowrap">
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}