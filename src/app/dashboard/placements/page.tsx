"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import { safeUrl } from "@/lib/utils"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Award, Building, Loader2, ExternalLink, Pencil, Trash2, Download, Search, Users, TrendingUp, IndianRupee, Trophy, Briefcase } from "lucide-react"
import { toast, reportResult } from "@/components/toaster"

type Placement = Database['public']['Tables']['placements']['Row']
type Offer = Database['public']['Tables']['placement_offers']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type StudentLite = Pick<Profile, 'id' | 'full_name' | 'roll_number' | 'section' | 'batch_year'>

const DEPT = '00000000-0000-0000-0000-000000000001'
const EMPTY_DRIVE = { company_name: '', role_title: '', package_lpa: '', visit_date: '', description: '', apply_url: '' }
const OFFER_TYPES = { FULL_TIME: 'Full-time', INTERNSHIP: 'Internship', INTERNSHIP_PPO: 'Internship + PPO' } as const
const OFFER_STATUS = { OFFERED: 'Offered', ACCEPTED: 'Accepted', JOINED: 'Joined', DECLINED: 'Declined' } as const
const STATUS_TONE: Record<Offer['status'], string> = {
  OFFERED: 'text-amber-800 bg-amber-50 border-amber-200', ACCEPTED: 'text-green-800 bg-green-50 border-green-200',
  JOINED: 'text-licet-indigo bg-licet-cream border-licet-gold', DECLINED: 'text-red-800 bg-red-50 border-red-200',
}
const input = "w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none"
const label = "font-mono text-xs text-muted-foreground"

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const lpa = (n: number | null | undefined) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })} LPA`

export default function PlacementsPage() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null)
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [offers, setOffers]         = useState<Offer[]>([])
  const [tab, setTab]               = useState<'drives' | 'record'>('drives')
  const [driveForm, setDriveForm]   = useState<typeof EMPTY_DRIVE | null>(null)
  const [editingDrive, setEditingDrive] = useState<string | null>(null)
  const [offerOpen, setOfferOpen]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')
  const [batch, setBatch]           = useState<'ALL' | string>('ALL')
  const [finalYear, setFinalYear]   = useState<number>(0)

  const isHOD     = authUser?.type === 'staff' && isTier1(authUser.data)
  const isStudent = authUser?.type === 'student'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const load = useCallback(async () => {
    const [d, o, fy] = await Promise.all([
      supabase.from('placements').select('*').eq('department_id', DEPT).order('created_at', { ascending: false }),
      supabase.from('placement_offers').select('*').order('offer_date', { ascending: false }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT').like('section', 'IV %'),
    ])
    if (d.error) toast.error(d.error.message)
    setPlacements(d.data ?? [])
    setOffers(o.data ?? [])
    setFinalYear(fy.count ?? 0)
  }, [])

  useEffect(() => { if (profile) load() }, [profile, load])

  // ── Drives ──
  const saveDrive = async () => {
    if (!profile || !driveForm) return
    if (!driveForm.company_name.trim() || !driveForm.role_title.trim()) { toast.error('Company and role are required.'); return }
    if (driveForm.apply_url && !safeUrl(driveForm.apply_url)) { toast.error('The apply link must start with http:// or https://'); return }
    setSaving(true)
    const row = {
      company_name: driveForm.company_name.trim(),
      role_title: driveForm.role_title.trim(),
      package_lpa: driveForm.package_lpa ? Number(driveForm.package_lpa) : null,
      visit_date: driveForm.visit_date || null,
      description: driveForm.description.trim() || null,
      apply_url: driveForm.apply_url.trim() || null,
    }
    const { error } = editingDrive
      ? await supabase.from('placements').update(row).eq('id', editingDrive)
      : await supabase.from('placements').insert({ ...row, department_id: DEPT, is_active: true, created_by: profile.id })
    setSaving(false)
    if (reportResult(error, editingDrive ? 'Drive updated' : 'Drive posted')) { setDriveForm(null); setEditingDrive(null); load() }
  }

  const editDrive = (p: Placement) => {
    setEditingDrive(p.id)
    setDriveForm({ company_name: p.company_name, role_title: p.role_title, package_lpa: p.package_lpa?.toString() ?? '', visit_date: p.visit_date ?? '', description: p.description ?? '', apply_url: p.apply_url ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteDrive = async (p: Placement) => {
    const linked = offers.filter(o => o.placement_id === p.id).length
    if (!confirm(`Delete the ${p.company_name} drive?${linked ? ` The ${linked} offer${linked === 1 ? '' : 's'} recorded for it will be kept.` : ''}`)) return
    const { error } = await supabase.from('placements').delete().eq('id', p.id)
    if (reportResult(error, 'Drive deleted')) load()
  }

  const toggleActive = async (p: Placement) => {
    const { error } = await supabase.from('placements').update({ is_active: !p.is_active }).eq('id', p.id)
    if (reportResult(error, p.is_active ? 'Drive closed' : 'Drive reopened')) load()
  }

  // ── Offers ──
  const setOfferStatus = async (o: Offer, status: Offer['status']) => {
    const { error } = await supabase.from('placement_offers').update({ status }).eq('id', o.id)
    if (reportResult(error, `${o.student_name}: ${OFFER_STATUS[status].toLowerCase()}`)) load()
  }
  const deleteOffer = async (o: Offer) => {
    if (!confirm(`Remove the ${o.company_name} offer for ${o.student_name}?`)) return
    const { error } = await supabase.from('placement_offers').delete().eq('id', o.id)
    if (reportResult(error, 'Offer removed')) load()
  }

  const batches = useMemo(() => [...new Set(offers.map(o => o.batch_year).filter(Boolean))].sort((a, b) => Number(b) - Number(a)) as number[], [offers])
  const scoped = useMemo(() => offers.filter(o => batch === 'ALL' || String(o.batch_year) === batch), [offers, batch])
  const shownOffers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter(o => !q || [o.student_name, o.roll_number, o.company_name, o.role_title, o.section].some(v => v?.toLowerCase().includes(q)))
  }, [scoped, search])

  const stats = useMemo(() => {
    const valid = scoped.filter(o => o.status !== 'DECLINED')
    const jobs = valid.filter(o => o.offer_type !== 'INTERNSHIP')
    const placed = new Set(jobs.map(o => o.student_id ?? `${o.student_name}|${o.roll_number}`))
    const packages = jobs.map(o => o.package_lpa).filter((x): x is number => x != null).map(Number)
    const finalPlaced = new Set(jobs.filter(o => o.section?.startsWith('IV ') && o.student_id).map(o => o.student_id))
    const byCompany = new Map<string, { offers: number; max: number | null }>()
    for (const o of valid) {
      const c = byCompany.get(o.company_name) ?? { offers: 0, max: null }
      c.offers++; if (o.package_lpa != null) c.max = Math.max(c.max ?? 0, Number(o.package_lpa))
      byCompany.set(o.company_name, c)
    }
    return {
      placed: placed.size, offers: valid.length, internships: valid.filter(o => o.offer_type !== 'FULL_TIME').length,
      highest: packages.length ? Math.max(...packages) : null,
      average: packages.length ? packages.reduce((a, b) => a + b, 0) / packages.length : null,
      median: median(packages),
      finalPct: finalYear ? Math.round((100 * finalPlaced.size) / finalYear) : null, finalPlaced: finalPlaced.size,
      companies: [...byCompany.entries()].sort((a, b) => b[1].offers - a[1].offers),
    }
  }, [scoped, finalYear])

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new()
    const offersRows = shownOffers.map(o => ({
      'Student': o.student_name, 'Roll No': o.roll_number ?? '', 'Section': o.section ?? '', 'Batch': o.batch_year ?? '',
      'Company': o.company_name, 'Role': o.role_title ?? '', 'Package (LPA)': o.package_lpa ?? '', 'Type': OFFER_TYPES[o.offer_type],
      'Status': OFFER_STATUS[o.status], 'Offer date': o.offer_date, 'Notes': o.notes ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(offersRows.length ? offersRows : [{ Note: 'No offers recorded' }]), 'Offers')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stats.companies.map(([c, v]) => ({ Company: c, Offers: v.offers, 'Highest package (LPA)': v.max ?? '' }))), 'Company-wise')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Batch', batch === 'ALL' ? 'All batches' : batch], ['Students placed', stats.placed], ['Offers (excluding declined)', stats.offers],
      ['Highest package (LPA)', stats.highest ?? ''], ['Average package (LPA)', stats.average?.toFixed(2) ?? ''], ['Median package (LPA)', stats.median ?? ''],
    ]), 'Summary')
    const drives = placements.map(p => ({ Company: p.company_name, Role: p.role_title, 'Package (LPA)': p.package_lpa ?? '', 'Visit date': p.visit_date ?? '', Status: p.is_active ? 'Active' : 'Closed', Offers: offers.filter(o => o.placement_id === p.id).length }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drives.length ? drives : [{ Note: 'No drives' }]), 'Drives')
    XLSX.writeFile(wb, `Placement_record_CSE_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const active   = placements.filter(p => p.is_active)
  const inactive = placements.filter(p => !p.is_active)
  const myOffers = offers.filter(o => o.student_id === profile?.id)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">PLACEMENTS</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Training & Placement</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">
            {isStudent ? 'Placement drives open to you and the offers you have received' : 'Placement drives, offers and the department placement record'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isStudent && (
            <button onClick={exportXLSX} className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
          {isHOD && (
            <>
              <button onClick={() => { setOfferOpen(true) }} className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
                <Trophy className="w-3.5 h-3.5" /> Record offers
              </button>
              <button onClick={() => { setEditingDrive(null); setDriveForm(EMPTY_DRIVE); setTab('drives') }}
                className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm">
                <Plus className="w-3 h-3" /> Add Drive
              </button>
            </>
          )}
        </div>
      </div>

      {/* Student: my offers */}
      {isStudent && myOffers.length > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-licet-indigo to-licet-violet text-white p-5">
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Congratulations</p>
          <p className="font-serif text-[22px] font-semibold !text-white mt-1">Your offer{myOffers.length > 1 ? 's' : ''}</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {myOffers.map(o => (
              <div key={o.id} className="rounded-lg bg-white/10 border border-white/15 px-4 py-3">
                <p className="font-semibold">{o.company_name}</p>
                <p className="text-[12.5px] text-licet-cream/85">{o.role_title ?? OFFER_TYPES[o.offer_type]} · {lpa(o.package_lpa)} · {OFFER_STATUS[o.status]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isStudent && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {([['drives', `Drives (${placements.length})`], ['record', `Placement record (${offers.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${tab === k ? 'bg-white text-licet-indigo shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
          ))}
        </div>
      )}

      {(tab === 'drives' || isStudent) && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Active Drives', value: active.length },
              { label: 'Total Drives', value: placements.length },
              { label: 'Students Placed', value: stats.placed },
              { label: 'Highest Package', value: stats.highest != null ? `₹${stats.highest}L` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1">{label}</p>
                <p className="font-display text-[28px] font-bold tracking-[-0.03em] leading-none text-licet-indigo">{value}</p>
              </div>
            ))}
          </div>

          {driveForm && isHOD && (
            <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow">{editingDrive ? 'EDIT PLACEMENT DRIVE' : 'NEW PLACEMENT DRIVE'}</span>
                <button onClick={() => { setDriveForm(null); setEditingDrive(null) }} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { key: 'company_name', label: 'Company Name *', placeholder: 'e.g. Zoho Corporation' },
                  { key: 'role_title',   label: 'Role / Position *', placeholder: 'e.g. Software Engineer' },
                  { key: 'package_lpa',  label: 'Package (LPA)', placeholder: 'e.g. 6.5', type: 'number' },
                  { key: 'visit_date',   label: 'Visit Date', placeholder: '', type: 'date' },
                  { key: 'apply_url',    label: 'Apply URL', placeholder: 'https://...' },
                ] as const).map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className={label}>{f.label}</label>
                    <input type={'type' in f ? f.type : 'text'} value={driveForm[f.key]} placeholder={f.placeholder} min={f.key === 'package_lpa' ? 0 : undefined} step={f.key === 'package_lpa' ? '0.1' : undefined}
                      onChange={e => setDriveForm({ ...driveForm, [f.key]: e.target.value })} className={input} />
                  </div>
                ))}
                <div className="sm:col-span-2 space-y-1">
                  <label className={label}>Description & eligibility</label>
                  <textarea value={driveForm.description} onChange={e => setDriveForm({ ...driveForm, description: e.target.value })}
                    placeholder="Job description, eligible batches, CGPA cut-off, bond…" rows={3}
                    className="w-full px-3 py-2 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none resize-none" />
                </div>
              </div>
              <button onClick={saveDrive} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Award className="w-3 h-3" />}
                {editingDrive ? 'Save changes' : 'Post Drive'}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="eyebrow">ACTIVE DRIVES ({active.length})</h2>
            {active.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <Building className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No active placement drives</p>
              </div>
            ) : active.map(p => (
              <div key={p.id} className="bg-card border border-green-200 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-[15px]">{p.company_name}</h3>
                      <span className="font-mono text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">ACTIVE</span>
                      {p.package_lpa != null && <span className="text-xs font-semibold text-licet-violet">{lpa(p.package_lpa)}</span>}
                      {offers.some(o => o.placement_id === p.id) && <span className="text-xs text-muted-foreground">· {offers.filter(o => o.placement_id === p.id).length} selected</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.role_title}</p>
                    {p.visit_date && <p className="text-[13px] text-muted-foreground mt-1">Visit: {new Date(p.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                    {p.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{p.description}</p>}
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-2 flex-shrink-0">
                    {safeUrl(p.apply_url) && (
                      <a href={safeUrl(p.apply_url)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm">
                        <ExternalLink className="w-3 h-3" /> Apply
                      </a>
                    )}
                    {isHOD && (
                      <>
                        <button onClick={() => editDrive(p)} className="flex items-center justify-center gap-1 px-3 py-1.5 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60"><Pencil className="w-3 h-3" /> Edit</button>
                        <button onClick={() => toggleActive(p)} className="px-3 py-1.5 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">Close Drive</button>
                        <button onClick={() => deleteDrive(p)} className="flex items-center justify-center gap-1 px-3 py-1.5 border border-border bg-white text-red-700 text-[13px] font-semibold rounded-md hover:bg-red-50"><Trash2 className="w-3 h-3" /> Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {inactive.length > 0 && (
            <div className="space-y-3">
              <h2 className="eyebrow">PAST DRIVES ({inactive.length})</h2>
              {inactive.map(p => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="opacity-80">
                      <p className="font-medium text-sm">{p.company_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.role_title} {p.package_lpa != null ? `· ${lpa(p.package_lpa)}` : ''}{offers.some(o => o.placement_id === p.id) ? ` · ${offers.filter(o => o.placement_id === p.id).length} selected` : ''}</p>
                    </div>
                    {isHOD && (
                      <div className="flex gap-2">
                        <button onClick={() => editDrive(p)} className="text-xs px-2.5 py-1 border border-border rounded hover:border-primary/50 text-muted-foreground">Edit</button>
                        <button onClick={() => toggleActive(p)} className="text-xs px-2.5 py-1 border border-border rounded hover:border-primary/50 text-muted-foreground">Reopen</button>
                        <button onClick={() => deleteDrive(p)} className="text-xs px-2.5 py-1 border border-border rounded hover:border-red-300 text-red-700">Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'record' && !isStudent && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select value={batch} onChange={e => setBatch(e.target.value)} className="h-9 px-3 bg-white border border-input rounded-md text-[13px]">
              <option value="ALL">All batches</option>
              {batches.map(b => <option key={b} value={String(b)}>Batch {b}</option>)}
            </select>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, roll no, company"
                className="w-full h-9 pl-9 pr-3 bg-white border border-input rounded-md text-[13px] focus:border-licet-violet focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Students placed', value: stats.placed, icon: Users, sub: stats.finalPct != null ? `${stats.finalPlaced} of ${finalYear} final-year students (${stats.finalPct}%)` : '' },
              { label: 'Offers', value: stats.offers, icon: Briefcase, sub: `${stats.internships} internship${stats.internships === 1 ? '' : 's'}` },
              { label: 'Highest package', value: stats.highest != null ? `₹${stats.highest}L` : '—', icon: Trophy, sub: 'per annum' },
              { label: 'Average package', value: stats.average != null ? `₹${stats.average.toFixed(2)}L` : '—', icon: IndianRupee, sub: 'full-time offers' },
              { label: 'Median package', value: stats.median != null ? `₹${stats.median}L` : '—', icon: TrendingUp, sub: 'full-time offers' },
            ].map(({ label, value, icon: Icon, sub }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between"><p className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-muted-foreground">{label}</p><Icon className="w-4 h-4 text-licet-violet" /></div>
                <p className="font-display text-[26px] font-bold tracking-[-0.03em] leading-none text-licet-indigo mt-2">{value}</p>
                {sub && <p className="text-[11.5px] text-muted-foreground mt-1.5">{sub}</p>}
              </div>
            ))}
          </div>

          {stats.companies.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="eyebrow mb-3">OFFERS BY COMPANY</p>
              <div className="flex flex-wrap gap-2">
                {stats.companies.map(([c, v]) => (
                  <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-licet-cream/60 border border-licet-gold/60 text-[12.5px]">
                    <span className="font-semibold text-licet-indigo">{c}</span><span className="text-muted-foreground">{v.offers}{v.max != null ? ` · up to ₹${v.max}L` : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-accent/40 text-left text-[10.5px] font-bold tracking-[1.3px] uppercase text-muted-foreground">
                  <th className="px-4 py-3">Student</th><th className="px-3 py-3">Company · Role</th><th className="px-3 py-3">Package</th>
                  <th className="px-3 py-3">Type</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Status</th>{isHOD && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shownOffers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No offers recorded{isHOD ? ' yet. Use “Record offers” to add selected students.' : '.'}</td></tr>
                ) : shownOffers.map(o => (
                  <tr key={o.id} className="hover:bg-accent/20">
                    <td className="px-4 py-3">
                      {o.student_id ? <Link href={`/dashboard/students/${o.student_id}`} className="font-semibold text-licet-indigo hover:underline">{o.student_name}</Link> : <span className="font-semibold">{o.student_name}</span>}
                      <span className="block text-xs text-muted-foreground">{[o.roll_number, o.section, o.batch_year && `Batch ${o.batch_year}`].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-3 py-3"><span className="font-medium">{o.company_name}</span>{o.role_title && <span className="block text-xs text-muted-foreground">{o.role_title}</span>}</td>
                    <td className="px-3 py-3 tabular-nums">{lpa(o.package_lpa)}</td>
                    <td className="px-3 py-3">{OFFER_TYPES[o.offer_type]}</td>
                    <td className="px-3 py-3 tabular-nums">{new Date(o.offer_date).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-3">
                      {isHOD ? (
                        <select value={o.status} onChange={e => setOfferStatus(o, e.target.value as Offer['status'])} className={`h-7 px-2 rounded border text-xs font-semibold ${STATUS_TONE[o.status]}`}>
                          {Object.entries(OFFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_TONE[o.status]}`}>{OFFER_STATUS[o.status]}</span>}
                    </td>
                    {isHOD && <td className="px-4 py-3 text-right"><button onClick={() => deleteOffer(o)} className="p-1.5 text-muted-foreground hover:text-red-700 hover:bg-red-50 rounded" title="Remove offer" aria-label={`Remove offer for ${o.student_name}`}><Trash2 className="w-4 h-4" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {offerOpen && isHOD && (
        <OfferDialog drives={placements} existing={offers} onClose={() => setOfferOpen(false)} onSaved={() => { setOfferOpen(false); setTab('record'); load() }} />
      )}
    </div>
  )
}

function OfferDialog({ drives, existing, onClose, onSaved }: { drives: Placement[]; existing: Offer[]; onClose: () => void; onSaved: () => void }) {
  const [students, setStudents] = useState<StudentLite[]>([])
  const [q, setQ] = useState('')
  const [section, setSection] = useState('IV')
  const [picked, setPicked] = useState<Record<string, StudentLite>>({})
  const [driveId, setDriveId] = useState('')
  const [f, setF] = useState({ company_name: '', role_title: '', package_lpa: '', offer_type: 'FULL_TIME' as Offer['offer_type'], status: 'OFFERED' as Offer['status'], offer_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, roll_number, section, batch_year').eq('role', 'STUDENT').order('section').order('full_name')
      .then(({ data }) => setStudents(data ?? []))
  }, [])

  const chooseDrive = (id: string) => {
    setDriveId(id)
    const d = drives.find(x => x.id === id)
    if (d) setF(x => ({ ...x, company_name: d.company_name, role_title: d.role_title, package_lpa: d.package_lpa?.toString() ?? '' }))
  }

  const list = students.filter(s => (section === 'ALL' || s.section?.startsWith(section + ' ')) &&
    (!q.trim() || [s.full_name, s.roll_number].some(v => v?.toLowerCase().includes(q.trim().toLowerCase()))))

  const save = async () => {
    const chosen = Object.values(picked)
    if (!chosen.length) { toast.error('Select at least one student.'); return }
    if (!f.company_name.trim()) { toast.error('Enter the company name.'); return }
    const dup = chosen.filter(s => existing.some(o => o.student_id === s.id && o.offer_type === f.offer_type && o.company_name.toLowerCase() === f.company_name.trim().toLowerCase()))
    if (dup.length) { toast.error(`Already recorded: ${dup.map(s => s.full_name).join(', ')} ${dup.length === 1 ? 'has' : 'have'} a ${OFFER_TYPES[f.offer_type].toLowerCase()} offer from ${f.company_name.trim()}. Deselect ${dup.length === 1 ? 'them' : 'those students'} to continue.`); return }
    setSaving(true)
    const { error } = await supabase.from('placement_offers').insert(chosen.map(s => ({
      student_id: s.id, student_name: s.full_name, roll_number: s.roll_number, section: s.section, batch_year: s.batch_year,
      placement_id: driveId || null, company_name: f.company_name.trim(), role_title: f.role_title.trim() || null,
      package_lpa: f.package_lpa ? Number(f.package_lpa) : null, offer_type: f.offer_type, status: f.status,
      offer_date: f.offer_date, notes: f.notes.trim() || null,
    })))
    setSaving(false)
    if (reportResult(error, `${chosen.length} offer${chosen.length === 1 ? '' : 's'} recorded for ${f.company_name.trim()}`)) onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-licet-indigo/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Record placement offers" onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border-t-[3px] border-licet-gold">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
          <div>
            <p className="eyebrow">Placement record</p>
            <h2 className="font-serif text-[24px] font-semibold text-licet-indigo mt-1">Record selected students</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={label}>From drive (optional)</label>
              <select value={driveId} onChange={e => chooseDrive(e.target.value)} className={input}>
                <option value="">Off-campus / not listed</option>
                {drives.map(d => <option key={d.id} value={d.id}>{d.company_name} — {d.role_title}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2"><label className={label}>Company *</label><input value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} className={input} /></div>
              <div className="space-y-1"><label className={label}>Role</label><input value={f.role_title} onChange={e => setF({ ...f, role_title: e.target.value })} className={input} /></div>
              <div className="space-y-1"><label className={label}>Package (LPA)</label><input type="number" min={0} step="0.1" value={f.package_lpa} onChange={e => setF({ ...f, package_lpa: e.target.value })} className={input} /></div>
              <div className="space-y-1"><label className={label}>Offer type</label>
                <select value={f.offer_type} onChange={e => setF({ ...f, offer_type: e.target.value as Offer['offer_type'] })} className={input}>
                  {Object.entries(OFFER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="space-y-1"><label className={label}>Status</label>
                <select value={f.status} onChange={e => setF({ ...f, status: e.target.value as Offer['status'] })} className={input}>
                  {Object.entries(OFFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="space-y-1"><label className={label}>Offer date</label><input type="date" value={f.offer_date} onChange={e => setF({ ...f, offer_date: e.target.value })} className={input} /></div>
              <div className="space-y-1"><label className={label}>Notes</label><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={input} placeholder="Optional" /></div>
            </div>
            {Object.keys(picked).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.values(picked).map(s => (
                  <button key={s.id} onClick={() => setPicked(p => { const n = { ...p }; delete n[s.id]; return n })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-licet-cream border border-licet-gold text-[12px] text-licet-indigo">
                    {s.full_name}<X size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col min-h-[320px]">
            <div className="flex gap-2">
              <select value={section} onChange={e => setSection(e.target.value)} className="h-9 px-2 bg-white border border-input rounded-md text-[13px]">
                <option value="ALL">All years</option>
                {['I', 'II', 'III', 'IV'].map(y => <option key={y} value={y}>{y} year</option>)}
              </select>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or roll no" className="flex-1 h-9 px-3 bg-white border border-input rounded-md text-[13px] focus:border-licet-violet focus:outline-none" />
            </div>
            <ul className="mt-2 flex-1 max-h-[360px] overflow-y-auto border border-border rounded-md divide-y divide-border">
              {list.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No students match</li> : list.map(s => (
                <li key={s.id}>
                  <label className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-licet-cream/40 cursor-pointer">
                    <input type="checkbox" checked={!!picked[s.id]} onChange={e => setPicked(p => { const n = { ...p }; if (e.target.checked) n[s.id] = s; else delete n[s.id]; return n })} />
                    <span className="flex-1 min-w-0 truncate">{s.full_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{s.roll_number ?? ''} · {s.section}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-semibold hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />} Record {Object.keys(picked).length || ''} offer{Object.keys(picked).length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
