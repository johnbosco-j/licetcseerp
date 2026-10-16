"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Save, Scissors, Smartphone } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { reportResult, toast } from "@/components/toaster"
import { SECTIONS, type Vertical, type StudentGroup } from "@/lib/academic"
import { inputCls, btnCls, ghostCls } from "./terms-tab"

type Stu = { id: string; full_name: string; register_number: string | null; roll_number: string | null; lab_batch: number | null; vertical: string | null; email: string }
type Staff = { id: string; full_name: string; advisor_section: string | null }

export function StudentsTab({ verticals, groups }: { verticals: Vertical[]; groups: StudentGroup[] }) {
  const [section, setSection] = useState('III CSE-A')
  const [rows, setRows] = useState<Stu[]>([])
  const [orig, setOrig] = useState<Record<string, string>>({})
  const [staff, setStaff] = useState<Staff[]>([])
  const [devices, setDevices] = useState<Set<string>>(new Set())
  const [groupId, setGroupId] = useState('')
  const [members, setMembers] = useState<Set<string>>(new Set())
  const [split, setSplit] = useState<{ by: 'reg' | 'name' | 'count'; value: string }>({ by: 'reg', value: '' })
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('id, full_name, register_number, roll_number, lab_batch, vertical, email')
      .eq('role', 'STUDENT').eq('section', section).eq('is_active', true)
    const rs = ((data ?? []) as Stu[]).sort((a, b) => {
      const la = a.register_number?.[9] === '3', lb = b.register_number?.[9] === '3'
      return (Number(!a.register_number) - Number(!b.register_number)) || (Number(la) - Number(lb)) || (a.register_number ?? a.full_name).localeCompare(b.register_number ?? b.full_name)
    })
    setRows(rs); setOrig(Object.fromEntries(rs.map(r => [r.id, `${r.lab_batch}|${r.vertical}`])))
    const { data: dv } = await supabase.from('attendance_devices').select('student_id').in('student_id', rs.map(r => r.id))
    setDevices(new Set((dv ?? []).map((d: { student_id: string }) => d.student_id)))
    setLoading(false)
  }, [section])
  useEffect(() => { load() }, [load])
  const loadStaff = useCallback(() => { supabase.from('profiles').select('id, full_name, advisor_section').neq('role', 'STUDENT').eq('is_active', true).order('full_name').then(({ data }) => setStaff((data ?? []) as Staff[])) }, [])
  useEffect(() => { loadStaff() }, [loadStaff])
  useEffect(() => {
    if (!groupId) { setMembers(new Set()); return }
    supabase.from('student_group_members').select('student_id').eq('group_id', groupId).then(({ data }) => setMembers(new Set((data ?? []).map((m: { student_id: string }) => m.student_id))))
  }, [groupId])

  const changed = useMemo(() => rows.filter(r => orig[r.id] !== `${r.lab_batch}|${r.vertical}`), [rows, orig])
  const set = (id: string, patch: Partial<Stu>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  const applySplit = () => {
    const v = split.value.trim()
    if (!v) return
    let cut = -1
    if (split.by === 'count') cut = Number(v) - 1
    else if (split.by === 'reg') {
      // last student whose (regular) register number ends at or below the number given
      const n = v.length <= 3 ? Number(v) : Number(v.slice(-3))
      rows.forEach((r, i) => { if (r.register_number && r.register_number[9] !== '3' && Number(r.register_number.slice(-3)) <= n) cut = i })
    } else {
      cut = rows.findIndex(r => r.full_name.toLowerCase().startsWith(v.toLowerCase()))
    }
    if (cut < 0) { toast.error('No student matched — check the value'); return }
    setRows(rs => rs.map((r, i) => ({ ...r, lab_batch: i <= cut ? 1 : 2 })))
    toast.info(`Batch 1: ${cut + 1} students (up to ${rows[cut].full_name}). Batch 2: ${rows.length - cut - 1}. Press Save to keep it.`)
  }
  const save = async () => {
    for (const r of changed) {
      const { error } = await supabase.from('profiles').update({ lab_batch: r.lab_batch, vertical: r.vertical || null }).eq('id', r.id)
      if (!reportResult(error)) return
    }
    toast.success(`${changed.length} students updated`)
    setOrig(Object.fromEntries(rows.map(r => [r.id, `${r.lab_batch}|${r.vertical}`])))
  }
  const setAdvisor = async (staffId: string) => {
    await supabase.from('profiles').update({ advisor_section: null }).eq('advisor_section', section)
    if (staffId) {
      const { error } = await supabase.from('profiles').update({ advisor_section: section }).eq('id', staffId)
      if (!reportResult(error, 'Class advisor updated')) return
    }
    loadStaff()
  }
  const toggleMember = async (sid: string) => {
    if (!groupId) return
    if (members.has(sid)) await supabase.from('student_group_members').delete().eq('group_id', groupId).eq('student_id', sid)
    else await supabase.from('student_group_members').insert({ group_id: groupId, student_id: sid })
    setMembers(m => { const n = new Set(m); if (n.has(sid)) n.delete(sid); else n.add(sid); return n })
  }
  const resetDevice = async (s: Stu) => {
    if (!confirm(`Reset the registered phone for ${s.full_name}? Their next check-in registers the new phone.`)) return
    const { error } = await supabase.rpc('att_reset_device', { p_student: s.id })
    if (reportResult(error, 'Phone reset')) setDevices(d => { const n = new Set(d); n.delete(s.id); return n })
  }

  const year = section.split(' ')[0]
  const counts = { b1: rows.filter(r => r.lab_batch === 1).length, b2: rows.filter(r => r.lab_batch === 2).length }
  const advisor = staff.find(s => s.advisor_section === section)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={section} onChange={e => setSection(e.target.value)} className={inputCls}>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select>
        <label className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5">Class advisor
          <select value={advisor?.id ?? ''} onChange={e => setAdvisor(e.target.value)} className={inputCls}>
            <option value="">— none —</option>{staff.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.advisor_section && s.advisor_section !== section ? ` (${s.advisor_section})` : ''}</option>)}
          </select>
        </label>
        <span className="text-[12.5px] text-muted-foreground">Batch 1: <b>{counts.b1}</b> · Batch 2: <b>{counts.b2}</b>{(year === 'III' || year === 'IV') && <> · {verticals.map(v => `${v.code}: ${rows.filter(r => r.vertical === v.code).length}`).join(' · ')}</>}</span>
        <button onClick={save} disabled={!changed.length} className={`${btnCls} ml-auto`}><Save className="w-4 h-4" /> Save {changed.length || ''} change{changed.length === 1 ? '' : 's'}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-licet-paper/60 px-3 py-2">
        <Scissors className="w-4 h-4 text-licet-violet" />
        <span className="text-[13px] font-semibold">Split into batches:</span>
        <span className="text-[13px] text-muted-foreground">batch 1 ends at</span>
        <select value={split.by} onChange={e => setSplit({ ...split, by: e.target.value as 'reg' | 'name' | 'count' })} className={inputCls}>
          <option value="reg">register no. (last 3 digits)</option><option value="name">student name</option><option value="count">first N students</option>
        </select>
        <input value={split.value} onChange={e => setSplit({ ...split, value: e.target.value })} placeholder={split.by === 'reg' ? 'e.g. 032' : split.by === 'name' ? 'e.g. Goldwin' : 'e.g. 32'} className={`${inputCls} w-40`} />
        <button onClick={applySplit} className={ghostCls}>Apply</button>
        <span className="text-[12px] text-muted-foreground">Laterals and students without a register number go to batch 2.</span>
      </div>
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Group membership:</span>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}><option value="">— choose a group to tick members —</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          {groupId && <span className="text-muted-foreground">{members.size} members in total</span>}
        </div>
      )}
      {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-[13px] border-collapse">
            <thead><tr className="bg-licet-paper text-left">
              <th className="px-3 py-2 border-b border-border w-10">#</th>
              <th className="px-3 py-2 border-b border-border">Student</th>
              <th className="px-3 py-2 border-b border-border">Lab batch</th>
              <th className="px-3 py-2 border-b border-border">Vertical</th>
              {groupId && <th className="px-3 py-2 border-b border-border">In group</th>}
              <th className="px-3 py-2 border-b border-border">Self check-in phone</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-border ${orig[r.id] !== `${r.lab_batch}|${r.vertical}` ? 'bg-licet-cream/40' : ''}`}>
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5"><span className="font-mono text-[11.5px] text-muted-foreground mr-2">{r.register_number ?? r.roll_number ?? '—'}</span>{r.full_name}</td>
                  <td className="px-3 py-1.5">
                    <select value={r.lab_batch ?? ''} onChange={e => set(r.id, { lab_batch: Number(e.target.value) || null })} className="h-8 px-1 rounded border border-input bg-white">
                      <option value="">—</option>{[1, 2, 3].map(b => <option key={b} value={b}>Batch {b}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={r.vertical ?? ''} onChange={e => set(r.id, { vertical: e.target.value || null })} className="h-8 px-1 rounded border border-input bg-white">
                      <option value="">—</option>{verticals.map(v => <option key={v.code} value={v.code}>{v.name}</option>)}
                    </select>
                  </td>
                  {groupId && <td className="px-3 py-1.5"><input type="checkbox" checked={members.has(r.id)} onChange={() => toggleMember(r.id)} className="accent-licet-indigo w-4 h-4" /></td>}
                  <td className="px-3 py-1.5">{devices.has(r.id) ? <button onClick={() => resetDevice(r)} className="inline-flex items-center gap-1 text-[12px] text-licet-violet hover:underline"><Smartphone className="w-3.5 h-3.5" /> registered · reset</button> : <span className="text-[12px] text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">Batch and vertical decide which split hour a student attends and is marked in. Changes apply to hours taken from now on; past hours keep the list they were taken with. New students: add them in User Accounts (single or Excel import) with their batch and vertical.</p>
    </div>
  )
}
