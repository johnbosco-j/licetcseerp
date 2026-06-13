"use server"

import { createClient } from '@supabase/supabase-js'

// Initialize admin client securely on the server
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function addStudentAdmin(data: any) {
  // 1. Create auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true
  })
  
  if (authErr) return { error: authErr.message }
  if (!authData.user) return { error: "Failed to create auth user" }

  // 2. Insert profile
  const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
    id: authData.user.id,
    role: 'STUDENT',
    department_id: '00000000-0000-0000-0000-000000000001',
    full_name: data.full_name,
    email: data.email,
    section: data.section,
    batch_year: data.batch_year,
    is_active: true
  })

  if (profErr) {
    // Rollback if profile creation fails
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { error: profErr.message }
  }

  return { success: true }
}

export async function deleteStudentAdmin(userId: string) {
  // Deleting the auth user automatically cascades and deletes the profile
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  return { success: true }
}
