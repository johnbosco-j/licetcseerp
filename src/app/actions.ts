"use server"

import { adminClient, requireRole, AuthError } from '@/lib/server-auth'
import { canResetPassword, defaultStudentPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwords'

const DEPT_ID = '00000000-0000-0000-0000-000000000001'
const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export interface NewStudent {
  full_name: string
  email: string
  section: string
  batch_year: number
  roll_number?: string
  register_number?: string
}

export type ActionResult = { success?: boolean; error?: string; password?: string }

function failure(e: unknown): ActionResult {
  return { error: e instanceof AuthError ? e.message : 'Something went wrong. Please try again.' }
}

export async function addStudentAdmin(accessToken: string, data: NewStudent): Promise<ActionResult> {
  try {
    await requireRole(accessToken, ['HOD'])
    const email = data.email?.trim().toLowerCase()
    const full_name = data.full_name?.trim()
    if (!full_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid name and email' }
    if (!SECTIONS.includes(data.section)) return { error: 'Choose a valid section' }

    const db = adminClient()
    const password = defaultStudentPassword(email)
    const { data: authData, error: authErr } = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (authErr || !authData.user) return { error: authErr?.message ?? 'Failed to create login' }

    const { error: profErr } = await db.from('profiles').upsert({
      id: authData.user.id,
      role: 'STUDENT',
      department_id: DEPT_ID,
      full_name,
      email,
      section: data.section,
      batch_year: Number(data.batch_year) || null,
      roll_number: data.roll_number?.trim() || null,
      register_number: data.register_number?.trim() || null,
      is_active: true,
      must_change_password: true,
    })
    if (profErr) {
      await db.auth.admin.deleteUser(authData.user.id)
      return { error: profErr.message }
    }
    return { success: true, password }
  } catch (e) {
    return failure(e)
  }
}

export async function deleteStudentAdmin(accessToken: string, userId: string): Promise<ActionResult> {
  try {
    await requireRole(accessToken, ['HOD'])
    const db = adminClient()
    const { data: target } = await db.from('profiles').select('role').eq('id', userId).single()
    if (target?.role !== 'STUDENT') return { error: 'Only student accounts can be deleted here' }
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return failure(e)
  }
}

// newPassword omitted → students get their default password; faculty must be given one.
export async function resetPassword(accessToken: string, userId: string, newPassword?: string): Promise<ActionResult> {
  try {
    const actor = await requireRole(accessToken, ['HOD', 'PROFESSOR'])
    const db = adminClient()
    const { data: target } = await db.from('profiles').select('id, role, section, email').eq('id', userId).single()
    if (!target) return { error: 'Account not found' }
    if (!canResetPassword(actor, target)) return { error: 'You are not allowed to reset this password' }

    const password = newPassword?.trim()
      || (target.role === 'STUDENT' ? defaultStudentPassword(target.email) : '')
    if (password.length < MIN_PASSWORD_LENGTH) return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }

    const { error } = await db.auth.admin.updateUserById(userId, { password })
    if (error) return { error: error.message }
    await db.from('profiles').update({ must_change_password: true }).eq('id', userId)
    return { success: true, password }
  } catch (e) {
    return failure(e)
  }
}

// Removes students marked GRADUATED (login + profile; linked records cascade).
export async function removeGraduatedStudents(accessToken: string): Promise<ActionResult & { removed?: number }> {
  try {
    await requireRole(accessToken, ['HOD'])
    const db = adminClient()
    const { data: grads, error } = await db.from('profiles').select('id').eq('role', 'STUDENT').eq('section', 'GRADUATED')
    if (error) return { error: error.message }
    let removed = 0
    for (const g of grads ?? []) {
      const { error: e } = await db.auth.admin.deleteUser(g.id)
      if (!e) removed++
    }
    return { success: true, removed }
  } catch (e) {
    return failure(e)
  }
}
