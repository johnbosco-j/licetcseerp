// Default student password: the email's local part without dots + "@licet",
// e.g. lithika.30csb@licet.ac.in → lithika30csb@licet
export function defaultStudentPassword(email: string): string {
  return email.split('@')[0].replace(/\./g, '') + '@licet'
}

export const MIN_PASSWORD_LENGTH = 8

type Actor = { id: string; role: string; advisor_section: string | null; can_reset_passwords: boolean; access_tier?: number | null }
type Target = { id: string; role: string; section: string | null; access_tier?: number | null }

// Students: HOD, password admins, or the class advisor of their section.
// Faculty: HOD, tier-1 faculty or password admins. Tier-1 accounts (e.g. the Vice
// Principal) only by the HOD. Nobody resets their own password here — that's Change Password.
export function canResetPassword(actor: Actor, target: Target): boolean {
  if (actor.id === target.id || target.role === 'HOD') return false
  if (target.access_tier === 1) return actor.role === 'HOD'
  const actorTier1 = actor.role === 'HOD' || (actor.role === 'PROFESSOR' && actor.access_tier === 1)
  if (actorTier1 || actor.can_reset_passwords) return target.role === 'STUDENT' || target.role === 'PROFESSOR'
  return actor.role === 'PROFESSOR' && target.role === 'STUDENT' && !!actor.advisor_section && actor.advisor_section === target.section
}
