"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, Settings } from "lucide-react"

type Subject = Database['public']['Tables']['subjects']['Row']

// LICET period structure
const PERIOD_PARTS = [
  {
    part: 1, label: 'Part I', time: '8:00 AM',
    periods: [
      { no: 1, start: '8:00', end: '9:00',  duration: '60 min' },
      { no: 2, start: '9:00', end: '9:50',  duration: '50 min' },
    ]
  },
  {
    part: 2, label: 'Part II', time: '10:10 AM',
    periods: [
      { no: 3, start: '10:10', end: '11:00', duration: '50 min' },
      { no: 4, start: '11:00', end: '11:50', duration: '50 min' },
      { no: 5, start: '11:50', end: '12:40', duration: '50 min' },
    ]
  },
  {
    part: 3, label: 'Part III', time: '1:30 PM',
    periods: [
      { no: 6, start: '1:30', end: '2:20', duration: '50 min' },
      { no: 7, start: '2:20', end: '3:10', duration: '50 min' },
      { no: 8, start: '3:10', end: '4:00', duration: '50 min' },
    ]
  },
]

const ALL_PERIODS = PERIOD_PARTS.flatMap(p => p.periods)
const HALF_DAY_PERIODS = ALL_PERIODS.slice(0, 5) // periods 1-5 for half day
const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

const SUBJECT_COLORS = [
  'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400',
  'bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400',
  'bg-green-500/15 border-green-500/30 text-green-600 dark:text-green-400',
  'bg-orange-500/15 border-orange-500/30 text-orange-600 dark:text-orange-400',
  'bg-pink-500/15 border-pink-500/30 text-pink-600 dark:text-pink-400',
  'bg-cyan-500/15 border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
  'bg-yellow-500/15 border-yellow-500/30 text-yellow-600 dark:text-yellow-400',
  'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400',
  'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  'bg-indigo-500/15 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
]

interface TimetableSlot { subjectId: string; subjectCode: string; subjectName: string }
interface SaturdayConfig { enabled: boolean; followsDay: string; halfDay: boolean }


