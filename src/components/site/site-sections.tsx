import { ExternalLink } from "lucide-react"
import site from "@/data/cse-site.json"
import { Blocks, type Block } from "./blocks"
import { DepartmentPeople } from "./people"
import { SectionNav } from "./section-nav"
import { DepartmentCharter } from "@/components/department-charter"

type Section = { id: string; title: string; url: string; blocks: Block[] }
const sections = (site.sections as Section[])
const byId = (id: string) => sections.find(s => s.id === id)

// Shown in this order after "Vision & Outcomes" and "Faculty & Staff".
const ORDER = ["overview", "infrastructure", "research", "industry", "international", "placements", "students", "alumni", "entrepreneurship", "eicon", "events", "best-practices", "news"]
const NAV_LABEL: Record<string, string> = {
  overview: "About", infrastructure: "Infrastructure", research: "Research", industry: "Industry", international: "International",
  placements: "Placements", students: "Achievements", alumni: "Alumni", entrepreneurship: "Entrepreneurship", eicon: "EICON",
  events: "Events", "best-practices": "Best Practices", news: "News",
}

function SectionShell({ id, title, url, tone = "light", children }: { id: string; title: string; url?: string; tone?: "light" | "paper"; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-16 ${tone === "paper" ? "bg-licet-paper" : "bg-background"} border-b border-border`}>
      <div className="max-w-[1200px] mx-auto px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <p className="eyebrow">Department of CSE</p>
            <h2 className="font-serif italic font-medium text-[36px] sm:text-[44px] leading-tight mt-2">{title}</h2>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-licet-violet hover:text-licet-indigo">
              View on licet.ac.in <ExternalLink size={13} />
            </a>
          )}
        </div>
        {children}
      </div>
    </section>
  )
}

/** EICON: the association's introduction (from the department overview), then its own page minus the repeated department vision / mission. */
function EiconSection({ section }: { section: Section }) {
  const intro = byId("overview")?.blocks.find(b => b.t === "html" && /EICON/.test(b.html))
  const logo = section.blocks.find(b => b.t === "img")
  const blocks: Block[] = []
  for (let i = 0; i < section.blocks.length; i++) {
    const b = section.blocks[i]
    if (b === logo || (b.t === "h" && /^EICON$/i.test(b.text))) continue
    if (b.t === "h" && /^(vision|mission)$/i.test(b.text)) { if (section.blocks[i + 1]?.t === "html") i++; continue }
    blocks.push(b)
  }
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-[220px_1fr] gap-6 items-center rounded-2xl bg-licet-indigo text-white p-6 sm:p-8">
        {logo?.t === "img" && (
          <div className="bg-white rounded-xl p-4 flex items-center justify-center">
            <img src={logo.src} alt="EICON logo" referrerPolicy="no-referrer" className="max-h-36 object-contain" />
          </div>
        )}
        <div>
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-licet-gold">Departmental Association</p>
          <h3 className="font-serif text-[30px] font-semibold !text-white leading-tight mt-1">EICON — Engineers Integrated for Computing Needs</h3>
          {intro?.t === "html" && <div className="site-prose site-prose-dark text-[14.5px] leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: intro.html }} />}
        </div>
      </div>
      <Blocks blocks={blocks} />
    </div>
  )
}

/** Everything from the CSE department pages on licet.ac.in, one section per page. */
export function SiteSections() {
  const obe = byId("obe")
  const faculty = byId("faculty")
  // Faculty page: intro text before "Faculty Accomplishments", the accomplishments after it.
  const accIdx = faculty ? faculty.blocks.findIndex(b => b.t === "h" && /accomplishments/i.test(b.text)) : -1
  const facultyIntro = faculty ? (accIdx > 0 ? faculty.blocks.slice(0, accIdx) : faculty.blocks).filter(b => !(b.t === "h" && /^Faculty & Staff$/i.test(b.text))) : []
  const facultyAcc = faculty && accIdx > 0 ? faculty.blocks.slice(accIdx) : []
  const rest = ORDER.map(byId).filter(Boolean) as Section[]

  const nav = [
    { id: "vision", label: "Vision & Outcomes" },
    { id: "about", label: "About" },
    { id: "people", label: "Faculty & Staff" },
    ...rest.filter(s => s.id !== "overview").map(s => ({ id: s.id, label: NAV_LABEL[s.id] ?? s.title })),
  ]

  return (
    <>
      <SectionNav items={nav} />

      <div id="vision" className="scroll-mt-16">
        <DepartmentCharter />
        {obe && (
          <div className="bg-licet-paper border-b border-border">
            <div className="max-w-[1200px] mx-auto px-4 pb-12 -mt-4">
              <details className="group rounded-xl border border-border bg-white">
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none">
                  <span>
                    <span className="block font-serif text-[20px] font-semibold text-licet-indigo">Outcome Based Education — full statement</span>
                    <span className="block text-[12.5px] text-muted-foreground">Includes the Knowledge and Attitude Profile (WK1–WK9), as published on the department website</span>
                  </span>
                  <span className="text-[12.5px] font-semibold text-licet-violet group-open:hidden">Expand</span>
                  <span className="text-[12.5px] font-semibold text-licet-violet hidden group-open:inline">Collapse</span>
                </summary>
                <div className="px-5 pb-6"><Blocks blocks={obe.blocks.filter(b => !(b.t === "h" && /^Outcome Based Education$/i.test(b.text)))} /></div>
              </details>
            </div>
          </div>
        )}
      </div>

      {byId("overview") && (
        <SectionShell id="about" title="About the Department" url={byId("overview")!.url}>
          <Blocks blocks={byId("overview")!.blocks} />
        </SectionShell>
      )}

      <SectionShell id="people" title="Faculty & Staff" url={faculty?.url} tone="paper">
        {facultyIntro.length > 0 && <div className="mb-8 max-w-4xl"><Blocks blocks={facultyIntro} /></div>}
        <DepartmentPeople />
        {facultyAcc.length > 0 && <div className="mt-10"><Blocks blocks={facultyAcc} /></div>}
      </SectionShell>

      {rest.filter(s => s.id !== "overview").map((s, i) => (
        <SectionShell key={s.id} id={s.id} title={s.title} url={s.url} tone={i % 2 === 0 ? "light" : "paper"}>
          {s.id === "eicon" ? <EiconSection section={s} /> : (
            <Blocks blocks={s.blocks.filter((b, j) => !(j === 0 && b.t === "h" && b.text.toLowerCase().replace(/[^a-z]/g, "") === s.title.toLowerCase().replace(/[^a-z]/g, "")))} />
          )}
        </SectionShell>
      ))}

      <p className="text-center text-[11.5px] text-muted-foreground py-4 bg-background">
        Department content from licet.ac.in · last updated {new Date(site.syncedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
    </>
  )
}
