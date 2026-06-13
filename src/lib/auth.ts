import { USERS, type User } from "./users"
import { STUDENTS, type Student } from "./students"
import { supabase } from "./supabase"

export type AuthUser =
  | { type: "staff";   data: User }
  | { type: "student"; data: Student }

// Look up profile info only — no password involved
function findStaff(email: string): User | null {
  return USERS.find(u => u.email === email) ?? null
}
function findStudent(email: string): Student | null {
  return STUDENTS.find(s => s.email === email) ?? null
}

export async function signIn(email: string, password: string): Promise<{
  authUser: AuthUser | null
  error: string | null
}> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { authUser: null, error: "Invalid email or password" }

  // Build AuthUser from local profile lookup (no password stored)
  const staff = findStaff(email)
  if (staff) return { authUser: { type: "staff", data: staff }, error: null }

  const student = findStudent(email)
  if (student) return { authUser: { type: "student", data: student }, error: null }

  return { authUser: null, error: "User profile not found" }
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
  }
}
