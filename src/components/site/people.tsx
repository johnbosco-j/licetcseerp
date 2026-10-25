import { UserRound } from "lucide-react"
import people from "@/data/cse-people.json"

// HOD, faculty and staff of the department, synced from the faculty page on
// licet.ac.in (npm run sync:site) and laid out like it: one row per person, photo and
// profile on alternating sides. Photos are stored in /public/cse/people.

type Person = { name: string; designation?: string; role?: string; email?: string; otherEmails?: string[]; bio?: string; photo: string | null }

const GROUPS = ["Professor", "Associate Professor", "Assistant Professor"]

function Portrait({ p, className = "" }: { p: Person; className?: string }) {
  return p.photo
    ? <img src={p.photo} alt={p.name} loading="lazy" className={`object-cover object-top bg-licet-cream rounded-[6px] ${className}`} />
    : <span className={`flex items-center justify-center bg-licet-cream text-licet-indigo/60 rounded-[6px] ${className}`}><UserRound className="w-1/3 h-1/3" /></span>
}

function GroupTitle({ text }: { text: string }) {
  return (
    <div className="text-center pt-14 pb-2">
      <h2 className="text-[36px] sm:text-[42px] leading-tight">{text}</h2>
      <div className="w-24 h-px bg-licet-gold mx-auto mt-4" />
    </div>
  )
}

function PersonRow({ p, flip, kicker }: { p: Person; flip: boolean; kicker?: string }) {
  const emails = [p.email, ...(p.otherEmails ?? [])].filter(Boolean).join(", ")
  return (
    <article className={`grid gap-6 md:gap-12 items-center py-10 ${flip ? "md:grid-cols-[1fr_300px]" : "md:grid-cols-[300px_1fr]"}`}>
      <Portrait p={p} className={`w-full max-w-[300px] aspect-[4/3] mx-auto ${flip ? "md:order-2" : ""}`} />
      <div className="min-w-0">
        {kicker && <p className="text-[11px] font-semibold tracking-[2.5px] uppercase text-licet-indigo mb-2">{kicker}</p>}
        <h3 className="text-[34px] sm:text-[40px] leading-tight">{p.name}</h3>
        {emails && <p className="text-[13px] mt-3 break-words">{emails}</p>}
        <div className="w-20 h-px bg-licet-gold mt-4 mb-5" />
        {p.bio && <div className="site-prose !text-[14px]">{p.bio.split(/\n{2,}/).filter(t => !/^\S+@\S+$/.test(t.trim())).map((t, i) => <p key={i}>{t}</p>)}</div>}
      </div>
    </article>
  )
}

/** Head of the Department, faculty by designation, then non-teaching staff. */
export function FacultyDirectory() {
  const hod = people.hod as Person
  const faculty = people.faculty as Person[]
  const staff = people.staff as Person[]
  let row = 0

  return (
    <div className="pb-6">
      <section className="bg-licet-paper">
        <div className="max-w-[1140px] mx-auto px-4">
          <PersonRow p={hod} flip kicker={`Head of the Department · ${hod.designation}`} />
        </div>
      </section>

      {GROUPS.map(g => {
        const list = faculty.filter(f => f.designation === g)
        if (!list.length) return null
        return (
          <section key={g} className="max-w-[1140px] mx-auto px-4">
            <GroupTitle text={list.length > 1 ? `${g}s` : g} />
            <div className="divide-y divide-[#eee8da]">
              {list.map(f => <PersonRow key={f.email ?? f.name} p={f} flip={row++ % 2 === 1} />)}
            </div>
          </section>
        )
      })}

      {staff.length > 0 && (
        <section className="max-w-[1140px] mx-auto px-4">
          <GroupTitle text="Non-Teaching Staff" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mt-8">
            {staff.map(s => (
              <div key={s.name} className="text-center">
                <Portrait p={s} className="w-full aspect-[4/5]" />
                <h3 className="text-[22px] leading-tight mt-3">{s.name}</h3>
                <p className="text-[10.5px] font-semibold tracking-[2px] uppercase text-licet-indigo mt-1">{s.role}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
