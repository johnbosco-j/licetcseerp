import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Role = 'HOD' | 'PROFESSOR' | 'STUDENT'

let admin: SupabaseClient | null = null

// Service-role client: bypasses RLS, so only use it after requireRole().
export function adminClient(): SupabaseClient {
  if (admin) return admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

export class AuthError extends Error {}

// The browser keeps the Supabase session in localStorage, so callers pass the
// access token explicitly; we verify it with Supabase and check the live role.
export async function requireRole(accessToken: string | null | undefined, roles: Role[]) {
  if (!accessToken) throw new AuthError('Not signed in')
  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(accessToken)
  if (error || !user) throw new AuthError('Session expired — please sign in again')
  const { data: profile } = await db.from('profiles')
    .select('id, role, is_active, full_name, email, section, advisor_section, can_reset_passwords').eq('id', user.id).single()
  if (!profile?.is_active || !roles.includes(profile.role as Role)) {
    throw new AuthError('You do not have permission to do this')
  }
  return profile as StaffCaller
}

export type StaffCaller = {
  id: string; role: Role; is_active: boolean; full_name: string; email: string
  section: string | null; advisor_section: string | null; can_reset_passwords: boolean
}
