"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import { loadSettings, loadTerms, type Term } from "@/lib/academic"
import { TakeAttendance } from "@/components/attendance/take-attendance"
import { RegisterView } from "@/components/attendance/register-view"
import { SummaryView } from "@/components/attendance/summary-view"
import { MyAttendance } from "@/components/attendance/my-attendance"
import { CondonationDesk } from "@/components/attendance/condonation"

type Tab = 'take' | 'register' | 'summary' | 'condonation'

export default function AttendancePage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [tab, setTab] = useState<Tab>('take')
  const [limits, setLimits] = useState({ min: 75, cond: 65, lock: 10 })

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    setUser(JSON.parse(stored) as AuthUser)
    loadTerms().then(ts => { setTerms(ts); setTermId(ts.find(t => t.is_current)?.id ?? ts[0]?.id ?? '') })
    loadSettings().then(s => setLimits({
      min: Number(s['attendance.min_percent'] ?? 75), cond: Number(s['attendance.condonation_percent'] ?? 65), lock: Number(s['attendance.lock_minutes'] ?? 10),
    }))
  }, [router])

  const term = terms.find(t => t.id === termId)
  if (!user || !term) return <div className="p-10 flex items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>

  const isStudent = user.type === 'student'
  const isHod = user.type === 'staff' && isTier1(user.data)
  const me = { id: user.data.id, full_name: user.data.full_name }

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">Attendance</span>
          <h1 className="font-display text-3xl font-bold text-licet-indigo mt-1">{isStudent ? 'My attendance' : 'Attendance register'}</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 max-w-3xl">
            {isStudent
              ? `Hour-wise record for ${term.label}. You need ${limits.min}% overall to sit the semester-end examination.`
              : `Mark each hour Present or Absent. A submitted hour can be corrected for ${limits.lock} minutes, then it locks; only the HOD can change it after that.`}
          </p>
        </div>
        {!isStudent && (
          <select value={termId} onChange={e => setTermId(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-white text-[13.5px]">
            {terms.map(t => <option key={t.id} value={t.id}>{t.label}{t.is_current ? ' (current)' : ''}</option>)}
          </select>
        )}
      </div>

      {isStudent ? (
        <MyAttendance terms={terms} minPct={limits.min} condPct={limits.cond} me={me} />
      ) : (
        <>
          <div className="flex gap-1 border-b border-border">
            {([['take', 'Take attendance'], ['register', 'Register'], ['summary', 'Summary & eligibility'],
               ...((isHod || user.data.advisor_section) ? [['condonation', 'Condonation']] : [])] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-2 -mb-px text-[13.5px] font-semibold border-b-2 ${tab === k ? 'border-licet-indigo text-licet-indigo' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </div>
          {tab === 'take' && (term.is_current
            ? <TakeAttendance term={term} me={me} isHod={isHod} />
            : <p className="text-[13.5px] text-muted-foreground">{term.label} is a past term — use Register to view or correct its hours.</p>)}
          {tab === 'register' && <RegisterView term={term} isHod={isHod} me={me} defaultSection={user.data.advisor_section} />}
          {tab === 'condonation' && <CondonationDesk term={term} isHod={isHod} />}
          {tab === 'summary' && <SummaryView term={term} minPct={limits.min} condPct={limits.cond} defaultSection={user.data.advisor_section} />}
        </>
      )}
    </div>
  )
}
