"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Wallet, TrendingUp, TrendingDown, Loader2, Download, Search, Undo2 } from "lucide-react"
import { toast, reportResult } from "@/components/toaster"
import * as XLSX from "xlsx"

type FinanceRow = Database['public']['Tables']['finance_ledger']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const CATEGORIES = ['Equipment','Events','Maintenance','Salaries','Lab Supplies','Student Activities','Travel','Miscellaneous']

export default function FinancePage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [ledger, setLedger]     = useState<FinanceRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [range, setRange]       = useState({ from: '', to: '', category: 'ALL', type: 'ALL', q: '' })
  const [form, setForm] = useState({
    txn_type: 'CREDIT' as 'CREDIT'|'DEBIT',
    category: 'Equipment', amount: '',
    description: '', reference_no: ''
  })

  const isHOD = authUser?.type === 'staff' && isTier1(authUser.data)
  const DEPT  = '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type !== 'staff') { router.push('/dashboard'); return }
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadLedger = async () => {
    const { data } = await supabase.from('finance_ledger').select('*')
      .eq('department_id', DEPT).order('sequence_no', { ascending: false })
    if (data) setLedger(data)
  }

  useEffect(() => { if (profile) loadLedger() }, [profile])

  const addEntry = async () => {
    if (!profile || !form.amount || !form.description.trim()) return
    if (!(Number(form.amount) > 0)) { toast.error('Enter an amount greater than zero.'); return }
    setSaving(true)
    const seq = (ledger[0]?.sequence_no ?? 0) + 1
    const { error } = await supabase.from('finance_ledger').insert({
      department_id: DEPT,
      txn_type: form.txn_type,
      category: form.category,
      amount: Number(form.amount),
      description: form.description,
      reference_no: form.reference_no || null,
      created_by: profile.id,
      sequence_no: seq,
    })
    setSaving(false)
    if (!reportResult(error, 'Entry added to the ledger')) return
    setForm({ txn_type: 'CREDIT', category: 'Equipment', amount: '', description: '', reference_no: '' })
    setShowForm(false)
    loadLedger()
  }

  // Entries can't be edited or deleted (tamper-proof chain), so a mistake is
  // corrected with an opposite entry that references the original.
  const reverseEntry = async (l: FinanceRow) => {
    if (!profile) return
    if (!confirm(`Record a correcting ${l.txn_type === 'CREDIT' ? 'debit' : 'credit'} of ₹${Number(l.amount).toLocaleString('en-IN')} for entry #${l.sequence_no}?`)) return
    const { error } = await supabase.from('finance_ledger').insert({
      department_id: DEPT,
      txn_type: l.txn_type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      category: l.category,
      amount: Number(l.amount),
      description: `Correction of entry #${l.sequence_no}: ${l.description}`,
      reference_no: `REV-${l.sequence_no}`,
      created_by: profile.id,
      sequence_no: (ledger[0]?.sequence_no ?? 0) + 1,
    })
    if (reportResult(error, `Entry #${l.sequence_no} reversed`)) loadLedger()
  }

  const reversed = new Set(ledger.map(l => l.reference_no?.match(/^REV-(\d+)$/)?.[1]).filter(Boolean).map(Number))
  const shown = ledger.filter(l => {
    const d = new Date(l.created_at).toLocaleDateString('en-CA')
    const q = range.q.trim().toLowerCase()
    return (!range.from || d >= range.from) && (!range.to || d <= range.to)
      && (range.category === 'ALL' || l.category === range.category)
      && (range.type === 'ALL' || l.txn_type === range.type)
      && (!q || [l.description, l.reference_no, String(l.sequence_no)].some(v => v?.toLowerCase().includes(q)))
  })
  const byCategory = CATEGORIES.map(c => {
    const rows = shown.filter(l => l.category === c)
    return { c, credit: rows.filter(l => l.txn_type === 'CREDIT').reduce((s, l) => s + Number(l.amount), 0), debit: rows.filter(l => l.txn_type === 'DEBIT').reduce((s, l) => s + Number(l.amount), 0) }
  }).filter(x => x.credit || x.debit)
  const filtering = shown.length !== ledger.length

  const totalCredit = shown.filter(l => l.txn_type === 'CREDIT').reduce((s, l) => s + Number(l.amount), 0)
  const totalDebit  = shown.filter(l => l.txn_type === 'DEBIT').reduce((s, l) => s + Number(l.amount), 0)
  const balance     = totalCredit - totalDebit

  const exportXLSX = () => {
    const rows = shown.map(l => ({
      'Seq': l.sequence_no,
      'Date': new Date(l.created_at).toLocaleDateString(),
      'Type': l.txn_type,
      'Category': l.category,
      'Description': l.description,
      'Amount (₹)': Number(l.amount).toFixed(2),
      'Reference': l.reference_no ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Finance Ledger')
    ws['!cols'] = [{ wch: 5 },{ wch: 12 },{ wch: 8 },{ wch: 15 },{ wch: 40 },{ wch: 12 },{ wch: 15 }]
    XLSX.writeFile(wb, `Finance_Ledger_CSE_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (!isHOD) return (
    <div className="p-6">
      <div className="bg-card border border-dashed border-licet-gold/70 rounded-xl p-12 text-center">
        <Wallet className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
        <p className="font-mono text-sm text-muted-foreground">Finance module is restricted to HOD only</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="eyebrow">FINANCE</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Finance Ledger</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">Department budget tracking with tamper-proof entries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXLSX}
            className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm">
            <Plus className="w-3 h-3" /> Add Entry
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Credits', value: `₹${totalCredit.toLocaleString()}`, color: 'text-green-700', icon: TrendingUp },
          { label: 'Total Debits',  value: `₹${totalDebit.toLocaleString()}`,  color: 'text-red-700',   icon: TrendingDown },
          { label: filtering ? 'Net (filtered)' : 'Balance', value: `₹${balance.toLocaleString()}`,      color: balance >= 0 ? 'text-green-700' : 'text-red-700', icon: Wallet },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="font-mono text-xs text-muted-foreground">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><label className="font-mono text-xs text-muted-foreground">From</label>
          <input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} className="h-9 px-2 bg-white border border-input rounded-md text-[13px]" /></div>
        <div className="space-y-1"><label className="font-mono text-xs text-muted-foreground">To</label>
          <input type="date" value={range.to} min={range.from} onChange={e => setRange({ ...range, to: e.target.value })} className="h-9 px-2 bg-white border border-input rounded-md text-[13px]" /></div>
        <div className="space-y-1"><label className="font-mono text-xs text-muted-foreground">Category</label>
          <select value={range.category} onChange={e => setRange({ ...range, category: e.target.value })} className="h-9 px-2 bg-white border border-input rounded-md text-[13px]">
            <option value="ALL">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="space-y-1"><label className="font-mono text-xs text-muted-foreground">Type</label>
          <select value={range.type} onChange={e => setRange({ ...range, type: e.target.value })} className="h-9 px-2 bg-white border border-input rounded-md text-[13px]">
            <option value="ALL">Credits & debits</option><option value="CREDIT">Credits</option><option value="DEBIT">Debits</option>
          </select></div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={range.q} onChange={e => setRange({ ...range, q: e.target.value })} placeholder="Search description, reference, entry no."
            className="w-full h-9 pl-9 pr-3 bg-white border border-input rounded-md text-[13px] focus:border-licet-violet focus:outline-none" />
        </div>
        {filtering && <button onClick={() => setRange({ from: '', to: '', category: 'ALL', type: 'ALL', q: '' })} className="h-9 px-3 text-[12.5px] font-semibold text-licet-violet hover:underline">Clear filters</button>}
      </div>

      {byCategory.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="eyebrow mb-3">BY CATEGORY{filtering ? ' (FILTERED)' : ''}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {byCategory.map(x => (
              <div key={x.c} className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-licet-indigo">{x.c}</p>
                <p className="text-[12px] text-muted-foreground tabular-nums"><span className="text-green-700">+₹{x.credit.toLocaleString('en-IN')}</span> · <span className="text-red-700">−₹{x.debit.toLocaleString('en-IN')}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">NEW ENTRY</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Type</label>
              <div className="flex gap-2">
                {(['CREDIT','DEBIT'] as const).map(t => (
                  <button key={t} onClick={() => setForm({...form, txn_type: t})}
                    className={`flex-1 h-10 font-mono text-xs rounded border transition-all ${form.txn_type === t ? t === 'CREDIT' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                placeholder="0.00"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Reference No.</label>
              <input value={form.reference_no} onChange={e => setForm({...form, reference_no: e.target.value})}
                placeholder="Invoice / receipt number"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Description *</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="What is this transaction for?"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
          </div>
          <button onClick={addEntry} disabled={saving || !form.amount || !form.description}
            className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            {saving ? 'Saving...' : 'Add Entry'}
          </button>
        </div>
      )}

      {/* Ledger table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-licet-paper/70 rounded-t-xl">
          <span className="eyebrow">LEDGER ({filtering ? `${shown.length} of ${ledger.length}` : ledger.length} entries)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                {['Seq','Date','Type','Category','Description','Amount','Reference',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center font-mono text-sm text-muted-foreground">{ledger.length ? 'No entries match the filters' : 'No entries yet'}</td></tr>
              ) : shown.map(l => (
                <tr key={l.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.sequence_no}</td>
                  <td className="px-4 py-3 font-mono text-xs">{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${l.txn_type === 'CREDIT' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                      {l.txn_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.category}</td>
                  <td className="px-4 py-3 text-sm max-w-xs truncate">{l.description}</td>
                  <td className={`px-4 py-3 font-mono text-sm font-bold ${l.txn_type === 'CREDIT' ? 'text-green-700' : 'text-red-700'}`}>
                    {l.txn_type === 'CREDIT' ? '+' : '-'}₹{Number(l.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.reference_no ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {reversed.has(Number(l.sequence_no)) ? <span className="text-[11px] text-muted-foreground">reversed</span>
                      : !l.reference_no?.startsWith('REV-') && (
                        <button onClick={() => reverseEntry(l)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-licet-violet hover:underline" title="Record a correcting entry"><Undo2 className="w-3 h-3" />Reverse</button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