// Semester helper — June–Dec = odd (1,3,5,7), Jan–May = even (2,4,6,8)
function getActiveSemester(s: string): number {
  const m = new Date().getMonth() + 1
  const odd = m >= 6
  const map: Record<string, [number,number]> = {
    'I CSE-A':[1,2],'I CSE-B':[1,2],
    'II CSE-A':[3,4],'II CSE-B':[3,4],
    'III CSE-A':[5,6],'III CSE-B':[5,6],
    'IV CSE-A':[7,8],'IV CSE-B':[7,8],
  }
  const [o,e] = map[s] ?? [1,2]
  return odd ? o : e
}
export default function TimetablePage() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [subjects, setSubjects]   = useState<Subject[]>([])
  const [section, setSection]     = useState('II CSE-A')
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [showSatConfig, setShowSatConfig] = useState(false)

  // timetable[day][periodNo] = TimetableSlot
  const [timetable, setTimetable] = useState<Record<string, Record<number, TimetableSlot>>>({})
  const [satConfig, setSatConfig] = useState<SaturdayConfig>({ enabled: false, followsDay: 'Monday', halfDay: true })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const isStudent = authUser?.type === 'student'
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
    if (au.type === 'student') {
      const sec = (au.data as any)?.section ?? 'I CSE-A'
      setSection(sec)
    }
  }, [router])

  // Load subjects
  useEffect(() => {
    if (!authUser) return
    supabase.from('subjects').select('*')
      .eq('section', section).eq('semester', currentSem(section)).order('code')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [section, authUser])

  // Load saved timetable
  useEffect(() => {
    supabase.from('announcements').select('*')
      .eq('audience', `TIMETABLE:${section}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          try {
            const parsed = JSON.parse(data[0].body)
            setTimetable(parsed.timetable ?? {})
            setSatConfig(parsed.satConfig ?? { enabled: false, followsDay: 'Monday', halfDay: true })
          } catch {}
        } else {
          setTimetable({})
          setSatConfig({ enabled: false, followsDay: 'Monday', halfDay: true })
        }
      })
  }, [section])

  const setSlot = (day: string, periodNo: number, subjectId: string) => {
    const sub = subjects.find(s => s.id === subjectId)
    setTimetable(prev => {
      const next = { ...prev, [day]: { ...(prev[day] ?? {}) } }
      if (!subjectId) {
        delete next[day][periodNo]
      } else {
        next[day][periodNo] = {
          subjectId,
          subjectCode: sub?.code ?? '',
          subjectName: sub?.name ?? ''
        }
      }
      return next
    })
  }

  const saveTimetable = async () => {
    if (!profile) return
    setSaving(true)
    await supabase.from('announcements').delete().eq('audience', `TIMETABLE:${section}`)
    await supabase.from('announcements').insert({
      title: `Timetable – ${section}`,
      body: JSON.stringify({ timetable, satConfig }),
      audience: `TIMETABLE:${section}`,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    setSaving(false)
    setEditing(false)
    setSaveMsg('✓ Timetable saved')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const colorMap: Record<string, string> = {}
  subjects.forEach((s, i) => { colorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length] })

  // Saturday display — follows a weekday or disabled
  const saturdayPeriods = satConfig.halfDay ? HALF_DAY_PERIODS : ALL_PERIODS
  const saturdayTimetable = satConfig.enabled ? (timetable[satConfig.followsDay] ?? {}) : {}

  const displayDays = [...WEEKDAYS, 'Saturday']

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: TIMETABLE</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Class Timetable</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            3-part attendance system · Period 1 = 60 min · Periods 2–8 = 50 min each
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="font-mono text-xs text-green-500">{saveMsg}</span>}
          {(isHOD || isFaculty) && !editing && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90">
              Edit Timetable
            </button>
          )}
          {(isHOD || isFaculty) && editing && (
            <div className="flex gap-2">
              <button onClick={() => setShowSatConfig(!showSatConfig)}
                className="flex items-center gap-1 px-3 py-2 bg-accent font-mono text-xs rounded hover:bg-accent/80">
                <Settings className="w-3 h-3" /> Saturday
              </button>
              <button onClick={saveTimetable} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-mono text-xs rounded hover:bg-green-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section selector */}
      {!isStudent && (
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <button key={s} onClick={() => { setSection(s); setEditing(false) }}
              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${section === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Saturday config */}
      {showSatConfig && editing && (
        <div className="bg-card border border-yellow-500/30 rounded-lg p-4 space-y-3">
          <span className="font-mono text-xs text-yellow-500">// SATURDAY CONFIGURATION</span>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={satConfig.enabled}
                onChange={e => setSatConfig({...satConfig, enabled: e.target.checked})}
                className="w-4 h-4 accent-primary" />
              <span className="font-mono text-sm">Saturday is a working day</span>
            </label>
            {satConfig.enabled && (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">Follows:</span>
                  <select value={satConfig.followsDay} onChange={e => setSatConfig({...satConfig, followsDay: e.target.value})}
                    className="h-8 px-2 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                    {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="font-mono text-xs text-muted-foreground">timetable</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={satConfig.halfDay}
                    onChange={e => setSatConfig({...satConfig, halfDay: e.target.checked})}
                    className="w-4 h-4 accent-primary" />
                  <span className="font-mono text-sm">Half day (5 periods only)</span>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* Subject legend */}
      <div className="flex flex-wrap gap-2">
        {subjects.map(s => (
          <span key={s.id} className={`font-mono text-xs px-2 py-1 rounded border ${colorMap[s.id] ?? ''}`}>
            {s.code}
          </span>
        ))}
      </div>

      {/* Part labels */}
      <div className="flex gap-4 font-mono text-xs">
        {PERIOD_PARTS.map(p => (
          <div key={p.part} className={`flex items-center gap-1.5 px-3 py-1 rounded border ${p.part === 1 ? 'text-blue-500 bg-blue-500/10 border-blue-500/20' : p.part === 2 ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-orange-500 bg-orange-500/10 border-orange-500/20'}`}>
            <span className="font-bold">Part {p.part}</span>
            <span className="text-muted-foreground">{p.time} · {p.periods.map(x => `P${x.no}`).join(', ')}</span>
          </div>
        ))}
      </div>

      {/* Timetable grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="font-mono text-xs text-muted-foreground text-left p-3 border border-border bg-accent/50 w-20">Day</th>
              {PERIOD_PARTS.map(part => (
                part.periods.map((period, idx) => (
                  <th key={period.no}
                    className={`font-mono text-xs text-center p-2 border border-border ${part.part === 1 ? 'bg-blue-500/5' : part.part === 2 ? 'bg-green-500/5' : 'bg-orange-500/5'} ${idx === 0 && part.part > 1 ? 'border-l-2 border-l-border' : ''}`}>
                    <div className="font-bold">P{period.no}</div>
                    <div className="text-muted-foreground" style={{fontSize:'10px'}}>{period.start}</div>
                    <div className="text-muted-foreground" style={{fontSize:'9px'}}>{period.duration}</div>
                  </th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {displayDays.map(day => {
              const isSat = day === 'Saturday'
              const isDisabled = isSat && !satConfig.enabled
              const slots = isSat ? saturdayTimetable : (timetable[day] ?? {})
              const periodsToShow = isSat
                ? (satConfig.halfDay ? HALF_DAY_PERIODS : ALL_PERIODS)
                : ALL_PERIODS

              return (
                <tr key={day} className={isDisabled ? 'opacity-30' : ''}>
                  <td className={`font-mono text-xs p-3 border border-border font-bold ${isSat ? 'bg-yellow-500/5' : 'bg-accent/30'}`}>
                    <div>{day}</div>
                    {isSat && satConfig.enabled && (
                      <div className="font-normal text-muted-foreground" style={{fontSize:'9px'}}>
                        follows {satConfig.followsDay}
                        {satConfig.halfDay ? ' · half' : ' · full'}
                      </div>
                    )}
                    {isSat && !satConfig.enabled && (
                      <div className="font-normal text-muted-foreground" style={{fontSize:'9px'}}>Holiday</div>
                    )}
                  </td>
                  {ALL_PERIODS.map(period => {
                    const inRange = periodsToShow.find(p => p.no === period.no)
                    const slot    = slots[period.no]
                    const color   = slot ? (colorMap[slot.subjectId] ?? '') : ''
                    const part    = PERIOD_PARTS.find(p => p.periods.some(x => x.no === period.no))

                    if (!inRange && isSat) {
                      return (
                        <td key={period.no} className="border border-border bg-accent/10 p-1">
                          <div className="h-10 flex items-center justify-center">
                            <span className="font-mono text-muted-foreground" style={{fontSize:'9px'}}>—</span>
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td key={period.no}
                        className={`border border-border p-1 min-w-[90px] ${part?.part === 1 ? 'bg-blue-500/3' : part?.part === 2 ? 'bg-green-500/3' : 'bg-orange-500/3'}`}>
                        {editing && !isSat ? (
                          <select value={slot?.subjectId ?? ''}
                            onChange={e => setSlot(day, period.no, e.target.value)}
                            className="w-full h-9 px-1 bg-background border border-border rounded font-mono text-xs focus:border-primary focus:outline-none">
                            <option value="">—</option>
                            {subjects.map(s => (
                              <option key={s.id} value={s.id}>{s.code}</option>
                            ))}
                          </select>
                        ) : slot ? (
                          <div className={`p-1.5 rounded border text-center ${color}`}>
                            <p className="font-mono font-bold" style={{fontSize:'11px'}}>{slot.subjectCode}</p>
                          </div>
                        ) : (
                          <div className="h-9" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Period time reference */}
      <div className="bg-card border border-border rounded-lg p-4">
        <span className="font-mono text-xs text-primary block mb-3">// PERIOD TIME REFERENCE</span>
        <div className="grid grid-cols-3 gap-4">
          {PERIOD_PARTS.map(part => (
            <div key={part.part}>
              <p className={`font-mono text-xs font-bold mb-2 ${part.part === 1 ? 'text-blue-500' : part.part === 2 ? 'text-green-500' : 'text-orange-500'}`}>
                Part {part.part} — {part.label} ({part.time})
              </p>
              {part.periods.map(p => (
                <div key={p.no} className="flex justify-between font-mono text-xs text-muted-foreground py-0.5">
                  <span>Period {p.no}</span>
                  <span>{p.start} – {p.end}</span>
                  <span>{p.duration}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="font-mono text-xs text-muted-foreground mt-3">
          Break after Part I: 9:50–10:10 (20 min) · Lunch after Part II: 12:40–1:30 (50 min)
        </p>
      </div>
    </div>
  )
}
