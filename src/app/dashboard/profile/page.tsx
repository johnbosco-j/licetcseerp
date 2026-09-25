"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Mail, Phone, Key, Loader2, Save, ShieldCheck, UserRound, Download } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import { tierOf } from "@/lib/roles"
import { formatMobile, normalizeMobile } from "@/lib/utils"
import { toast, reportResult } from "@/components/toaster"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

const TIER_LABEL = { 1: "Department leadership", 2: "Faculty", 3: "Student" } as const

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3 text-[13.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground min-w-0 break-words">{value || <span className="text-muted-foreground font-normal">—</span>}</dd>
    </div>
  )
}

export default function MyProfilePage() {
  const router = useRouter()
  const [me, setMe] = useState<Profile | null>(null)
  const [advisor, setAdvisor] = useState<string | null>(null)
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace("/login"); return }
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single()
    if (!data) return
    setMe(data)
    setPhone(data.phone ?? "")
    if (data.role === "STUDENT" && data.section) {
      const { data: adv } = await supabase.from("profiles").select("full_name").eq("advisor_section", data.section).limit(1)
      setAdvisor(adv?.[0]?.full_name ?? null)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const savePhone = async () => {
    if (phone.trim() && normalizeMobile(phone) === null) { toast.error("Enter a 10-digit Indian mobile number."); return }
    setSaving(true)
    const { error } = await supabase.rpc("update_my_phone", { p_phone: phone })
    setSaving(false)
    if (reportResult(error, "Contact number updated")) load()
  }

  if (!me) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading your profile…</div>

  const student = me.role === "STUDENT"
  const tier = tierOf(me)
  const changed = (normalizeMobile(phone) ?? phone.trim()) !== (me.phone ?? "")

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <span className="eyebrow">MY PROFILE</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">{me.full_name}</h1>
        <p className="text-[13.5px] text-muted-foreground mt-1.5">
          {student ? `${me.section} · Batch ${me.batch_year ?? "—"}` : me.designation ?? (me.role === "HOD" ? "Head of Department" : "Faculty")}
          {" · Department of Computer Science & Engineering"}
        </p>
      </div>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-5 py-3.5 border-b border-border bg-licet-paper/70 flex items-center gap-2">
          <UserRound className="w-4 h-4 text-licet-violet" /><span className="eyebrow">Account details</span>
        </header>
        <dl className="divide-y divide-border">
          <Row label="Name" value={me.full_name} />
          <Row label="Email" value={<a href={`mailto:${me.email}`} className="inline-flex items-center gap-1.5 text-licet-violet hover:underline"><Mail size={13} />{me.email}</a>} />
          {student ? (
            <>
              <Row label="Section" value={me.section} />
              <Row label="Roll number" value={me.roll_number} />
              <Row label="Register number" value={me.register_number} />
              <Row label="Batch" value={me.batch_year} />
              <Row label="Class advisor" value={advisor} />
              <Row label="Parent / guardian" value={me.parent_mobile && formatMobile(me.parent_mobile)} />
            </>
          ) : (
            <>
              <Row label="Designation" value={me.designation ?? (me.role === "HOD" ? "Head of Department" : "Faculty")} />
              <Row label="Employee ID" value={me.employee_id} />
              <Row label="Access" value={TIER_LABEL[tier]} />
              {me.advisor_section && <Row label="Class advisor of" value={me.advisor_section} />}
              {me.can_reset_passwords && <Row label="Password administrator" value="Yes" />}
            </>
          )}
        </dl>
        {student && (
          <p className="px-5 py-3 border-t border-border text-[12px] text-muted-foreground">
            To correct your name, roll number, register number or parent / guardian number, contact your class advisor or the HOD office.
          </p>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-licet-violet" /><span className="eyebrow">Your mobile number</span></div>
        <p className="text-[13px] text-muted-foreground">{student ? "Used by the department to reach you. Only staff can see it." : "Shown with your staff profile to signed-in students and staff."}</p>
        <div className="flex flex-wrap gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="10-digit mobile number" maxLength={14}
            className="w-64 h-10 px-3 bg-white border border-input rounded-md text-[13.5px] focus:border-licet-violet focus:outline-none" />
          <button onClick={savePhone} disabled={saving || !changed}
            className="inline-flex items-center gap-2 px-4 py-2 bg-licet-indigo text-white text-[13px] font-semibold rounded-md hover:bg-licet-violet disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Link href="/dashboard/change-password" className="flex items-center gap-3 bg-card border border-border rounded-xl p-5 hover:border-licet-gold hover:shadow-sm">
          <Key className="w-9 h-9 p-2 rounded-lg bg-licet-cream text-licet-indigo" />
          <span><span className="block font-semibold text-licet-indigo">Change password</span><span className="block text-[12.5px] text-muted-foreground">Choose a new password for your account</span></span>
        </Link>
        <Link href="/dashboard/export" className="flex items-center gap-3 bg-card border border-border rounded-xl p-5 hover:border-licet-gold hover:shadow-sm">
          {student ? <Download className="w-9 h-9 p-2 rounded-lg bg-licet-cream text-licet-indigo" /> : <ShieldCheck className="w-9 h-9 p-2 rounded-lg bg-licet-cream text-licet-indigo" />}
          <span><span className="block font-semibold text-licet-indigo">{student ? "Download my records" : "Data export"}</span><span className="block text-[12.5px] text-muted-foreground">{student ? "Attendance, marks and more as Excel" : "Excel workbooks of department records"}</span></span>
        </Link>
      </section>
    </div>
  )
}
