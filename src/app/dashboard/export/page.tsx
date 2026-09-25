"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, Search, FileSpreadsheet, CheckCircle2, AlertTriangle, Building2, Users, User, CalendarRange } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { isTier1 } from "@/lib/roles"
import { DATASETS, buildWorkbook, downloadWorkbook, type DatasetId, type Scope } from "@/lib/export"
import { semesterStartDate } from "@/lib/semester"
import { academicYear } from "@/lib/utils"

const SECTIONS = ['I CSE-A', 'I CSE-B', 'II CSE-A', 'II CSE-B', 'III CSE-A', 'III CSE-B', 'IV CSE-A', 'IV CSE-B', 'GRADUATED']
type Found = { id: string; full_name: string; roll_number: string | null; register_number: string | null; section: string | null }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function ExportPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [scopeKind, setScopeKind] = useState<'department' | 'section' | 'student'>('section')
  const [section, setSection] = useState('III CSE-A')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [student, setStudent] = useState<Found | null>(null)
  const [periodKind, setPeriodKind] = useState<'all' | 'semester' | 'year' | 'custom'>('semester')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(iso(new Date()))
  const [picked, setPicked] = useState<DatasetId[]>(['students', 'attSummary', 'marks', 'results'])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ file: string; counts: Record<string, number> } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type === 'student') {
      setScopeKind('student')
      setStudent({ id: au.data.id, full_name: au.data.full_name, roll_number: au.data.roll_number ?? null, register_number: au.data.register_number ?? null, section: au.data.section })
      setPicked(['attSummary', 'dayAtt', 'marks', 'results', 'leaves'])
    } else if (isTier1(au.data)) {
      setScopeKind('department')
    } else if (au.data.advisor_section) {
      setSection(au.data.advisor_section)
    }
  }, [router])

  const isStudent = authUser?.type === 'student'
  const tier1 = authUser?.type === 'staff' && isTier1(authUser.data)

  // Student search (staff)
  useEffect(() => {
    if (isStudent || scopeKind !== 'student') return
    const q = query.trim()
    if (q.length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const like = `%${q.replace(/[%_,()]/g, ' ')}%`
      const { data } = await supabase.from('profiles').select('id, full_name, roll_number, register_number, section')
        .eq('role', 'STUDENT').or(`full_name.ilike.${like},roll_number.ilike.${like},register_number.ilike.${like}`).order('full_name').limit(8)
      setFound((data ?? []) as Found[])
    }, 250)
    return () => clearTimeout(t)
  }, [query, scopeKind, isStudent])

  const period = useMemo(() => {
    const today = iso(new Date())
    if (periodKind === 'all') return { from: null, to: null, label: 'Entire record' }
    if (periodKind === 'semester') { const f = iso(semesterStartDate()); return { from: f, to: today, label: `This semester (${f} to ${today})` } }
    if (periodKind === 'year') { const ay = academicYear(); const f = `${ay.slice(0, 4)}-06-01`; return { from: f, to: today, label: `Academic year ${ay} (${f} to ${today})` } }
    return { from: from || null, to: to || null, label: `${from || 'start'} to ${to || 'today'}` }
  }, [periodKind, from, to])

  const available = DATASETS.filter(ds =>
    !(isStudent && 'staffOnly' in ds && ds.staffOnly) && !('departmentOnly' in ds && ds.departmentOnly && scopeKind !== 'department'))
  const chosen = picked.filter(id => available.some(a => a.id === id))

  const scope: Scope | null = scopeKind === 'department' ? { kind: 'department' }
    : scopeKind === 'section' ? { kind: 'section', section }
    : student ? { kind: 'student', id: student.id, label: `${student.full_name}${student.roll_number ? ` (${student.roll_number})` : ''}` } : null

  const invalidRange = periodKind === 'custom' && !!from && !!to && from > to
  const canRun = !!scope && chosen.length > 0 && !busy && !invalidRange

  const run = async () => {
    if (!scope || !authUser) return
    setBusy(true); setError(''); setResult(null)
    try {
      const { workbook, counts } = await buildWorkbook({
        scope, period, datasets: chosen, generatedBy: authUser.data.full_name, onProgress: setProgress,
      })
      const scopePart = scope.kind === 'department' ? 'CSE-Department' : scope.kind === 'section' ? slug(scope.section) : slug(student?.roll_number || student?.full_name || 'Student')
      const periodPart = periodKind === 'all' ? 'All-time' : `${period.from ?? 'start'}_to_${period.to ?? 'today'}`
      const file = `LICET-Things_${scopePart}_${periodPart}.xlsx`
      downloadWorkbook(workbook, file)
      setResult({ file, counts })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed. Please try again.')
    }
    setBusy(false); setProgress('')
  }

  const toggle = (id: DatasetId) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const ScopeButton = ({ kind, icon: Icon, label, sub }: { kind: typeof scopeKind; icon: typeof Users; label: string; sub: string }) => (
    <button onClick={() => { setScopeKind(kind); setResult(null) }} aria-pressed={scopeKind === kind}
      className={`flex items-start gap-3 text-left rounded-xl border p-4 transition-colors ${scopeKind === kind ? 'border-licet-indigo bg-licet-indigo text-white' : 'border-border bg-white hover:border-licet-gold'}`}>
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${scopeKind === kind ? 'text-licet-gold' : 'text-licet-violet'}`} />
      <span><span className="block text-[14px] font-semibold">{label}</span><span className={`block text-[12px] ${scopeKind === kind ? 'text-licet-cream/80' : 'text-muted-foreground'}`}>{sub}</span></span>
    </button>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="eyebrow">DATA EXPORT</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Download Records as Excel</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
          {isStudent ? 'Download your own attendance, marks, results and requests as an Excel workbook.'
            : 'Export department records as an Excel workbook: for the whole department, a section or one student, over any period.'}
        </p>
      </div>

      {/* 1. Scope */}
      {!isStudent && (
        <section className="bg-card border border-border rounded-lg p-6 space-y-4">
          <span className="eyebrow">1 · WHOSE RECORDS</span>
          <div className={`grid gap-3 ${tier1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {tier1 && <ScopeButton kind="department" icon={Building2} label="Entire department" sub="All students and department records" />}
            <ScopeButton kind="section" icon={Users} label="A section" sub="Every student in one class" />
            <ScopeButton kind="student" icon={User} label="One student" sub="Search by name, roll or register number" />
          </div>
          {scopeKind === 'section' && (
            <select value={section} onChange={e => setSection(e.target.value)} aria-label="Section"
              className="h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
              {SECTIONS.map(s => <option key={s} value={s}>{s === 'GRADUATED' ? 'Graduated (not yet archived)' : s}</option>)}
            </select>
          )}
          {scopeKind === 'student' && (
            <div className="space-y-2 max-w-xl">
              {student ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-licet-gold bg-licet-cream/40 px-4 py-2.5">
                  <span className="text-[13.5px] text-licet-indigo"><b>{student.full_name}</b> · {student.roll_number ?? '—'} · {student.section}</span>
                  <button onClick={() => { setStudent(null); setQuery('') }} className="text-[12px] font-semibold text-licet-violet hover:underline">Change</button>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 h-10 px-3 bg-white border border-input rounded-md focus-within:border-licet-violet">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, roll number or register number"
                      className="flex-1 bg-transparent text-[13.5px] outline-none" aria-label="Find a student" />
                  </label>
                  {found.length > 0 && (
                    <ul className="border border-border rounded-lg divide-y divide-border bg-white">
                      {found.map(f => (
                        <li key={f.id}>
                          <button onClick={() => setStudent(f)} className="w-full text-left px-4 py-2 text-[13px] hover:bg-licet-cream/40">
                            <b className="text-licet-indigo">{f.full_name}</b> <span className="text-muted-foreground">· {f.roll_number ?? '—'} · {f.register_number ?? '—'} · {f.section}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* 2. Period */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <span className="eyebrow">{isStudent ? '1' : '2'} · TIME PERIOD</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time period">
          {([['semester', 'This semester'], ['year', 'This academic year'], ['all', 'Entire record'], ['custom', 'Custom dates']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={periodKind === k} onClick={() => setPeriodKind(k)}
              className={`h-9 px-4 rounded-full border text-[13px] font-semibold ${periodKind === k ? 'bg-licet-indigo text-white border-licet-indigo' : 'bg-white text-licet-indigo border-border hover:border-licet-gold'}`}>{l}</button>
          ))}
        </div>
        {periodKind === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">From
              <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="block h-10 px-3 bg-white border border-input rounded-md text-[13.5px] text-foreground" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">To
              <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="block h-10 px-3 bg-white border border-input rounded-md text-[13.5px] text-foreground" />
            </label>
          </div>
        )}
        <p className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground"><CalendarRange className="w-4 h-4 text-licet-violet" />{invalidRange ? <span className="text-red-700">The start date is after the end date.</span> : period.label}</p>
      </section>

      {/* 3. Datasets */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="eyebrow">{isStudent ? '2' : '3'} · WHAT TO INCLUDE</span>
          <div className="flex gap-3 text-[12px] font-semibold">
            <button onClick={() => setPicked(available.map(a => a.id))} className="text-licet-violet hover:underline">Select all</button>
            <button onClick={() => setPicked([])} className="text-licet-violet hover:underline">Clear</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {available.map(ds => {
            const on = picked.includes(ds.id)
            return (
              <label key={ds.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${on ? 'border-licet-gold bg-licet-cream/40' : 'border-border bg-white hover:border-licet-gold/60'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(ds.id)} className="mt-1 accent-[#1A0C4E]" />
                <span><span className="block text-[13.5px] font-semibold text-licet-indigo">{ds.label}</span><span className="block text-[12px] text-muted-foreground">{ds.hint}</span></span>
              </label>
            )
          })}
        </div>
      </section>

      {/* Run */}
      <section className="flex flex-wrap items-center gap-4">
        <button onClick={run} disabled={!canRun}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-licet-indigo text-white text-[14px] font-semibold hover:bg-licet-violet disabled:opacity-50 shadow-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy ? 'Preparing…' : 'Download Excel (.xlsx)'}
        </button>
        {busy && <span className="text-[13px] text-muted-foreground">{progress}</span>}
        {!busy && !scope && scopeKind === 'student' && <span className="text-[13px] text-muted-foreground">Choose a student first.</span>}
        {!busy && scope && chosen.length === 0 && <span className="text-[13px] text-muted-foreground">Select at least one item to include.</span>}
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-[13px]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}
        </div>
      )}
      {result && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <p className="flex items-center gap-2 text-[13.5px] text-green-900 font-semibold"><CheckCircle2 className="w-4 h-4" />Downloaded {result.file}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.counts).map(([sheet, n]) => (
              <span key={sheet} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-green-200 text-[12px] text-green-900">
                <FileSpreadsheet className="w-3.5 h-3.5" />{sheet}: {n.toLocaleString('en-IN')} row{n === 1 ? '' : 's'}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground max-w-3xl">
        The workbook contains students&rsquo; personal data. Store and share it only for official department purposes.
      </p>
    </div>
  )
}
