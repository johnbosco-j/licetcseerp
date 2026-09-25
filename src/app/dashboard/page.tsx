"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import { tierOf } from "@/lib/roles"
import HodDashboard from "@/components/dashboard/hod-dashboard"
import FacultyDashboard from "@/components/dashboard/faculty-dashboard"
import StudentDashboard from "@/components/dashboard/student-dashboard"

type Me = {
  id: string; full_name: string; email: string; role: string; section: string | null; advisor_section: string | null
  register_number: string | null; roll_number: string | null; employee_id: string | null
  designation: string | null; access_tier: number | null; can_reset_passwords: boolean | null; parent_mobile: string | null
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
      .select('id, full_name, email, role, section, advisor_section, register_number, roll_number, employee_id, designation, access_tier, can_reset_passwords, parent_mobile')
      .eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setMe(data as Me) })
  }, [router])

  if (!authUser) return null
  // Tier from the live profile once loaded (the stored copy may predate a change).
  const tier = tierOf(me ?? (authUser.data as { role?: string; access_tier?: number | null }))
  const name = (me?.full_name ?? authUser.data.name ?? '').replace(/^(Dr|Mr|Ms|Mrs|Rev|Fr)\.?\s+/i, '').split(' ')[0]

  return (
    <div className="p-4 sm:p-5 md:p-8 max-w-[1440px] space-y-10">
      {tier === 1 ? (
        <>
          <HodDashboard name={name} greeting={greeting} designation={me?.designation} />
          {me?.role === 'PROFESSOR' && <FacultyDashboard me={me} name={name} greeting={greeting} embedded />}
        </>
      ) : tier === 2 ? <FacultyDashboard me={me} name={name} greeting={greeting} />
        : <StudentDashboard me={me} name={name} greeting={greeting} />}
    </div>
  )
}
