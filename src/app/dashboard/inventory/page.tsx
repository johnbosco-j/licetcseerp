"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isTier1 } from "@/lib/roles"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Plus, X, Package, Monitor, Wrench, AlertTriangle, Loader2, Download, Search, CheckCircle2 } from "lucide-react"
import * as XLSX from "xlsx"

type InventoryItem = Database['public']['Tables']['inventory']['Row']

const CATEGORIES = ['Computers', 'Networking', 'Furniture', 'Electronics', 'Software Licenses', 'Other']
const LOCATIONS = ['CS Lab 1', 'CS Lab 2', 'CS Lab 3', 'Hardware Lab', 'Department Library', 'HOD Cabin', 'Staff Room', 'Seminar Hall']

const STATUS_COLORS = {
  OPERATIONAL: 'text-green-700 bg-green-50 border-green-200',
  MAINTENANCE: 'text-amber-700 bg-amber-50 border-amber-200',
  RETIRED:     'text-red-700 bg-red-50 border-red-200',
}

export default function InventoryPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [form, setForm] = useState({
    asset_tag: '', name: '', category: 'Computers', status: 'OPERATIONAL' as 'OPERATIONAL'|'MAINTENANCE'|'RETIRED',
    location: 'CS Lab 1', purchase_date: '', purchase_value: '', next_service_date: '', notes: ''
  })

  const isHOD = authUser?.type === 'staff' && isTier1(authUser.data)
  const isFaculty = authUser?.type === 'staff'
  const DEPT = '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    const stored = localStorage.getItem('excelsior_user') || localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    if (au.type === 'student') { router.push('/dashboard'); return }
    loadInventory()
  }, [router])

  const loadInventory = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory')
      .select('*')
      .eq('department_id', DEPT)
      .order('asset_tag', { ascending: true })
    if (data) setInventory(data)
    setLoading(false)
  }

  const saveAsset = async () => {
    if (!form.asset_tag || !form.name) return
    setSaving(true)
    const { error } = await supabase.from('inventory').upsert({
      department_id: DEPT,
      asset_tag: form.asset_tag.toUpperCase(),
      name: form.name,
      category: form.category,
      status: form.status,
      location: form.location,
      purchase_date: form.purchase_date || null,
      purchase_value: form.purchase_value ? Number(form.purchase_value) : null,
      next_service_date: form.next_service_date || null,
      notes: form.notes
    }, { onConflict: 'asset_tag' })
    
    setSaving(false)
    if (error) {
      alert(error.message)
    } else {
      setShowForm(false)
      setForm({ asset_tag: '', name: '', category: 'Computers', status: 'OPERATIONAL', location: 'CS Lab 1', purchase_date: '', purchase_value: '', next_service_date: '', notes: '' })
      loadInventory()
    }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from('inventory').update({ status: newStatus as any }).eq('id', id)
    loadInventory()
  }

  const exportXLSX = () => {
    const rows = inventory.map(i => ({
      'Asset Tag': i.asset_tag,
      'Name/Model': i.name,
      'Category': i.category,
      'Location': i.location,
      'Status': i.status,
      'Purchase Date': i.purchase_date ? new Date(i.purchase_date).toLocaleDateString() : '—',
      'Value (₹)': i.purchase_value ? Number(i.purchase_value).toFixed(2) : '—',
      'Next Service': i.next_service_date ? new Date(i.next_service_date).toLocaleDateString() : '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
    ws['!cols'] = [{ wch: 15 },{ wch: 30 },{ wch: 15 },{ wch: 15 },{ wch: 12 },{ wch: 15 },{ wch: 12 },{ wch: 15 }]
    XLSX.writeFile(wb, `CSE_Inventory_Assets_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const filtered = inventory.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.asset_tag.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: inventory.length,
    operational: inventory.filter(i => i.status === 'OPERATIONAL').length,
    maintenance: inventory.filter(i => i.status === 'MAINTENANCE').length,
    value: inventory.reduce((s, i) => s + (Number(i.purchase_value) || 0), 0)
  }

  if (!isFaculty && !isHOD) return null

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">INVENTORY</span>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Lab & Asset Management</h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-3xl">Track department computers, network gear, and lab equipment.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXLSX} disabled={inventory.length === 0}
            className="flex items-center gap-2 px-3 py-2 border border-licet-indigo/25 bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60 shadow-sm disabled:opacity-50 transition-colors">
            <Download className="w-3 h-3" /> Export NAAC Report
          </button>
          {isHOD && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm transition-colors">
              <Plus className="w-3 h-3" /> Add Asset
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: stats.total, icon: Package, color: 'text-foreground' },
          { label: 'Operational', value: stats.operational, icon: CheckCircle2, color: 'text-green-700' },
          { label: 'Needs Repair', value: stats.maintenance, icon: Wrench, color: 'text-amber-700' },
          { label: 'Total Est. Value', value: `₹${stats.value.toLocaleString()}`, icon: Monitor, color: 'text-primary' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="font-mono text-xs text-muted-foreground">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && isHOD && (
        <div className="bg-card border border-licet-gold border-t-[3px] rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">NEW ASSET ENTRY</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Asset Tag (ID) *</label>
              <input value={form.asset_tag} onChange={e => setForm({...form, asset_tag: e.target.value})}
                placeholder="e.g. LICET-CSE-PC01"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none uppercase" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Asset Name / Model *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="e.g. Dell Optiplex 7090, Intel i7, 16GB RAM"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Location</label>
              <select value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Initial Status</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value as any})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none">
                <option value="OPERATIONAL">Operational</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="RETIRED">Retired</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Purchase Value (₹)</label>
              <input type="number" value={form.purchase_value} onChange={e => setForm({...form, purchase_value: e.target.value})}
                placeholder="0.00"
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Next Service Due</label>
              <input type="date" value={form.next_service_date} onChange={e => setForm({...form, next_service_date: e.target.value})}
                className="w-full h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveAsset} disabled={saving || !form.asset_tag || !form.name}
              className="flex-1 h-10 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Asset'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="flex-1 h-10 border border-border bg-white text-licet-indigo text-[13px] font-semibold rounded-md hover:bg-licet-cream/60">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List View */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border bg-accent/30 flex items-center justify-between">
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search asset tag or model..."
              className="w-full h-9 pl-9 pr-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Asset Tag</th>
                <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Details</th>
                <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Location</th>
                <th className="p-4 font-mono text-xs text-muted-foreground font-normal">Status</th>
                {isHOD && <th className="p-4 font-mono text-xs text-muted-foreground font-normal text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <Package className="w-12 h-12 p-3 rounded-full bg-licet-cream text-licet-indigo mx-auto mb-3" />
                    <p className="font-mono text-sm text-muted-foreground">No assets found</p>
                  </td>
                </tr>
              ) : filtered.map((item) => (
                <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                  <td className="p-4 font-mono text-xs font-bold text-primary">{item.asset_tag}</td>
                  <td className="p-4">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">{item.category}</p>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">{item.location}</td>
                  <td className="p-4">
                    <span className={`font-mono text-[10px] font-bold px-2 py-1 rounded border ${STATUS_COLORS[item.status as keyof typeof STATUS_COLORS]}`}>
                      {item.status}
                    </span>
                  </td>
                  {isHOD && (
                    <td className="p-4 text-right">
                      <select 
                        value={item.status} 
                        onChange={e => updateStatus(item.id, e.target.value)}
                        className="h-8 px-2 bg-background border border-border rounded font-mono text-xs focus:border-primary focus:outline-none cursor-pointer">
                        <option value="OPERATIONAL">Set Operational</option>
                        <option value="MAINTENANCE">Send to Repair</option>
                        <option value="RETIRED">Retire Asset</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
