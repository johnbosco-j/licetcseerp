"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { sendEmail, emailTemplates } from "@/lib/email"
import type { AuthUser } from "@/lib/auth"
import { AlertTriangle, Mail, CheckCircle2, Clock, Users, Loader2, Filter, Send } from "lucide-react"

interface Alert {
  id:           string
  student_id:   string
  student_name: string
  student_email:string
  section:      string
  date:         string
  missed_parts: number[]
  alert_type:   string
  email_sent:   boolean
  email_sent_at:string | null
  met_hod:      boolean
  met_hod_at:   string | null
  cleared_by:   string | null
  notes:        string | null
  created_at:   string
}

const PART_LABELS: Record<number, string> = {
  1: 'Part I (8:00 AM — P1, P2)',
  2: 'Part II (10:10 AM — P3, P4, P5)',
  3: 'Part III (1:30 PM — P6, P7, P8)',
}

const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export function AlertsModule() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [alerts, setAlerts]       = useState<Alert[]>([])
  const [loading, setLoading]     = useState(false)
  const [sending, setSending]     = useState<string | null>(null)
  const [filterSection, setFilterSection] = useState('ALL')
  const [filterStatus, setFilterStatus]   = useState<'ALL'|'PENDING'|'EMAIL_SENT'|'MET_HOD'>('ALL')
  const [filterDate, setFilterDate]       = useState('')
  const [bulkSending, setBulkSending]     = useState(false)
  const [saveMsg, setSaveMsg]             = useState('')

  const isHOD = authUser?.type === 'staff' && authUser.data.role === 'HOD'

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff' || (au.data as any).role !== 'HOD') {
      router.push('/dashboard'); return
    }
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadAlerts = async () => {
    setLoading(true)
    // Load alerts with student info
    const { data: alertData } = await (supabase.from('attendance_alerts' as any) as any)
      .select('*').order('date', { ascending: false }).order('created_at', { ascending: false })

    if (!alertData) { setLoading(false); return }

    // Load student profiles
    const studentIds = [...new Set(alertData.map((a: any) => a.student_id))]
    const { data: students } = await supabase.from('profiles')
      .select('id, full_name, email').in('id', studentIds)

    const studentMap: Record<string, any> = {}
    students?.forEach((s: any) => { studentMap[s.id] = s })

    const enriched: Alert[] = alertData.map((a: any) => ({
      ...a,
      student_name:  studentMap[a.student_id]?.full_name ?? 'Unknown',
      student_email: studentMap[a.student_id]?.email ?? '',
    }))

    setAlerts(enriched)
    setLoading(false)
  }

  // Auto-generate alerts from today's day attendance
  const generateTodayAlerts = async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // Load today's day attendance
    const { data: dayAtt } = await (supabase.from('day_attendance' as any) as any)
      .select('*').eq('date', today)

    if (!dayAtt?.length) { setLoading(false); setSaveMsg('No attendance marked today'); return }

    // Group by student
    const byStudent: Record<string, { section: string; parts: Record<number, string> }> = {}
    dayAtt.forEach((r: any) => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { section: r.section, parts: {} }
      byStudent[r.student_id].parts[r.part] = r.status
    })

    let created = 0
    for (const [studentId, data] of Object.entries(byStudent)) {
      const missedParts = Object.entries(data.parts)
        .filter(([_, status]) => status === 'ABSENT')
        .map(([part]) => Number(part))

      if (missedParts.length === 0) continue

      const alertType = missedParts.length === 3 ? 'FULL_ABSENT' : 'PARTIAL_ABSENT'

      // Check if alert already exists for today
      const { data: existing } = await (supabase.from('attendance_alerts' as any) as any)
        .select('id').eq('student_id', studentId).eq('date', today).limit(1)

      if (existing?.length) continue

      await (supabase.from('attendance_alerts' as any) as any).insert({
        student_id:   studentId,
        section:      data.section,
        date:         today,
        missed_parts: missedParts,
        alert_type:   alertType,
        email_sent:   false,
        met_hod:      false,
      })
      created++
    }

    setLoading(false)
    setSaveMsg(`✓ Generated ${created} alerts for today`)
    setTimeout(() => setSaveMsg(''), 4000)
    loadAlerts()
  }

  useEffect(() => { if (profile) loadAlerts() }, [profile])

  const sendAlertEmail = async (alert: Alert) => {
    setSending(alert.id)
    const missedLabels = alert.missed_parts.map(p => PART_LABELS[p])
    const tmpl = emailTemplates.attendanceAlert(
      alert.student_name, alert.section,
      new Date(alert.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      missedLabels
    )
    const result = await sendEmail({ to: alert.student_email, ...tmpl })
    if (result.success) {
      await (supabase.from('attendance_alerts' as any) as any)
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', alert.id)
      setSaveMsg(`✓ Email sent to ${alert.student_name}`)
      loadAlerts()
    } else {
      setSaveMsg(`✗ Failed: ${result.error}`)
    }
    setSending(null)
    setTimeout(() => setSaveMsg(''), 5000)
  }

  const sendBulkAlerts = async () => {
    setBulkSending(true)
    const unsent = filtered.filter(a => !a.email_sent)
    let count = 0
    for (const alert of unsent) {
      const missedLabels = alert.missed_parts.map(p => PART_LABELS[p])
      const tmpl = emailTemplates.attendanceAlert(
        alert.student_name, alert.section,
        new Date(alert.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
        missedLabels
      )
      const result = await sendEmail({ to: alert.student_email, ...tmpl })
      if (result.success) {
        await (supabase.from('attendance_alerts' as any) as any)
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq('id', alert.id)
        count++
      }
      await new Promise(r => setTimeout(r, 200)) // rate limit
    }
    setBulkSending(false)
    setSaveMsg(`✓ Sent ${count}/${unsent.length} emails`)
    setTimeout(() => setSaveMsg(''), 5000)
    loadAlerts()
  }

  const markMetHOD = async (alertId: string, met: boolean) => {
    await (supabase.from('attendance_alerts' as any) as any).update({
      met_hod: met,
      met_hod_at: met ? new Date().toISOString() : null,
      cleared_by: profile?.id,
      cleared_at: met ? new Date().toISOString() : null,
    }).eq('id', alertId)
    loadAlerts()
  }

  const updateNotes = async (alertId: string, notes: string) => {
    await (supabase.from('attendance_alerts' as any) as any)
      .update({ notes }).eq('id', alertId)
    loadAlerts()
  }

  const filtered = alerts.filter(a => {
    if (filterSection !== 'ALL' && a.section !== filterSection) return false
    if (filterDate && a.date !== filterDate) return false
    if (filterStatus === 'PENDING'    && (a.email_sent || a.met_hod)) return false
    if (filterStatus === 'EMAIL_SENT' && (!a.email_sent || a.met_hod)) return false
    if (filterStatus === 'MET_HOD'    && !a.met_hod) return false
    return true
  })

  const stats = {
    total:     alerts.length,
    unsent:    alerts.filter(a => !a.email_sent).length,
    sent:      alerts.filter(a => a.email_sent && !a.met_hod).length,
    metHod:    alerts.filter(a => a.met_hod).length,
    fullAbsent: alerts.filter(a => a.alert_type === 'FULL_ABSENT' && !a.met_hod).length,
  }

  if (!isHOD) return (
    <div className="p-6">
      <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
        <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="font-mono text-sm text-slate-400">Alerts module is restricted to HOD</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-cyan-400">// SECTION: ATTENDANCE ALERTS</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Attendance Alerts</h1>
          <p className="font-mono text-xs text-slate-400 mt-1">
            Auto-generate alerts for absent students · Send emails · Track who has met HOD
          </p>
        </div>
        <div className="flex gap-2">
          {saveMsg && <span className={`font-mono text-xs self-center ${saveMsg.startsWith('✗') ? 'text-red-500' : 'text-green-500'}`}>{saveMsg}</span>}
          <button onClick={generateTodayAlerts} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded border border-white/10 hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80 transition-colors">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
            Generate Today's Alerts
          </button>
          {stats.unsent > 0 && (
            <button onClick={sendBulkAlerts} disabled={bulkSending}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-red-700 transition-colors disabled:opacity-50">
              {bulkSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {bulkSending ? 'Sending...' : `Send All (${stats.unsent})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Alerts',    value: stats.total,      color: 'text-foreground' },
          { label: 'Email Pending',   value: stats.unsent,     color: 'text-red-500' },
          { label: 'Email Sent',      value: stats.sent,       color: 'text-yellow-500' },
          { label: 'Met HOD',         value: stats.metHod,     color: 'text-green-500' },
          { label: 'Full Absent',     value: stats.fullAbsent, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
            <p className="font-mono text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
          className="h-8 px-2 bg-transparent border border-white/10 rounded font-mono text-xs focus:border-primary focus:outline-none">
          <option value="ALL">All Sections</option>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="h-8 px-2 bg-transparent border border-white/10 rounded font-mono text-xs focus:border-primary focus:outline-none" />
        {['ALL','PENDING','EMAIL_SENT','MET_HOD'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f as any)}
            className={`font-mono text-xs px-3 py-1 rounded border transition-all ${filterStatus === f ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] border-primary' : 'border-white/10 text-slate-400 hover:border-cyan-500/50'}`}>
            {f.replace('_',' ')}
          </button>
        ))}
        {(filterSection !== 'ALL' || filterDate || filterStatus !== 'ALL') && (
          <button onClick={() => { setFilterSection('ALL'); setFilterDate(''); setFilterStatus('ALL') }}
            className="font-mono text-xs text-slate-400 hover:text-foreground">
            Clear filters
          </button>
        )}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
            <p className="font-mono text-sm text-slate-400">Loading alerts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="font-mono text-sm text-slate-400">No alerts match this filter</p>
          </div>
        ) : filtered.map(alert => (
          <div key={alert.id}
            className={`bg-[#0a101d]/60 backdrop-blur-xl border rounded-lg p-5 transition-all ${
              alert.met_hod ? 'border-green-500/20 opacity-70' :
              alert.email_sent ? 'border-yellow-500/20' : 'border-red-500/20'
            }`}>
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Status badge */}
                  {alert.met_hod ? (
                    <span className="font-mono text-xs px-2 py-0.5 rounded border text-green-500 bg-green-500/10 border-green-500/20">
                      ✓ Met HOD
                    </span>
                  ) : alert.email_sent ? (
                    <span className="font-mono text-xs px-2 py-0.5 rounded border text-yellow-500 bg-yellow-500/10 border-yellow-500/20">
                      📧 Email Sent
                    </span>
                  ) : (
                    <span className="font-mono text-xs px-2 py-0.5 rounded border text-red-500 bg-red-500/10 border-red-500/20">
                      ⚠ Alert Pending
                    </span>
                  )}
                  <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                    alert.alert_type === 'FULL_ABSENT'
                      ? 'text-red-600 bg-red-600/10 border-red-600/20'
                      : 'text-orange-500 bg-orange-500/10 border-orange-500/20'
                  }`}>
                    {alert.alert_type === 'FULL_ABSENT' ? 'Full Day Absent' : 'Partial Absent'}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{alert.section}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {new Date(alert.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                <p className="font-bold text-sm">{alert.student_name}</p>
                <p className="font-mono text-xs text-slate-400">{alert.student_email}</p>

                <div className="flex flex-wrap gap-1 mt-2">
                  {alert.missed_parts.map(p => (
                    <span key={p} className="font-mono text-xs px-2 py-0.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                      {PART_LABELS[p]}
                    </span>
                  ))}
                </div>

                {alert.email_sent_at && (
                  <p className="font-mono text-xs text-slate-400 mt-1">
                    Email sent: {new Date(alert.email_sent_at).toLocaleString()}
                  </p>
                )}
                {alert.met_hod_at && (
                  <p className="font-mono text-xs text-green-500 mt-1">
                    Met HOD: {new Date(alert.met_hod_at).toLocaleString()}
                  </p>
                )}

                {/* Notes */}
                <div className="mt-2">
                  <input
                    defaultValue={alert.notes ?? ''}
                    onBlur={e => { if (e.target.value !== (alert.notes ?? '')) updateNotes(alert.id, e.target.value) }}
                    placeholder="Add notes (e.g. called parent, medical reason)..."
                    className="w-full h-8 px-2 bg-transparent border border-white/10 rounded font-mono text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                {!alert.email_sent && (
                  <button onClick={() => sendAlertEmail(alert)}
                    disabled={sending === alert.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-red-700 transition-colors disabled:opacity-50">
                    {sending === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    Send Email
                  </button>
                )}
                {alert.email_sent && !alert.met_hod && (
                  <button onClick={() => sendAlertEmail(alert)}
                    disabled={sending === alert.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded border border-white/10 hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80 transition-colors disabled:opacity-50">
                    <Mail className="w-3 h-3" /> Resend
                  </button>
                )}
                {!alert.met_hod ? (
                  <button onClick={() => markMetHOD(alert.id, true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:text-white transition-all font-mono text-xs rounded hover:bg-green-700 transition-colors">
                    <CheckCircle2 className="w-3 h-3" /> Met HOD
                  </button>
                ) : (
                  <button onClick={() => markMetHOD(alert.id, false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-mono text-xs rounded border border-white/10 hover:bg-white/5 border border-white/10 hover:bg-white/10 transition-colors/80 transition-colors text-slate-400">
                    Unmark
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
