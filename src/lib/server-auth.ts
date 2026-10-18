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
/** `aal` claim of a (Supabase-verified) access token. */
function jwtAal(token: string): string | undefined {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal } catch { return undefined }
}

export async function requireRole(accessToken: string | null | undefined, roles: Role[]) {
  if (!accessToken) throw new AuthError('Not signed in')
  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(accessToken)
  if (error || !user) throw new AuthError('Session expired — please sign in again')
  const { data: profile } = await db.from('profiles')
    .select('id, role, is_active, full_name, email, section, advisor_section, can_reset_passwords, access_tier, staff_type, is_admin').eq('id', user.id).single()
  // Tier-1 faculty (e.g. the Vice Principal) may do whatever the HOD may do.
  const tier1 = profile?.role === 'PROFESSOR' && profile.access_tier === 1
  if (!profile?.is_active || !(roles.includes(profile.role as Role) || (tier1 && roles.includes('HOD')))) {
    throw new AuthError('You do not have permission to do this')
  }
  // Two-step sign-in: once an account has an authenticator, privileged actions need a
  // session confirmed with the code (the same rule the database applies to HOD powers).
  const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: user.id })
  if ((factors?.factors ?? []).some(f => f.status === 'verified') && jwtAal(accessToken) !== 'aal2') {
    throw new AuthError('Confirm your sign-in with the two-step code first')
  }
  return profile as StaffCaller
}

export type StaffCaller = {
  id: string; role: Role; is_active: boolean; full_name: string; email: string
  section: string | null; advisor_section: string | null; can_reset_passwords: boolean
  access_tier: number | null; staff_type: 'TEACHING' | 'ADMIN' | 'LAB'; is_admin: boolean
}

/** Account administration (add students, courses and staff): the HOD / tier 1, non-teaching
 *  administrators, and faculty given administrator powers. Same checks as requireRole. */
export async function requireAdmin(accessToken: string | null | undefined) {
  const p = await requireRole(accessToken, ['HOD', 'PROFESSOR'])
  const ok = p.role === 'HOD' || p.access_tier === 1 || p.staff_type === 'ADMIN' || p.is_admin
  if (!ok) throw new AuthError('You do not have permission to do this')
  return p
}
