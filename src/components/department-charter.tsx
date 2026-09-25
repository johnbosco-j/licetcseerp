"use client"

import { useState } from "react"
import { Compass, Target, ListChecks, Sparkles } from "lucide-react"
import {
  DEPARTMENT_VISION, DEPARTMENT_MISSION, INSTITUTION_VISION, PEOS, POS, PSOS,
} from "@/lib/obe"

const TABS = [
  { id: "vm", label: "Vision & Mission", icon: Compass },
  { id: "peo", label: "Educational Objectives", icon: Target },
  { id: "po", label: "Programme Outcomes", icon: ListChecks },
  { id: "pso", label: "Specific Outcomes", icon: Sparkles },
] as const
type TabId = typeof TABS[number]["id"]

// Keeps the curriculum's knowledge-profile references ("(WK5)") but sets them quietly.
function withRefs(text: string) {
  const parts = text.split(/(\((?:WK[^)]*)\))/g)
  return parts.map((p, i) => /^\(WK/.test(p)
    ? <span key={i} className="text-[11.5px] font-semibold tracking-wide text-licet-violet/70 whitespace-nowrap">{p}</span>
    : <span key={i}>{p}</span>)
}

function Code({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center justify-center h-8 min-w-[52px] px-2.5 rounded-md bg-licet-indigo text-licet-gold font-brand text-[13px] tracking-[0.12em] shrink-0">
      {children}
    </span>
  )
}

/** Department vision, mission, PEOs, POs and PSOs (B.E. CSE, R2024) for the public landing page. */
export function DepartmentCharter() {
  const [tab, setTab] = useState<TabId>("vm")

  return (
    <section className="relative overflow-hidden bg-licet-paper border-y border-border" aria-labelledby="charter-title">
      <img src="/images.png" alt="" aria-hidden className="pointer-events-none absolute -left-24 top-10 w-80 h-80 rounded-full opacity-[0.04]" />
      <div className="relative max-w-[1200px] mx-auto px-4 py-16">
        <div className="text-center">
          <p className="text-[12px] font-semibold tracking-[3px] uppercase text-licet-violet">Department of Computer Science &amp; Engineering</p>
          <h2 id="charter-title" className="font-serif italic font-medium text-[38px] sm:text-[48px] leading-tight mt-2">Vision, Mission &amp; Outcomes</h2>
          <p className="text-[13px] text-muted-foreground mt-1">B.E. Computer Science and Engineering · Regulations 2024</p>
          <div className="h-[2px] w-16 bg-licet-gold mx-auto mt-4" />
        </div>

        <div role="tablist" aria-label="Department statements" className="mt-9 flex flex-wrap justify-center gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 h-10 px-4 rounded-full border text-[13px] font-semibold transition-colors ${tab === id
                ? "bg-licet-indigo text-white border-licet-indigo shadow-[0_8px_20px_-12px_rgba(26,12,78,0.8)]"
                : "bg-white text-licet-indigo border-border hover:border-licet-gold hover:bg-licet-cream/50"}`}>
              <Icon size={15} className={tab === id ? "text-licet-gold" : "text-licet-violet"} />{label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-8" key={tab} style={{ animation: "licet-fade 0.35s ease-out both" }}>
          {tab === "vm" && (
            <div className="grid lg:grid-cols-[1.05fr_1fr] gap-6">
              <div className="relative bg-licet-indigo text-white rounded-2xl p-8 sm:p-10 overflow-hidden">
                <span aria-hidden className="absolute -top-6 left-6 font-serif text-[160px] leading-none text-licet-gold/15 select-none">&ldquo;</span>
                <p className="relative text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Vision of the Department</p>
                <p className="relative font-serif italic text-[25px] sm:text-[29px] leading-snug mt-4 text-white">{DEPARTMENT_VISION}</p>
                <div className="relative mt-8 pt-6 border-t border-white/15">
                  <p className="text-[10.5px] font-bold tracking-[2.5px] uppercase text-licet-gold/80">Vision of the Institution</p>
                  <p className="font-serif italic text-[18px] mt-2 text-licet-cream/90">{INSTITUTION_VISION}</p>
                </div>
              </div>
              <div className="bg-white border border-border rounded-2xl p-6 sm:p-8">
                <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-violet">Mission of the Department</p>
                <ol className="mt-5 space-y-4">
                  {DEPARTMENT_MISSION.map(m => (
                    <li key={m.code} className="flex gap-4 items-start">
                      <Code>{m.code}</Code>
                      <p className="text-[14.5px] leading-relaxed text-licet-indigo pt-1">{m.text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {tab === "peo" && (
            <div className="grid sm:grid-cols-2 gap-5">
              {PEOS.map(p => (
                <div key={p.code} className="group bg-white border border-border border-t-[3px] border-t-licet-gold rounded-2xl p-6 hover:shadow-lg hover:shadow-licet-indigo/10 transition-shadow">
                  <Code>{p.code}</Code>
                  <p className="font-serif text-[21px] leading-snug mt-4 text-licet-indigo">{p.text}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "po" && (
            <div className="grid md:grid-cols-2 gap-4">
              {POS.map(p => (
                <div key={p.code} className="flex gap-4 items-start bg-white border border-border rounded-xl p-5 hover:border-licet-gold transition-colors">
                  <Code>{p.code}</Code>
                  <div className="min-w-0">
                    <p className="font-serif text-[19px] font-semibold leading-tight text-licet-indigo">{p.title}</p>
                    <p className="text-[13.5px] leading-relaxed text-muted-foreground mt-1.5">{withRefs(p.text)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "pso" && (
            <div className="grid md:grid-cols-3 gap-5">
              {PSOS.map(p => (
                <div key={p.code} className="relative bg-licet-indigo text-white rounded-2xl p-7 overflow-hidden">
                  <span aria-hidden className="absolute -right-6 -bottom-8 font-brand text-[110px] leading-none text-white/[0.05] select-none">{p.code.slice(-1)}</span>
                  <span className="inline-flex items-center h-8 px-3 rounded-md bg-licet-gold text-licet-indigo font-brand text-[13px] tracking-[0.12em]">{p.code}</span>
                  <p className="relative font-serif text-[21px] leading-snug mt-5 text-white">{p.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[11.5px] text-muted-foreground mt-8">
          Source: Curriculum and Syllabi (R-2024), B.E. Computer Science and Engineering, Loyola-ICAM College of Engineering and Technology (Autonomous)
        </p>
      </div>
    </section>
  )
}
