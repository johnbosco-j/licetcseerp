import { supabase } from "./supabase"
import type { Database } from "./supabase"

type ProfileRow = Database['public']['Tables']['profiles']['Row']

// Backward-compatible shape: keeps the old field names (`name`, `role`, `section`,
// `email`) that existing pages already read off `authUser.data`, while also
// exposing the full live `profiles` row (id, roll_number, register_number,
// batch_year, etc.) under the same object so newer code can use those too.
export type StaffData = {
  id: string
  name: string
  full_name: string
  email: string
  role: 'HOD' | 'PROFESSOR'
  section: string | null
  batch_year: number | null
  department_id: string | null
} & ProfileRow

export type StudentData = {
  id: string
  name: string
  full_name: string
  email: string
  section: string | null
  batch_year: number | null
  year: number | null
  roll_number: string | null
  register_number: string | null
  department_id: string | null
} & ProfileRow

export type AuthUser =
  | { type: "staff";   data: StaffData }
  | { type: "student"; data: StudentData }

export async function signIn(email: string, password: string): Promise<{
  authUser: AuthUser | null
  error: string | null
}> {
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password })
  if (error?.name === "AuthRetryableFetchError" || (error && !error.status)) {
    return { authUser: null, error: "Can't reach the ERP server. Check your connection and try again." }
  }
  if (error || !auth.user) return { authUser: null, error: "Invalid email or password" }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .single()

  if (profErr || !profile) {
    await supabase.auth.signOut()
    return { authUser: null, error: "No ERP profile is linked to this account. Contact the department office." }
  }
  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { authUser: null, error: "This account has been deactivated." }
  }

  if (profile.role === 'HOD' || profile.role === 'PROFESSOR') {
    const data: StaffData = {
      ...profile,
      id: profile.id,
      name: profile.full_name,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      section: profile.section,
      batch_year: profile.batch_year ?? null,
      department_id: profile.department_id,
    }
    return { authUser: { type: "staff", data }, error: null }
  }

  // STUDENT
  const data: StudentData = {
    ...profile,
    id: profile.id,
    name: profile.full_name,
    full_name: profile.full_name,
    email: profile.email,
    section: profile.section,
    batch_year: profile.batch_year ?? null,
    year: profile.batch_year ?? null,
    roll_number: profile.roll_number ?? null,
    register_number: profile.register_number ?? null,
    department_id: profile.department_id,
  }
  return { authUser: { type: "student", data }, error: null }
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function signOut() {
  await supabase.auth.signOut()
  if (typeof window !== "undefined") {
    localStorage.removeItem("excelsior_user")
    localStorage.removeItem("licet_user")
  }
}