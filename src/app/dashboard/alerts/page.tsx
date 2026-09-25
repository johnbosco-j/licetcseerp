"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Bell, CheckCircle, XCircle, Clock, AlertTriangle, CheckCheck } from "lucide-react"
import { reportResult } from "@/components/toaster"

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
  ABSENT_ON_NO_INFO: { label: 'Absent (No Info)',   color: 'text-red-700 bg-red-50 border-red-200' },
  LATE_THRESHOLD:    { label: '3× Late This Month', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  PARTIAL_ABSENT:    { label: 'Partly Absent',      color: 'text-amber-700 bg-amber-50 border-amber-200' },
  FULL_ABSENT:       { label: 'Absent Full Day',    color: 'text-red-700 bg-red-50 border-red-200' },
  LATE:              { label: 'Late',               color: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export default function AlertsPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [filterSection, setFilterSection] = useState('')
  const [showResolved, setShowResolved]   = useState(false)
  const [bulkClearing, setBulkClearing]   = useState(false)

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
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

  useEffect(() => { if (profile?.advisor_section && isFaculty && !isHOD) setFilterSection(profile.advisor_section) }, [profile, isFaculty, isHOD])
  useEffect(() => { if (profile) loadAlerts() }, [profile, filterSection, showResolved])

  const markMetHOD = async (alertId: string) => {
    const { error } = await supabase.rpc('acknowledge_alert', { p_alert: alertId })
    if (reportResult(error, 'Marked as met HOD. The HOD will clear the alert.')) loadAlerts()
  }

  const clearAlert = async (alertId: string) => {
    if (!profile) return
    const { error } = await supabase.from('attendance_alerts')
      .update({ cleared_by: profile.id, cleared_at: new Date().toISOString() })
      .eq('id', alertId)
    if (reportResult(error, 'Alert cleared')) loadAlerts()
  }

  const reopenAlert = async (alertId: string) => {
    const { error } = await supabase.from('attendance_alerts')
      .update({ cleared_by: null, cleared_at: null })
      .eq('id', alertId)
    if (reportResult(error, 'Alert reopened')) loadAlerts()
  }

  // HOD bulk: mark all pending met_hod = true + clear all in one go
  const clearAllMetHOD = async () => {
    if (!profile || !isHOD) return
    const ids = alerts.filter(a => !a.cleared_at).map(a => a.id)
    if (ids.length === 0) return
    if (!confirm(`Clear all ${ids.length} pending alert${ids.length > 1 ? 's' : ''} and mark them as Met HOD?`)) return
    setBulkClearing(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('attendance_alerts')
      .update({ met_hod: true, met_hod_at: now, cleared_by: profile.id, cleared_at: now })
      .in('id', ids)
    setBulkClearing(false)
    if (reportResult(error, `Cleared ${ids.length} alert${ids.length > 1 ? 's' : ''}`)) loadAlerts()
  }

  const pendingCount  = alerts.filter(a => !a.cleared_at).length
  const metHODCount   = alerts.filter(a => a.met_hod && !a.cleared_at).length
  const resolvedCount = alerts.filter(a => !!a.cleared_at).length

  const visibleAlerts = showResolved ? alerts : alerts.filter(a => !a.cleared_at)

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">ALERTS</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Attendance Alerts</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          {isStudent ? 'Your attendance alerts from faculty / HOD' : 'Alerts for absent and late students — students must meet HOD to clear'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-bold text-red-700">{pendingCount}</p>
        </div>
        {!isStudent && (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Met HOD (pending clear)</p>
            <p className="text-2xl font-bold text-amber-700">{metHODCount}</p>
          </div>
        )}
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-700">{resolvedCount}</p>
        </div>
      </div>

      {/* Filters + bulk action (HOD only) */}
      {(isHOD || isFaculty) && (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-4">
          {isHOD && (
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Section</label>
              <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
                className="h-9 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
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
              className="ml-auto flex items-center gap-2 h-9 px-4 bg-green-700 text-white text-[13px] font-semibold rounded-md hover:bg-green-800 disabled:opacity-50">
              <CheckCheck className="w-3.5 h-3.5" />
              {bulkClearing ? 'Clearing...' : `Clear All — Met HOD (${pendingCount})`}
            </button>
          )}
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
          <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="font-mono text-sm text-muted-foreground">Loading alerts…</p>
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground">
            {pendingCount === 0 ? 'No pending alerts.' : 'No alerts to show. Enable "Show resolved" to see past alerts.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {visibleAlerts.map(alert => {
            const isResolved = !!alert.cleared_at
            const hasMet     = !!alert.met_hod
            const alertInfo  = ALERT_LABELS[alert.alert_type] ?? { label: alert.alert_type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase()), color: 'text-muted-foreground bg-accent border-border' }
            const partsLabel = alert.missed_parts?.length ? `Part ${alert.missed_parts.join(', ')}` : ''

            return (
              <div key={alert.id} className={`flex items-start gap-4 px-6 py-4 ${isResolved ? 'opacity-60' : ''}`}>
                <div className="mt-0.5 flex-shrink-0">
                  {isResolved
                    ? <CheckCircle className="w-4 h-4 text-green-700" />
                    : hasMet
                      ? <AlertTriangle className="w-4 h-4 text-amber-700" />
                      : <XCircle className="w-4 h-4 text-red-700" />
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
                    <p className="font-mono text-xs text-amber-700 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Please meet the HOD regarding your attendance.
                    </p>
                  )}
                  {hasMet && (
                    <p className="font-mono text-xs text-green-700 mt-1">
                      ✓ Met HOD {alert.met_hod_at ? `on ${alert.met_hod_at.slice(0,10)}` : ''}
                    </p>
                  )}
                  {isResolved && (
                    <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
                      Resolved {alert.cleared_at ? alert.cleared_at.slice(0,10) : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {/* Student: Mark Met HOD */}
                  {isStudent && !hasMet && !isResolved && (
                    <button onClick={() => markMetHOD(alert.id)}
                      className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-green-200 text-green-700 hover:bg-green-50 whitespace-nowrap">
                      Met HOD
                    </button>
                  )}
                  {/* HOD: Clear or Reopen */}
                  {isHOD && !isResolved && (
                    <button onClick={() => clearAlert(alert.id)}
                      className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 whitespace-nowrap">
                      Clear
                    </button>
                  )}
                  {isHOD && isResolved && showResolved && (
                    <button onClick={() => reopenAlert(alert.id)}
                      className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/50 whitespace-nowrap">
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