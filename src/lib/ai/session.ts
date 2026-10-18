// Who is asking, from their access token; and a database client acting as them (RLS applies).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/server-auth'
import type { Asker } from './tools'

export async function askerFrom(req: Request, opts: { quota?: boolean } = {}): Promise<{ me: Asker; db: SupabaseClient; token: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token) return { error: 'Sign in first', status: 401 }
  const { data: { user } } = await adminClient().auth.getUser(token)
  if (!user) return { error: 'Session expired — sign in again', status: 401 }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: p } = await db.from('profiles').select('id, role, access_tier, full_name, section, advisor_section, is_active, staff_type, is_admin').eq('id', user.id).single()
  if (!p?.is_active) return { error: 'Account not active', status: 403 }
  if (opts.quota !== false) {
    const { data: ok } = await db.rpc('ai_take_quota')
    if (!ok) return { error: 'The assistant is switched off, or you have reached today’s limit.', status: 429 }
  }
  return { db, token, me: { id: p.id, role: p.role, tier1: p.role === 'HOD' || (p.role === 'PROFESSOR' && p.access_tier === 1), full_name: p.full_name, section: p.section, advisor_section: p.advisor_section,
    kind: p.role === 'STUDENT' ? 'STUDENT' : (p.staff_type ?? 'TEACHING'), admin: p.role === 'HOD' || p.access_tier === 1 || p.staff_type === 'ADMIN' || !!p.is_admin } }
}
