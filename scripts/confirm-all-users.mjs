import { supabase } from './admin-client.mjs'
let page = 1
let totalFixed = 0

while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
  if (error || !data?.users?.length) break

  for (const user of data.users) {
    if (!user.email_confirmed_at) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true
      })
      if (updateError) console.log(`✗ ${user.email}: ${updateError.message}`)
      else { console.log(`✓ Confirmed: ${user.email}`); totalFixed++ }
    }
  }

  if (data.users.length < 50) break
  page++
}

console.log(`\nTotal confirmed: ${totalFixed} users`)
