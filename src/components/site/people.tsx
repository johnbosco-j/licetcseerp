"use client"

import { useEffect, useState } from "react"
import { Mail, X, UserRound, GraduationCap, Wrench, ExternalLink } from "lucide-react"
import people from "@/data/cse-people.json"

// HOD, faculty and staff of the department, synced from the faculty page on
// licet.ac.in (npm run sync:site). Photos are stored in /public/cse/people.

type Person = { name: string; designation?: string; role?: string; email?: string; otherEmails?: string[]; bio?: string; photo: string | null }

const ORDER = ["Professor", "Associate Professor", "Assistant Professor"]

function Portrait({ p, className = "" }: { p: Person; className?: string }) {
  return p.photo
    ? <img src={p.photo} alt={p.name} loading="lazy" className={`object-cover object-top bg-licet-cream ${className}`} />
    : <span className={`flex items-center justify-center bg-licet-cream text-licet-indigo/60 ${className}`}><UserRound className="w-1/3 h-1/3" /></span>
}

function BioDialog({ p, onClose }: { p: Person; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[80] bg-licet-indigo/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={p.name} onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border-t-[3px] border-licet-gold">
        <div className="flex flex-col sm:flex-row gap-5 p-6">
          <Portrait p={p} className="w-32 h-32 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[2px] uppercase text-licet-violet">{p.role ?? p.designation}</p>
            <h3 className="font-serif text-[28px] font-semibold text-licet-indigo leading-tight mt-1">{p.name}</h3>
            {p.role && p.designation && <p className="text-[13px] text-muted-foreground">{p.designation}</p>}
            {p.email && (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-[13px] text-licet-violet hover:underline mt-2"><Mail size={13} />{p.email}</a>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="self-start p-1.5 rounded-md hover:bg-muted"><X size={18} /></button>
        </div>
        {p.bio && <div className="px-6 pb-6 text-[14.5px] leading-relaxed text-[#3c3852] whitespace-pre-line">{p.bio}</div>}
      </div>
    </div>
  )
}

/**
 * The department's people. `compact` is for dashboards (smaller cards); the
 * public homepage uses the full layout.
 */
export function DepartmentPeople({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<Person | null>(null)
  const hod = people.hod as Person
  const faculty = [...(people.faculty as Person[])].sort((a, b) => ORDER.indexOf(a.designation ?? "") - ORDER.indexOf(b.designation ?? ""))
  const staff = people.staff as Person[]

  return (
    <div className="space-y-8">
      {/* Head of the Department */}
      <div className={`relative overflow-hidden rounded-2xl bg-licet-indigo text-white ${compact ? "p-5" : "p-6 sm:p-8"}`}>
        <img src="/images.png" alt="" aria-hidden className="pointer-events-none absolute -right-12 -bottom-16 w-64 h-64 rounded-full opacity-[0.06]" />
        <div className="relative flex flex-col sm:flex-row gap-6 items-start">
          <Portrait p={hod} className={`${compact ? "w-28 h-28" : "w-36 h-36 sm:w-44 sm:h-44"} rounded-2xl ring-4 ring-licet-gold/70 shrink-0`} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Head of the Department</p>
            <h3 className={`font-serif font-semibold !text-white leading-tight mt-1 ${compact ? "text-[26px]" : "text-[32px]"}`}>{hod.name}</h3>
            <p className="text-[13.5px] text-licet-cream/80">{hod.designation} · Department of Computer Science &amp; Engineering</p>
            {hod.email && <a href={`mailto:${hod.email}`} className="inline-flex items-center gap-1.5 text-[13px] text-[#F8D88D] hover:underline mt-2"><Mail size={13} />{hod.email}</a>}
            <p className={`text-[14px] leading-relaxed text-licet-cream/90 mt-3 max-w-3xl ${compact ? "line-clamp-3" : ""}`}>{hod.bio}</p>
            {compact && <button onClick={() => setOpen(hod)} className="text-[12.5px] font-semibold text-[#F8D88D] hover:underline mt-2">Read full profile</button>}
          </div>
        </div>
      </div>

      {/* Faculty */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <GraduationCap className="w-5 h-5 text-licet-violet" />
          <h3 className="font-serif text-[24px] font-semibold text-licet-indigo">Faculty</h3>
          <span className="text-[12px] text-muted-foreground">{faculty.length} members</span>
        </div>
        <div className={`grid gap-4 ${compact ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
          {faculty.map(f => (
            <button key={f.email ?? f.name} onClick={() => setOpen(f)}
              className="group text-left bg-white border border-border rounded-xl overflow-hidden hover:border-licet-gold hover:shadow-lg hover:shadow-licet-indigo/10 hover:-translate-y-0.5 transition-all">
              <Portrait p={f} className="w-full aspect-square" />
              <div className={compact ? "p-3" : "p-4"}>
                <p className={`font-serif font-semibold text-licet-indigo leading-tight ${compact ? "text-[16px]" : "text-[18px]"}`}>{f.name}</p>
                <p className="text-[11px] font-semibold tracking-wider uppercase text-licet-violet mt-1">{f.designation}</p>
                {f.email && <p className="text-[11.5px] text-muted-foreground truncate mt-1">{f.email}</p>}
                <p className="text-[11.5px] font-semibold text-licet-violet mt-2 opacity-0 group-hover:opacity-100 transition-opacity">View profile →</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Non-teaching staff */}
      {staff.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Wrench className="w-5 h-5 text-licet-violet" />
            <h3 className="font-serif text-[24px] font-semibold text-licet-indigo">Non-Teaching Staff</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {staff.map(s => (
              <div key={s.name} className="bg-white border border-border rounded-xl overflow-hidden">
                <Portrait p={s} className="w-full aspect-[4/5]" />
                <div className="p-3.5">
                  <p className="font-serif text-[17px] font-semibold text-licet-indigo leading-tight">{s.name}</p>
                  <p className="text-[11px] font-semibold tracking-wider uppercase text-licet-violet mt-1">{s.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-muted-foreground">
        Profiles from the department page on licet.ac.in ·{" "}
        <a href={people.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-licet-violet hover:underline">view source <ExternalLink size={11} /></a>
      </p>

      {open && <BioDialog p={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
