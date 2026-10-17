// Pasted staff lists: "Name, email[, department]" per line (also "Name <email>").
export type StaffLine = { full_name: string; email: string; department: string | null }

export function parseStaffList(text: string): StaffLine[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(l => {
    const email = l.match(/[^\s,;<>]+@[^\s,;<>]+/)?.[0]
    if (!email) return []
    const rest = l.replace(email, '').split(/[,;\t]|<|>/).map(x => x.trim()).filter(Boolean)
    return [{ full_name: rest[0] ?? '', email, department: rest[1] ?? null }]
  })
}

