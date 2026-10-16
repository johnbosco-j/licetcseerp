"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Save, Trash2, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { NAV_FACULTY_IDS, NAV_STUDENT_IDS } from "@/lib/roles"
import type { Vertical, StudentGroup } from "@/lib/academic"
import { inputCls, btnCls, ghostCls } from "./terms-tab"

// ── Verticals and groups ───────────────────────────────────────────────────
export function GroupsTab({ verticals, groups, reload }: { verticals: Vertical[]; groups: StudentGroup[]; reload: () => void }) {
  const [vs, setVs] = useState(verticals)
  const [gs, setGs] = useState(groups)
  useEffect(() => setVs(verticals), [verticals])
  useEffect(() => setGs(groups), [groups])
  const saveV = async (v: Vertical, isNew = false) => {
    const row = { code: v.code.trim().toUpperCase(), name: v.name, description: v.description, course_codes: v.course_codes, is_active: v.is_active }
    const { error } = isNew ? await supabase.from('verticals').insert(row) : await supabase.from('verticals').update(row).eq('code', v.code)
    if (reportResult(error, 'Vertical saved')) reload()
  }
  const saveG = async (g: StudentGroup) => {
    const { error } = await supabase.from('student_groups').update({ name: g.name, kind: g.kind, cohort_grad_year: g.cohort_grad_year, section: g.section || null }).eq('id', g.id)
    reportResult(error, 'Group saved')
  }
  const addG = async () => {
    const { error } = await supabase.from('student_groups').insert({ name: 'New group', kind: 'ELECTIVE' })
    if (reportResult(error, 'Group added — rename it, then tick its members in the Students tab')) reload()
  }
  const delG = async (g: StudentGroup) => {
    if (!confirm(`Delete group "${g.name}"?`)) return
    const { error } = await supabase.from('student_groups').delete().eq('id', g.id)
    if (reportResult(error, 'Deleted')) reload()
  }
  const [nv, setNv] = useState<Vertical>({ code: '', name: '', description: '', course_codes: [], is_active: true })
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-white p-4 space-y-3">
        <p className="eyebrow">Verticals (professional elective streams, R2024)</p>
        <p className="text-[12.5px] text-muted-foreground">Students choose a vertical in III year. Courses of a vertical are taught to that vertical across both sections; set each student’s vertical in the Students tab.</p>
        {vs.map((v, i) => (
          <div key={v.code} className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold w-16">{v.code}</span>
            <input value={v.name} onChange={e => setVs(xs => xs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={`${inputCls} w-72`} />
            <input value={v.course_codes.join(', ')} onChange={e => setVs(xs => xs.map((x, j) => j === i ? { ...x, course_codes: e.target.value.split(/[ ,]+/).filter(Boolean) } : x))} className={`${inputCls} flex-1 min-w-[240px] font-mono`} title="Course codes in this vertical" />
            <label className="text-[12.5px]"><input type="checkbox" checked={v.is_active} onChange={e => setVs(xs => xs.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} className="accent-licet-indigo mr-1" />active</label>
            <button onClick={() => saveV(vs[i])} className={ghostCls}><Save className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <input placeholder="Code e.g. DS" value={nv.code} onChange={e => setNv({ ...nv, code: e.target.value })} className={`${inputCls} w-24`} />
          <input placeholder="Name e.g. Data Science" value={nv.name} onChange={e => setNv({ ...nv, name: e.target.value })} className={`${inputCls} w-72`} />
          <input placeholder="Course codes, comma separated" value={nv.course_codes.join(', ')} onChange={e => setNv({ ...nv, course_codes: e.target.value.split(/[ ,]+/).filter(Boolean) })} className={`${inputCls} flex-1 min-w-[200px]`} />
          <button onClick={() => saveV(nv, true)} disabled={!nv.code || !nv.name} className={btnCls}><Plus className="w-4 h-4" /> Add vertical</button>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between"><p className="eyebrow">Other groups (honours, minors, open electives)</p><button onClick={addG} className={ghostCls}><Plus className="w-4 h-4" /> Add group</button></div>
        {gs.map((g, i) => (
          <div key={g.id} className="flex flex-wrap items-center gap-2">
            <input value={g.name} onChange={e => setGs(xs => xs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={`${inputCls} w-72`} />
            <select value={g.kind} onChange={e => setGs(xs => xs.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))} className={inputCls}>{['ELECTIVE', 'HONOURS', 'MINOR', 'CUSTOM'].map(k => <option key={k}>{k}</option>)}</select>
            <input type="number" placeholder="Batch e.g. 2027" value={g.cohort_grad_year ?? ''} onChange={e => setGs(xs => xs.map((x, j) => j === i ? { ...x, cohort_grad_year: Number(e.target.value) || null } : x))} className={`${inputCls} w-32`} />
            <button onClick={() => saveG(gs[i])} className={ghostCls}><Save className="w-4 h-4" /></button>
            <button onClick={() => delG(g)} className="text-red-700 text-[12px] inline-flex items-center gap-1 hover:underline"><Trash2 className="w-3.5 h-3.5" /> delete</button>
          </div>
        ))}
        {!gs.length && <p className="text-[13px] text-muted-foreground">No groups yet.</p>}
      </section>
    </div>
  )
}

// ── Attendance rules ───────────────────────────────────────────────────────
const RULES: { key: string; label: string; help: string; kind: 'number' | 'bool' }[] = [
  { key: 'attendance.lock_minutes', label: 'Lock after submission (minutes)', help: 'A submitted hour can be corrected for this long, then only the HOD can change it.', kind: 'number' },
  { key: 'attendance.min_percent', label: 'Minimum attendance for the exam (%)', help: 'Regulation 7.1 — normally 75.', kind: 'number' },
  { key: 'attendance.condonation_percent', label: 'Condonation floor (%)', help: 'Regulation 7.2 — between this and the minimum only with medical / sports documents. Below it: SA.', kind: 'number' },
  { key: 'attendance.self_mark_enabled', label: 'Allow self check-in (QR + Attendance Station)', help: 'Staff can open a 10-minute self check-in from the marking screen.', kind: 'bool' },
  { key: 'attendance.qr_rotate_seconds', label: 'QR code changes every (seconds)', help: 'Used by the Attendance Station; shorter makes forwarding a photo of the QR useless.', kind: 'number' },
]
export function RulesTab({ settings, reload }: { settings: Record<string, unknown>; reload: () => void }) {
  const [vals, setVals] = useState<Record<string, unknown>>(settings)
  useEffect(() => setVals(settings), [settings])
  const save = async (key: string) => {
    const { error } = await supabase.from('app_settings').upsert({ key, value: vals[key], updated_at: new Date().toISOString() })
    if (reportResult(error, 'Saved')) reload()
  }
  return (
    <div className="rounded-lg border border-border bg-white divide-y divide-border">
      {RULES.map(r => (
        <div key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-[240px]"><p className="font-semibold text-[14px]">{r.label}</p><p className="text-[12.5px] text-muted-foreground">{r.help}</p></div>
          {r.kind === 'number'
            ? <input type="number" value={String(vals[r.key] ?? '')} onChange={e => setVals({ ...vals, [r.key]: Number(e.target.value) })} className={`${inputCls} w-24`} />
            : <input type="checkbox" checked={vals[r.key] === true || vals[r.key] === 'true'} onChange={e => setVals({ ...vals, [r.key]: e.target.checked })} className="w-5 h-5 accent-licet-indigo" />}
          <button onClick={() => save(r.key)} className={ghostCls}><Save className="w-4 h-4" /> Save</button>
        </div>
      ))}
    </div>
  )
}

// ── Menus ──────────────────────────────────────────────────────────────────
export function MenusTab({ settings, labels, reload }: { settings: Record<string, unknown>; labels: Record<string, string>; reload: () => void }) {
  const init = (settings['nav.hidden'] ?? { FACULTY: [], STUDENT: [] }) as Record<string, string[]>
  const [hidden, setHidden] = useState<Record<string, string[]>>(init)
  useEffect(() => setHidden((settings['nav.hidden'] ?? { FACULTY: [], STUDENT: [] }) as Record<string, string[]>), [settings])
  const toggle = (role: string, id: string) => setHidden(h => ({ ...h, [role]: (h[role] ?? []).includes(id) ? h[role].filter(x => x !== id) : [...(h[role] ?? []), id] }))
  const save = async () => {
    const { error } = await supabase.from('app_settings').upsert({ key: 'nav.hidden', value: hidden, updated_at: new Date().toISOString() })
    if (reportResult(error, 'Menus saved — users see the change the next time a page loads')) reload()
  }
  const col = (role: 'FACULTY' | 'STUDENT', ids: string[]) => (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="eyebrow mb-2">{role === 'FACULTY' ? 'Faculty see' : 'Students see'}</p>
      {ids.filter(id => !['dashboard', 'change-password', 'profile'].includes(id)).map(id => (
        <label key={id} className="flex items-center gap-2 py-1 text-[13.5px]">
          <input type="checkbox" checked={!(hidden[role] ?? []).includes(id)} onChange={() => toggle(role, id)} className="accent-licet-indigo w-4 h-4" />{labels[id] ?? id}
        </label>
      ))}
    </div>
  )
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">Untick a module to hide it from that role’s menu (and block the page). The HOD always sees everything. Dashboard, Profile and Change password are always on.</p>
      <div className="grid sm:grid-cols-2 gap-3">{col('FACULTY', NAV_FACULTY_IDS)}{col('STUDENT', NAV_STUDENT_IDS)}</div>
      <button onClick={save} className={btnCls}><Save className="w-4 h-4" /> Save menus</button>
    </div>
  )
}

// ── Data editor (any record) ───────────────────────────────────────────────
const TABLES: { name: string; label: string; pk: string[]; readOnly?: boolean; order?: string }[] = [
  { name: 'profiles', label: 'People (students & staff)', pk: ['id'], order: 'full_name' },
  { name: 'subjects', label: 'Courses (offerings)', pk: ['id'], order: 'code' },
  { name: 'timetable_entries', label: 'Timetable hours', pk: ['id'] },
  { name: 'attendance_sessions', label: 'Attendance hours', pk: ['id'], order: 'date' },
  { name: 'academic_terms', label: 'Terms', pk: ['id'] },
  { name: 'calendar_days', label: 'Calendar days', pk: ['date', 'scope'], order: 'date' },
  { name: 'period_slots', label: 'Period timings', pk: ['id'] },
  { name: 'verticals', label: 'Verticals', pk: ['code'] },
  { name: 'student_groups', label: 'Groups', pk: ['id'] },
  { name: 'student_group_members', label: 'Group members', pk: ['group_id', 'student_id'] },
  { name: 'subject_faculty', label: 'Course ↔ faculty links', pk: ['subject_id', 'faculty_id'] },
  { name: 'marks', label: 'Marks', pk: ['id'], order: 'recorded_at' },
  { name: 'announcements', label: 'Notices, events, documents, timetable notes', pk: ['id'], order: 'created_at' },
  { name: 'leaves', label: 'Leave requests', pk: ['id'], order: 'created_at' },
  { name: 'placements', label: 'Placement drives', pk: ['id'], order: 'created_at' },
  { name: 'placement_offers', label: 'Placement offers', pk: ['id'], order: 'created_at' },
  { name: 'grievances', label: 'Grievances', pk: ['id'], order: 'created_at' },
  { name: 'inventory', label: 'Inventory', pk: ['id'], order: 'created_at' },
  { name: 'attendance_alerts', label: 'Attendance alerts', pk: ['id'], order: 'created_at' },
  { name: 'subject_locks', label: 'Marks / attendance locks', pk: ['id'] },
  { name: 'app_settings', label: 'Settings', pk: ['key'] },
  { name: 'attendance_verifications', label: 'Register verifications', pk: ['id'] },
  { name: 'departments', label: 'Departments', pk: ['id'] },
  { name: 'finance_ledger', label: 'Finance ledger (tamper-evident, read only)', pk: ['id'], readOnly: true, order: 'sequence_no' },
  { name: 'audit_log', label: 'Audit log (read only)', pk: ['id'], readOnly: true, order: 'at' },
]

type Row = Record<string, unknown>
const show = (v: unknown) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function DataEditorTab() {
  const [table, setTable] = useState(TABLES[0].name)
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const [col, setCol] = useState('')
  const [edits, setEdits] = useState<Record<number, Row>>({})
  const [loading, setLoading] = useState(false)
  const [newJson, setNewJson] = useState('')
  const meta = TABLES.find(t => t.name === table)!

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from(table).select('*')
    if (filter.trim() && col) q = q.ilike(col, `%${filter.trim()}%`)
    if (meta.order) q = q.order(meta.order, { ascending: !['created_at', 'recorded_at', 'at', 'sequence_no', 'date'].includes(meta.order) })
    const { data, error } = await q.range(page * 50, page * 50 + 49)
    if (error) toast.error(error.message)
    setRows((data ?? []) as Row[]); setEdits({}); setLoading(false)
  }, [table, page, filter, col, meta.order])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0); setFilter(''); setCol('') }, [table])

  const columns = useMemo(() => [...new Set(rows.flatMap(r => Object.keys(r)))], [rows])

  const parse = (orig: unknown, text: string): unknown => {
    if (text === '') return null
    if (typeof orig === 'number') return Number(text)
    if (typeof orig === 'boolean') return text === 'true'
    if (orig !== null && typeof orig === 'object') { try { return JSON.parse(text) } catch { return orig } }
    return text
  }
  const saveRow = async (i: number) => {
    const patch = edits[i]
    let q = supabase.from(table).update(patch)
    for (const k of meta.pk) q = q.eq(k, rows[i][k] as string)
    const { error } = await q
    if (reportResult(error, 'Saved')) { setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r)); setEdits(e => { const n = { ...e }; delete n[i]; return n }) }
  }
  const delRow = async (i: number) => {
    if (!confirm('Delete this record permanently? (It is kept in the audit trail.)')) return
    let q = supabase.from(table).delete()
    for (const k of meta.pk) q = q.eq(k, rows[i][k] as string)
    const { error } = await q
    if (reportResult(error, 'Deleted')) load()
  }
  const addRow = async () => {
    let obj: Row
    try { obj = JSON.parse(newJson) } catch { toast.error('That is not valid JSON'); return }
    const { error } = await supabase.from(table).insert(obj)
    if (reportResult(error, 'Added')) { setNewJson(''); load() }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">Edit any record directly. Changes go through the same security rules and are written to the audit trail. Prefer the dedicated tabs and pages where they exist — this is for anything they don’t cover.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={table} onChange={e => setTable(e.target.value)} className={inputCls}>{TABLES.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}</select>
        <select value={col} onChange={e => setCol(e.target.value)} className={inputCls}><option value="">Search column…</option>{columns.map(c => <option key={c}>{c}</option>)}</select>
        <input value={filter} onChange={e => setFilter(e.target.value)} disabled={!col} placeholder="contains…" className={`${inputCls} w-48`} />
        <button onClick={load} className={ghostCls}><RefreshCw className="w-4 h-4" /></button>
        <span className="ml-auto inline-flex items-center gap-1 text-[13px]">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={!page} className={ghostCls}>‹</button>
          <span className="px-2">rows {page * 50 + 1}–{page * 50 + rows.length}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={rows.length < 50} className={ghostCls}>›</button>
        </span>
      </div>
      {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
        <div className="overflow-auto rounded-lg border border-border bg-white max-h-[65vh]">
          <table className="text-[12px] border-collapse">
            <thead className="sticky top-0 bg-licet-paper z-10"><tr>
              {!meta.readOnly && <th className="px-2 py-1.5 border-b border-border" />}
              {columns.map(c => <th key={c} className="px-2 py-1.5 border-b border-l border-border text-left font-mono font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={table + '|' + meta.pk.map(k => show(r[k])).join('|')} className={`border-b border-border align-top ${edits[i] ? 'bg-licet-cream/40' : ''}`}>
                  {!meta.readOnly && (
                    <td className="px-1.5 py-1 whitespace-nowrap">
                      <button onClick={() => saveRow(i)} disabled={!edits[i]} className="p-1 rounded hover:bg-muted disabled:opacity-30" title="Save"><Save className="w-3.5 h-3.5" /></button>
                      <button onClick={() => delRow(i)} className="p-1 rounded hover:bg-red-50 text-red-700" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                  {columns.map(c => {
                    const v = edits[i]?.[c] ?? r[c]
                    const isPk = meta.pk.includes(c)
                    return (
                      <td key={c} className="px-1 py-0.5 border-l border-border">
                        {meta.readOnly || isPk
                          ? <span className="block max-w-[260px] truncate px-1 py-1 text-muted-foreground" title={show(r[c])}>{show(r[c])}</span>
                          : <input defaultValue={show(v)} onBlur={e => { if (e.target.value !== show(r[c])) setEdits(ed => ({ ...ed, [i]: { ...(ed[i] ?? {}), [c]: parse(r[c], e.target.value) } })) }}
                              className="w-full min-w-[110px] max-w-[320px] h-7 px-1 rounded border border-transparent hover:border-input focus:border-licet-violet bg-transparent font-mono text-[11.5px]" />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No records.</p>}
        </div>
      )}
      {!meta.readOnly && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-licet-violet font-semibold">Add a record (JSON)</summary>
          <textarea value={newJson} onChange={e => setNewJson(e.target.value)} rows={5} placeholder={'{ "column": "value" }'} className="mt-2 w-full px-2 py-1 rounded-md border border-input font-mono text-[12px]" />
          <button onClick={addRow} disabled={!newJson.trim()} className={btnCls}><Plus className="w-4 h-4" /> Add</button>
        </details>
      )}
    </div>
  )
}
