#!/usr/bin/env node
// Removes two-step sign-in (authenticator) from one account, e.g. when the HOD has lost
// their phone. They sign in with their password and can set it up again on My Profile.
//
//   node scripts/reset-two-step.mjs person@licet.ac.in
import { supabase } from './admin-client.mjs'

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email) { console.error('Usage: node scripts/reset-two-step.mjs <email>'); process.exit(1) }
const { data: p } = await supabase.from('profiles').select('id, full_name').eq('email', email).maybeSingle()
if (!p) { console.error('No account with that email'); process.exit(1) }
const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: p.id })
if (error) { console.error(error.message); process.exit(1) }
for (const f of data.factors) {
  const { error: e } = await supabase.auth.admin.mfa.deleteFactor({ userId: p.id, id: f.id })
  if (e) { console.error(e.message); process.exit(1) }
}
console.log(`Removed ${data.factors.length} authenticator(s) from ${p.full_name}. They can set it up again on My Profile.`)
