export type UserRole = "HOD" | "PROFESSOR"
export interface User {
  name: string
  email: string
  role: UserRole
  initials: string
}
export const USERS: User[] = [
  { name: "Dr. Sharmila VJ",         email: "hodcse@licet.ac.in",           role: "HOD",       initials: "SJ" },
  { name: "Dr. Remegius Praveen L",   email: "reme@licet.ac.in",             role: "PROFESSOR", initials: "RP" },
  { name: "Dr. Arulmozhi P",          email: "arulmozhi.p@licet.ac.in",      role: "PROFESSOR", initials: "AP" },
  { name: "Dr. Gopalakrishnan K",     email: "drgk81@licet.ac.in",           role: "PROFESSOR", initials: "GK" },
  { name: "Dr. Sharmila VJ (Member)", email: "sharmila.vj@licet.ac.in",      role: "PROFESSOR", initials: "SV" },
  { name: "Dr. Jainish GR",           email: "jainish.gr@licet.ac.in",       role: "PROFESSOR", initials: "JG" },
  { name: "Ms. Delphy P",             email: "delphy.p@licet.ac.in",         role: "PROFESSOR", initials: "DP" },
  { name: "Ms. Freesie Greta L",      email: "freesiegreta.l@licet.ac.in",   role: "PROFESSOR", initials: "FG" },
  { name: "Ms. Jeevitha A",           email: "jeevitha.a@licet.ac.in",       role: "PROFESSOR", initials: "JA" },
  { name: "Ms. Sathia Priya R",       email: "sathiapriya.r@licet.ac.in",    role: "PROFESSOR", initials: "SP" },
  { name: "Ms. Daya Mary Mathew",     email: "dayamarymathew@licet.ac.in",   role: "PROFESSOR", initials: "DM" },
  { name: "Ms. Accelia S",            email: "accelia.s@licet.ac.in",        role: "PROFESSOR", initials: "AS" },
  { name: "Ms. Priya A",              email: "priya.a@licet.ac.in",          role: "PROFESSOR", initials: "PA" },
  { name: "Ms. Reshma M",             email: "reshma.m@licet.ac.in",         role: "PROFESSOR", initials: "RM" },
  { name: "Ms. Shirly Sudhakaran",    email: "shirlysudhakaran@licet.ac.in", role: "PROFESSOR", initials: "SS" },
  { name: "Ms. Limsa Joshi",          email: "limsajoshi@licet.ac.in",       role: "PROFESSOR", initials: "LJ" },
  { name: "Ms. Nirmala Santiago",     email: "iqac@licet.ac.in",             role: "PROFESSOR", initials: "NS" },
]
