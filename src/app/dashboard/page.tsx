"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import HodDashboard from "@/components/dashboard/hod-dashboard"
import FacultyDashboard from "@/components/dashboard/faculty-dashboard"
import StudentDashboard from "@/components/dashboard/student-dashboard"

type Me = {
  id: string; full_name: string; email: string; section: string | null; advisor_section: string | null
  register_number: string | null; roll_number: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [greeting, setGreeting] = useState("Welcome")

  useEffect(() => {
    const stored = localStorage.getItem("licet_user") || localStorage.getItem("excelsior_user")
    if (!stored) { router.push("/login"); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    const h = new Date().getHours()
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening")
    supabase.from('profiles')
      .select('id, full_name, email, section, advisor_section, register_number, roll_number')
      .eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setMe(data as Me) })
  }, [router])

  if (!authUser) return null
  const role = authUser.type === 'staff' ? authUser.data.role : 'STUDENT'
  const name = (me?.full_name ?? authUser.data.name ?? '').replace(/^(Dr|Mr|Ms|Mrs|Rev|Fr)\.?\s+/i, '').split(' ')[0]

  return (
    <div className="p-4 sm:p-5 md:p-8 max-w-[1440px]">
      {role === 'HOD' ? <HodDashboard name={name} greeting={greeting} />
        : role === 'PROFESSOR' ? <FacultyDashboard me={me} name={name} greeting={greeting} />
        : <StudentDashboard me={me} name={name} greeting={greeting} />}
    </div>
  )
}
