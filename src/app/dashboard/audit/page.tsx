"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, History, Loader2, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { PageHeader, Card, CardHeader, Badge, EmptyState, Stat, btn, field } from "@/components/ui/page"

interface AuditRow {
  id: number
  at: string
  actor: string | null
  actor_role: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  row_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip: string | null
}

const TABLE_LABEL: Record<string, string> = {
  marks: 'Marks', attendance: 'Subject attendance', day_attendance: 'Day attendance', subject_locks: 'Locks',
  subjects: 'Subjects', profiles: 'Profiles', finance_ledger: 'Finance', leaves: 'Leaves', grievances: 'Grievances',
  attendance_alerts: 'Attendance alerts', promotion_log: 'Promotion', inventory: 'Inventory', placements: 'Placements',
}
const PAGE = 200

const isMarkAlteration = (r: AuditRow) =>
  r.table_name === 'marks' && (r.action === 'DELETE' ||
    (r.action === 'UPDATE' && String(r.old_data?.marks_obtained) !== String(r.new_data?.marks_obtained)))

function changes(r: AuditRow): string {
  if (r.action === 'INSERT') return 'Created'
  if (r.action === 'DELETE') return 'Deleted'
  const o = r.old_data ?? {}, n = r.new_data ?? {}
  return Object.keys(n)
    .filter(k => !['updated_at', 'created_at'].includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map(k => `${k}: ${fmt(o[k])} → ${fmt(n[k])}`).join(' · ') || 'No visible change'
}
const fmt = (v: unknown) => v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)

export default function AuditPage() {
  const [rows, setRows]       = useState<AuditRow[]>([])
  const [names, setNames]     = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [table, setTable]     = useState('ALL')
  const [onlyAlerts, setOnlyAlerts] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    let q = supabase.from('audit_log' as never).select('*').order('at', { ascending: false }).limit(PAGE)
    if (table !== 'ALL') q = q.eq('table_name', table)
    const { data, error: e } = await q as unknown as { data: AuditRow[] | null; error: { message: string } | null }
    if (e) { setError(e.message); setLoading(false); return }
    const list = data ?? []
    setRows(list)
    const ids = [...new Set(list.map(r => r.actor).filter(Boolean))] as string[]
    const subjectIds = [...new Set(list.flatMap(r => [r.new_data?.student_id, r.old_data?.student_id]).filter(Boolean))] as string[]
    const all = [...new Set([...ids, ...subjectIds])]
    if (all.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', all)
      setNames(Object.fromEntries((profs ?? []).map(p => [p.id, p.full_name])))
    }
    setLoading(false)
  }, [table])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => onlyAlerts ? rows.filter(isMarkAlteration) : rows, [rows, onlyAlerts])
  const alertCount = useMemo(() => rows.filter(isMarkAlteration).length, [rows])

  return (
    <div className="p-6 space-y-6">
      <PageHeader kicker="Audit" title="Audit Log"
        description="Every change to marks, attendance, profiles and other records — who made it, when, and from where. Entries cannot be edited or deleted (Examination Policy §16.2)."
        actions={<button onClick={load} className={btn.secondary}><RefreshCw size={14} /> Refresh</button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Entries shown" value={rows.length} sub={`Latest ${PAGE}`} icon={History} />
        <Stat label="Mark alterations" value={alertCount} sub="Changes to existing marks" icon={AlertTriangle} />
        <Stat label="People involved" value={Object.keys(names).length} sub="Actors and students" />
      </div>

      <Card>
        <CardHeader title="Activity"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select value={table} onChange={e => setTable(e.target.value)} className={`${field} w-auto`} aria-label="Record type">
                <option value="ALL">All records</option>
                {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="flex items-center gap-2 text-[13px] text-licet-indigo">
                <input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} className="accent-[#1A0C4E]" />
                Mark alterations only
              </label>
            </div>
          } />
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load the audit log">{error}</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={History} title="Nothing recorded yet">Changes appear here as soon as anyone edits records.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="px-5 py-2.5 whitespace-nowrap">When</th>
                  <th className="px-5 py-2.5">Who</th>
                  <th className="px-5 py-2.5">Record</th>
                  <th className="px-5 py-2.5">Change</th>
                  <th className="px-5 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(r => {
                  const student = (r.new_data?.student_id ?? r.old_data?.student_id) as string | undefined
                  return (
                    <tr key={r.id} className={isMarkAlteration(r) ? 'bg-amber-50/60' : undefined}>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {new Date(r.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-licet-indigo">{r.actor ? names[r.actor] ?? 'Unknown user' : 'System'}</p>
                        {r.actor_role && <p className="text-[11px] text-muted-foreground">{r.actor_role}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge tone={r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'indigo'}>{r.action.toLowerCase()}</Badge>
                          <span>{TABLE_LABEL[r.table_name] ?? r.table_name}</span>
                          {isMarkAlteration(r) && <Badge tone="amber"><AlertTriangle size={11} /> Mark alteration</Badge>}
                        </div>
                        {student && <p className="text-[11.5px] text-muted-foreground mt-0.5">Student: {names[student] ?? student.slice(0, 8)}</p>}
                      </td>
                      <td className="px-5 py-3 text-[12.5px] max-w-[420px]">{changes(r)}</td>
                      <td className="px-5 py-3 text-[12px] text-muted-foreground tabular-nums">{r.ip || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
