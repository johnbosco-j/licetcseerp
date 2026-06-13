"use client"
import { useEffect, useState } from "react"
import { Users, ClipboardList, BookOpen, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export function DashboardStats() {
  const [studentCount, setStudentCount] = useState("0")
  const [subjectCount, setSubjectCount] = useState("0")

  useEffect(() => {
    async function loadStats() {
      const { count: sCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'STUDENT')
      const { count: subCount } = await supabase.from('subjects').select('*', { count: 'exact', head: true })
      setStudentCount(sCount?.toString() || "0")
      setSubjectCount(subCount?.toString() || "0")
    }
    loadStats()
  }, [])

  const stats = [
    { label: 'Total Students',   value: studentCount, up: true,  icon: Users },
    { label: 'Avg Attendance',   value: '84%',        up: true,  icon: ClipboardList },
    { label: 'Total Subjects',   value: subjectCount, up: true,  icon: BookOpen },
    { label: 'At-Risk Students', value: '12',         up: false, icon: AlertTriangle },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 w-full">
      {stats.map(({ label, value, up, icon: Icon }) => (
        <div key={label} className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-6 shadow-xl hover:bg-white/10 hover:border-cyan-500/30 transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-black/20 rounded-xl border border-white/5 group-hover:border-cyan-500/50 transition-colors">
              <Icon className="w-5 h-5 text-cyan-400" />
            </div>
            {up ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
          <p className="text-4xl font-black text-white mb-1 tracking-tight">{value}</p>
          <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">{label}</p>
        </div>
      ))}
    </div>
  )
}
