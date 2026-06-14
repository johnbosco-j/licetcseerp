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
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { authUser: null, error: "Invalid email or password" }

  // Build AuthUser from the live profiles table (source of truth),
  // not from the static STUDENTS/USERS arrays.
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single()

  if (profErr || !profile) {
    return { authUser: null, error: "User profile not found" }
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
    roll_number: (profile as any).roll_number ?? null,
    register_number: (profile as any).register_number ?? null,
    department_id: profile.department_id,
  }
  return { authUser: { type: "student", data }, error: null }
}

// Keep authenticateAny as async wrapper for login/page.tsx
export async function authenticateAny(email: string, password: string): Promise<AuthUser | null> {
  const { authUser } = await signIn(email, password)
  return authUser
}

export async function signOut() {
  await supabase.auth.signOut()
  if (typeof window !== "undefined") {
    localStorage.removeItem("excelsior_user")
    localStorage.removeItem("licet_user")
  }
}