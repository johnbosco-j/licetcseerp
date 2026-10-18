"use server"

import { adminClient, requireRole, requireAdmin, AuthError } from '@/lib/server-auth'
import { normalizeMobile, needsVertical } from '@/lib/utils'
import { defaultStaffPassword, canResetPassword, defaultStudentPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwords'

const DEPT_ID = '00000000-0000-0000-0000-000000000001'
const SECTIONS = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']

export interface NewStudent {
  full_name: string
  email: string
  section: string
  batch_year: number
  roll_number?: string
  register_number?: string
  parent_mobile?: string
  /** parent / guardian email for attendance alerts */
  parent_email?: string | null
  /** lab batch (1, 2 …) — decides which half of a split lab hour the student attends */
  lab_batch?: number | null
  /** vertical code (e.g. AIML, FSD) for III/IV-year students of R2024 batches */
  vertical?: string | null
}

export type ActionResult = { success?: boolean; error?: string; password?: string }

function failure(e: unknown): ActionResult {
  return { error: e instanceof AuthError ? e.message : 'Something went wrong. Please try again.' }
}

async function createStudent(db: ReturnType<typeof adminClient>, data: NewStudent): Promise<ActionResult> {
  const email = data.email?.trim().toLowerCase()
  const full_name = data.full_name?.trim()
  if (!full_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid name and email' }
  if (!SECTIONS.includes(data.section)) return { error: 'Choose a valid section' }
  const lab_batch = Number(data.lab_batch)
  if (!(lab_batch >= 1 && lab_batch <= 4)) return { error: 'Choose the lab batch (1 or 2)' }
  const vertical = data.vertical?.trim().toUpperCase() || null
  if (needsVertical(data.section, data.batch_year) && !vertical) return { error: 'Choose the vertical (e.g. AI & ML or Full Stack)' }
  if (data.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.parent_email.trim())) return { error: 'Parent email is not valid' }

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
    parent_mobile: normalizeMobile(data.parent_mobile) || null,
    lab_batch,
    vertical,
    parent_email: data.parent_email?.trim().toLowerCase() || null,
    is_active: true,
    must_change_password: true,
  })
  if (profErr) {
    await db.auth.admin.deleteUser(authData.user.id)
    return { error: profErr.message }
  }
  return { success: true, password }
}

export async function addStudentAdmin(accessToken: string, data: NewStudent): Promise<ActionResult> {
  try {
    await requireAdmin(accessToken)
    return await createStudent(adminClient(), data)
  } catch (e) {
    return failure(e)
  }
}

export interface ImportRowResult { row: number; email: string; status: 'created' | 'skipped' | 'failed'; message?: string }

