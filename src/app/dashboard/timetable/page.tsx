"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Loader2, Settings } from "lucide-react"
import { getActiveSemester } from "@/lib/semester"

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
  'bg-blue-50 border-blue-200 text-blue-700 dark:text-blue-700',
  'bg-purple-50 border-purple-200 text-purple-700 dark:text-purple-700',
  'bg-green-50 border-green-200 text-green-700 dark:text-green-700',
  'bg-orange-50 border-orange-200 text-orange-700 dark:text-orange-700',
  'bg-pink-50 border-pink-200 text-pink-700 dark:text-pink-700',
  'bg-cyan-50 border-cyan-200 text-cyan-700 dark:text-cyan-700',
  'bg-amber-50 border-amber-200 text-amber-700 dark:text-amber-700',
  'bg-red-50 border-red-200 text-red-700 dark:text-red-700',
  'bg-emerald-50 border-emerald-200 text-emerald-700 dark:text-emerald-700',
  'bg-indigo-50 border-indigo-200 text-indigo-700 dark:text-indigo-700',
]

interface TimetableSlot { subjectId: string; subjectCode: string; subjectName: string }
interface SaturdayConfig { enabled: boolean; followsDay: string; halfDay: boolean }


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

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff'
  const isStudent = authUser?.type === 'student'
  const currentSem = (s: string) => getActiveSemester(s)

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load profile for', au.data.email, error); return }
        if (data) setProfile(data)
      })
    if (au.type === 'student') {
      // Fall back to stale localStorage section only until profile loads (handled below)
      const sec = (au.data as any)?.section ?? 'I CSE-A'
      setSection(sec)
    }
  }, [router])

  // Once the live profile loads, prefer its section for students (overrides stale localStorage value)
  useEffect(() => {
    if (authUser?.type === 'student' && profile?.section) {
      setSection(profile.section)
    }
  }, [authUser, profile])

  // Load subjects
  useEffect(() => {
    if (!authUser) return
    supabase.from('subjects').select('*')
      .eq('section', section).eq('semester', currentSem(section)).order('code')
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load subjects for section', section, error); return }
        if (data) setSubjects(data)
      })
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
          <span className="eyebrow">TIMETABLE</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Class Timetable</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
            3-part attendance system · Period 1 = 60 min · Periods 2–8 = 50 min each
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="font-mono text-xs text-green-700">{saveMsg}</span>}
          {(isHOD || isFaculty) && !editing && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm">
              Edit Timetable
            </button>
          )}
          {(isHOD || isFaculty) && editing && (
            <div className="flex gap-2">
              <button onClick={() => setShowSatConfig(!showSatConfig)}
                className="flex items-center gap-1 px-3 py-2 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">
                <Settings className="w-3 h-3" /> Saturday
              </button>
              <button onClick={saveTimetable} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-[13px] font-semibold rounded-md hover:bg-green-800 disabled:opacity-50">
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
              className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${section === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Saturday config */}
      {showSatConfig && editing && (
        <div className="bg-card border border-amber-200 rounded-lg p-4 space-y-3">
          <span className="eyebrow">SATURDAY CONFIGURATION</span>
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
                    className="h-8 px-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
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
          <div key={p.part} className={`flex items-center gap-1.5 px-3 py-1 rounded border ${p.part === 1 ? 'text-blue-700 bg-blue-50 border-blue-200' : p.part === 2 ? 'text-green-700 bg-green-50 border-green-200' : 'text-orange-700 bg-orange-50 border-orange-200'}`}>
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
                    className={`font-mono text-xs text-center p-2 border border-border ${part.part === 1 ? 'bg-blue-50' : part.part === 2 ? 'bg-green-50' : 'bg-orange-50'} ${idx === 0 && part.part > 1 ? 'border-l-2 border-l-border' : ''}`}>
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
                  <td className={`font-mono text-xs p-3 border border-border font-bold ${isSat ? 'bg-amber-50' : 'bg-accent/30'}`}>
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
                        className={`border border-border p-1 min-w-[90px] ${part?.part === 1 ? 'bg-blue-50' : part?.part === 2 ? 'bg-green-50' : 'bg-orange-50'}`}>
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
        <span className="eyebrow block mb-3">PERIOD TIME REFERENCE</span>
        <div className="grid grid-cols-3 gap-4">
          {PERIOD_PARTS.map(part => (
            <div key={part.part}>
              <p className={`font-mono text-xs font-bold mb-2 ${part.part === 1 ? 'text-blue-700' : part.part === 2 ? 'text-green-700' : 'text-orange-700'}`}>
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