// Bulk admission: creates each student like addStudentAdmin. Existing emails are
// skipped, never overwritten. Every new account starts on the default password
// and must change it at first login.
export async function importStudentsAdmin(accessToken: string, rows: NewStudent[]): Promise<{ error?: string; results?: ImportRowResult[] }> {
  try {
    await requireAdmin(accessToken)
    if (!Array.isArray(rows) || rows.length === 0) return { error: 'The file has no student rows' }
    if (rows.length > 50) return { error: 'Send at most 50 students per request' }

    const db = adminClient()
    const emails = rows.map(r => r.email?.trim().toLowerCase()).filter(Boolean)
    const { data: existing } = await db.from('profiles').select('email').in('email', emails)
    const taken = new Set((existing ?? []).map(e => e.email.toLowerCase()))
    const seen = new Set<string>()

    const results: ImportRowResult[] = []
    for (const [i, r] of rows.entries()) {
      const email = r.email?.trim().toLowerCase() ?? ''
      const row = i + 1
      if (taken.has(email)) { results.push({ row, email, status: 'skipped', message: 'Account already exists' }); continue }
      if (seen.has(email)) { results.push({ row, email, status: 'skipped', message: 'Repeated in the file' }); continue }
      seen.add(email)
      if (r.parent_mobile && normalizeMobile(r.parent_mobile) === null) { results.push({ row, email, status: 'failed', message: 'Parent mobile is not a 10-digit number' }); continue }
      const res = await createStudent(db, r)
      results.push(res.error ? { row, email, status: 'failed', message: res.error } : { row, email, status: 'created' })
    }
    return { results }
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
    const { data: target } = await db.from('profiles').select('id, role, section, email, access_tier').eq('id', userId).single()
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
// Archive-then-remove: every graduate's complete record is saved to the private
// "archives" storage bucket first; accounts are deleted only if that succeeds.
/**
 * Archives graduated students: their complete record (profile, hour-wise attendance,
 * marks, leaves, grievances, alerts, promotion history) is saved to the department
 * archive, and their sign-in is blocked. Accounts and history are kept, so the HOD
 * can always read past registers with names. Nothing is deleted.
 */
export async function removeGraduatedStudents(accessToken: string): Promise<ActionResult & { removed?: number; archive?: string }> {
  try {
    const actor = await requireRole(accessToken, ['HOD'])
    const db = adminClient()
    const { data: grads, error } = await db.from('profiles').select('*').eq('role', 'STUDENT').eq('section', 'GRADUATED').is('archived_at', null)
    if (error) return { error: error.message }
    if (!grads?.length) return { success: true, removed: 0 }

    const ids = grads.map(g => g.id)
    const all = async (table: string, select: string, column: string) => {
      const rows: unknown[] = []
      for (let i = 0; i < ids.length; i += 100) {
        for (let from = 0; ; from += 1000) {
          const { data, error: e } = await db.from(table).select(select).in(column, ids.slice(i, i + 100)).range(from, from + 999)
          if (e) throw new Error(`${table}: ${e.message}`)
          rows.push(...(data ?? []))
          if (!data || data.length < 1000) break
        }
      }
      return rows
    }
    // hour-wise attendance: every class hour each graduate was on the list for
    type Sess = { date: string; period_no: number; subject_id: string | null; label: string | null; roster: string[]; absent: string[]; term_id: string | null }
    const sessions: Sess[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await db.from('attendance_sessions').select('date, period_no, subject_id, label, roster, absent, term_id').overlaps('roster', ids).order('date').range(from, from + 999)
      if (e) throw new Error(`attendance_sessions: ${e.message}`)
      sessions.push(...((data ?? []) as Sess[]))
      if (!data || data.length < 1000) break
    }
    const subjIds = [...new Set(sessions.map(s => s.subject_id).filter(Boolean))] as string[]
    const codes = new Map<string, string>()
    for (let i = 0; i < subjIds.length; i += 200) {
      const { data } = await db.from('subjects').select('id, code').in('id', subjIds.slice(i, i + 200))
      for (const r of (data ?? []) as { id: string; code: string }[]) codes.set(r.id, r.code)
    }
    const hourly: Record<string, { date: string; period: number; course: string; present: boolean }[]> = {}
    for (const s of sessions) for (const id of s.roster) if (ids.includes(id)) {
      (hourly[id] ??= []).push({ date: s.date, period: s.period_no, course: (s.subject_id && codes.get(s.subject_id)) || s.label || '', present: !s.absent.includes(id) })
    }
    const archive = {
      kind: 'graduated-students',
      generated_at: new Date().toISOString(),
      generated_by: { id: actor.id, name: actor.full_name },
      students: grads,
      hour_attendance: hourly,
      day_attendance: await all('day_attendance', '*', 'student_id'),
      subject_attendance: await all('attendance', '*, subjects(code, name, semester)', 'student_id'),
      marks: await all('marks', '*, subjects(code, name, semester, credits)', 'student_id'),
      leaves: await all('leaves', '*', 'applicant_id'),
      grievances: await all('grievances', '*', 'student_id'),
      attendance_alerts: await all('attendance_alerts', '*', 'student_id'),
      promotion_history: await all('student_promotion_history', '*', 'student_id'),
    }
    const path = `graduates/${archive.generated_at.slice(0, 19).replace(/:/g, '')}-${grads.length}-students.json`
    const { error: upErr } = await db.storage.from('archives')
      .upload(path, JSON.stringify(archive, null, 2), { contentType: 'application/json', upsert: false })
    if (upErr) return { error: `Archive could not be saved, nothing was changed: ${upErr.message}` }

    let archived = 0
    for (const g of grads) {
      // block sign-in (about 100 years); the profile and all history stay
      const { error: e } = await db.auth.admin.updateUserById(g.id, { ban_duration: '876000h' })
      if (e) continue
      const { error: e2 } = await db.from('profiles').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', g.id)
      if (!e2) archived++
    }
    return { success: true, removed: archived, archive: path }
  } catch (e) {
    return failure(e)
  }
}

/** Archived graduate records with short-lived download links (tier 1 only). */
export async function listArchives(accessToken: string): Promise<{ error?: string; files?: { name: string; created_at: string; url: string }[] }> {
  try {
    await requireRole(accessToken, ['HOD'])
    const db = adminClient()
    const { data, error } = await db.storage.from('archives').list('graduates', { sortBy: { column: 'created_at', order: 'desc' } })
    if (error) return { error: error.message }
    const files = await Promise.all((data ?? []).filter(f => f.name.endsWith('.json')).map(async f => {
      const { data: signed } = await db.storage.from('archives').createSignedUrl(`graduates/${f.name}`, 600, { download: true })
      return { name: f.name, created_at: f.created_at ?? '', url: signed?.signedUrl ?? '' }
    }))
    return { files }
  } catch (e) {
    return failure(e)
  }
}

// ── Staff accounts (HOD) ────────────────────────────────────────────────────
export type NewStaff = { full_name: string; email: string; department?: string | null }
export type StaffRowResult = { email: string; full_name: string; ok: boolean; password?: string; error?: string }

/** Creates faculty accounts (default password licet@<name>, changed at first sign-in).
 *  department empty = CSE; anything else marks staff of another department. */
export async function createStaffAdmin(accessToken: string, rows: NewStaff[]): Promise<{ error?: string; results?: StaffRowResult[] }> {
  try {
    await requireAdmin(accessToken)
    if (!Array.isArray(rows) || !rows.length || rows.length > 200) return { error: 'Give between 1 and 200 staff' }
    const db = adminClient()
    const results: StaffRowResult[] = []
    for (const r of rows) {
      const full_name = String(r.full_name ?? '').trim().replace(/\s+/g, ' ')
      const email = String(r.email ?? '').trim().toLowerCase()
      const dept = String(r.department ?? '').trim()
      if (!full_name || !/^[^\s@]+@licet\.ac\.in$/.test(email)) { results.push({ email, full_name, ok: false, error: 'Needs a name and a licet.ac.in email' }); continue }
      const password = defaultStaffPassword(full_name)
      if (password.length < 10) { results.push({ email, full_name, ok: false, error: 'Name too short for a default password; set one with Reset password after creating' }); continue }
      const { data: au, error: ae } = await db.auth.admin.createUser({ email, password, email_confirm: true })
      if (ae || !au.user) { results.push({ email, full_name, ok: false, error: /already/i.test(ae?.message ?? '') ? 'An account with this email already exists' : ae?.message ?? 'Could not create the login' }); continue }
      const { error: pe } = await db.from('profiles').upsert({
        id: au.user.id, role: 'PROFESSOR', department_id: DEPT_ID, full_name, email, is_active: true, must_change_password: true,
        home_department: dept && !/^cse$/i.test(dept) ? dept : null,
      })
      if (pe) { await db.auth.admin.deleteUser(au.user.id); results.push({ email, full_name, ok: false, error: pe.message }); continue }
      results.push({ email, full_name, ok: true, password })
    }
    return { results }
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : 'Could not create the accounts' }
  }
}
