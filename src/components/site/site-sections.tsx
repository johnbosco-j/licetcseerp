"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Medal, Atom, BookOpenText } from "lucide-react"
import site from "@/data/cse-site.json"
import { Blocks, Lightbox, type Block } from "./blocks"
import { FacultyDirectory } from "./people"

// The CSE department pages of licet.ac.in, laid out like the website: "About Us" menu on the
// left, the chosen page on the right (one page at a time, kept in the address as #page).
type Section = { id: string; title: string; url: string; blocks: Block[] }
const sections = site.sections as Section[]
const byId = (id: string) => sections.find(s => s.id === id)

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "obe", label: "Outcome Based Education" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "faculty", label: "Faculty" },
  { id: "students", label: "Students" },
  { id: "eicon", label: "EICON" },
  { id: "alumni", label: "Alumni" },
  { id: "industry", label: "Industry Interaction" },
  { id: "research", label: "Research & Consultancy" },
  { id: "placements", label: "Placements" },
  { id: "entrepreneurship", label: "Entrepreneurship" },
  { id: "events", label: "Events Organized" },
  { id: "best-practices", label: "Best Practices" },
  { id: "news", label: "News & Events" },
  { id: "international", label: "International collaborations and Conferences" },
].filter(p => byId(p.id))
// Links that older versions of this page used
const OLD_ANCHORS: Record<string, string> = { about: "overview", vision: "obe", people: "faculty" }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")

/** "Department Highlights" → "Department <i>Highlights</i>", as the website sets its band titles. */
function BandTitle({ text, light = false, className = "" }: { text: string; light?: boolean; className?: string }) {
  const words = text.split(" ")
  const last = words.pop()
  return (
    <h2 className={`text-[40px] sm:text-[50px] leading-tight ${light ? "!text-white" : ""} ${className}`}>
      {words.join(" ")}{words.length ? " " : ""}<i>{last}</i>
    </h2>
  )
}

function Photos({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <div className={`grid gap-3 ${images.length === 1 ? "" : "grid-cols-2"}`}>
        {images.slice(0, 4).map((src, i) => (
          <button key={src} onClick={() => setOpen(i)} aria-label="Open photo" className="overflow-hidden rounded-[4px] bg-licet-parchment">
            <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={`w-full object-cover hover:scale-105 transition-transform duration-500 ${images.length === 1 ? "max-h-[320px]" : "aspect-[3/2]"}`} />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} index={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Testimonial cards, three at a time, with arrows and dots. */
function Testimonials({ images }: { images: string[] }) {
  const [start, setStart] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const n = images.length
  const shown = [0, 1, 2].slice(0, Math.min(3, n)).map(k => (start + k) % n)
  return (
    <div className="relative px-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {shown.map((i, k) => (
          <button key={images[i]} onClick={() => setOpen(i)} aria-label="Open testimonial" className={`overflow-hidden ${k > 0 ? "hidden sm:block" : ""} ${k === 1 ? "sm:scale-105" : "sm:opacity-80"} transition`}>
            <img src={images[i]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full aspect-[16/10] object-cover" />
          </button>
        ))}
      </div>
      {n > 1 && <>
        <button onClick={() => setStart((start - 1 + n) % n)} aria-label="Previous" className="absolute left-0 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"><ChevronLeft /></button>
        <button onClick={() => setStart((start + 1) % n)} aria-label="Next" className="absolute right-0 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"><ChevronRight /></button>
        <div className="flex justify-center gap-2 mt-4">
          {images.map((_, i) => <button key={i} onClick={() => setStart(i)} aria-label={`Testimonial ${i + 1}`} className={`w-1.5 h-1.5 rounded-full ${i === start ? "bg-white" : "bg-white/40"}`} />)}
        </div>
      </>}
      {open !== null && <Lightbox images={images} index={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

const STAT_ICONS = [Medal, Atom, BookOpenText]

/** The bands under the Overview: highlights, alumni voices, figures, video and MoUs. */
function OverviewBands({ blocks }: { blocks: Block[] }) {
  const at = (re: RegExp) => blocks.findIndex(b => b.t === "h" && re.test(b.text))
  const hi = at(/department highlights/i), av = at(/alumni voices/i), mou = at(/^mou/i)
  const highlights = hi >= 0 ? blocks.slice(hi + 1, av >= 0 ? av : undefined) : []
  const after = av >= 0 ? blocks.slice(av + 1, mou >= 0 ? mou : undefined) : []
  const testimonials = after.find((b): b is Extract<Block, { t: "gallery" }> => b.t === "gallery")
  const stats = after.find((b): b is Extract<Block, { t: "stats" }> => b.t === "stats")
  const video = after.find((b): b is Extract<Block, { t: "video" }> => b.t === "video")
  const mous = mou >= 0 ? blocks.slice(mou + 1).find((b): b is Extract<Block, { t: "gallery" }> => b.t === "gallery") : undefined
  const videoId = video?.url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]

  // Highlights come in pairs of photos and text; the website alternates their sides.
  const rows: Block[][] = []
  const spare: string[] = []
  for (let i = 0; i < highlights.length; i++) {
    const a = highlights[i], b = highlights[i + 1]
    if (b && (a.t === "gallery") !== (b.t === "gallery") && (a.t === "html" || b.t === "html")) { rows.push([a, b]); i++ }
    else if (a.t === "gallery") spare.push(...a.images)
    else rows.push([a])
  }

  return (
    <>
      {rows.length > 0 && (
        <section className="bg-licet-indigo">
          <div className="max-w-[1140px] mx-auto bg-[#FBFAFC] px-5 sm:px-8 py-10 sm:py-14">
            <BandTitle text="Department Highlights" />
            <div className="w-24 h-px bg-licet-gold mt-5" />
            <div className="mt-6 space-y-12 sm:space-y-16">
              {rows.map((row, i) => (
                <div key={i} className={`grid ${row.length === 2 ? "md:grid-cols-2" : ""} gap-6 md:gap-10 items-center`}>
                  {row.map((b, j) => b.t === "gallery"
                    ? <Photos key={j} images={b.images} />
                    : b.t === "html" ? <div key={j} className="site-prose !text-[14.5px] !text-[#1A0C4E]" dangerouslySetInnerHTML={{ __html: b.html }} /> : null)}
                </div>
              ))}
              {spare.length > 0 && <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">{spare.map(src => <Photos key={src} images={[src]} />)}</div>}
            </div>
          </div>
        </section>
      )}

      {testimonials && (
        <section className="bg-licet-indigo text-white">
          <div className="max-w-[1140px] mx-auto px-5 py-12 sm:py-16 grid md:grid-cols-[260px_1fr] gap-8 items-center">
            <div className="text-center">
              <BandTitle text="Alumni Voices" light className="!text-[40px] sm:!text-[46px] !leading-[1.05]" />
              <p className="text-[10px] font-semibold tracking-[3px] uppercase mt-4">Testimonials</p>
              <div className="w-20 h-px bg-white/70 mx-auto mt-5" />
            </div>
            <Testimonials images={testimonials.images} />
          </div>
        </section>
      )}

      {stats && (
        <section className="bg-white border-y border-[#e9e6ef]">
          <div className="max-w-[1140px] mx-auto grid sm:grid-cols-3">
            {stats.items.map((s, i) => {
              const Icon = STAT_ICONS[i % STAT_ICONS.length]
              return (
                <div key={s.label} className={`py-12 text-center ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-[#e9e6ef]" : ""}`}>
                  <Icon className="w-12 h-12 mx-auto text-licet-indigo" strokeWidth={1} />
                  <p className="text-[50px] font-light text-licet-indigo leading-none mt-8">{s.value}</p>
                  <p className="text-[10.5px] font-semibold tracking-[2.5px] uppercase text-licet-indigo mt-4">{s.label}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {videoId && (
        <section className="bg-licet-indigo text-white">
          <div className="max-w-[1140px] mx-auto px-5 py-12 grid md:grid-cols-2 gap-10 items-center">
            <div className="relative aspect-video bg-black">
              <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`} title="Department video" loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 w-full h-full border-0" />
            </div>
            <div className="text-center">
              <BandTitle text="Now Playing" light className="!text-[40px] sm:!text-[46px]" />
              <p className="text-[10px] font-semibold tracking-[3px] uppercase mt-4">Computer Science and Engineering</p>
              <div className="w-20 h-px bg-white/70 mx-auto mt-5" />
            </div>
          </div>
        </section>
      )}

      {mous && (
        <section className="bg-licet-cream">
          <div className="max-w-[1140px] mx-auto px-5 py-10">
            <h2 className="text-center text-[38px] sm:text-[44px]">MoU&rsquo;s</h2>
            <div className="w-full max-w-[420px] h-px bg-licet-indigo mx-auto mt-1" />
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 items-center">
              {mous.images.map(src => <img key={src} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full max-h-[150px] object-contain" />)}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

export function SiteSections() {
  const [page, setPage] = useState("overview")

  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(location.hash.slice(1))
      const id = OLD_ANCHORS[h] ?? h
      if (PAGES.some(p => p.id === id)) setPage(id)
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  const open = (id: string) => {
    setPage(id)
    history.replaceState(null, "", id === "overview" ? location.pathname : `#${id}`)
    document.getElementById("department")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const section = byId(page)!
  const label = PAGES.find(p => p.id === page)!.label
  let blocks = section.blocks
  let title = page === "faculty" ? "Faculty & Staff" : label
  // A page that opens with its own title uses it as the heading
  if (blocks[0]?.t === "h" && [norm(label), norm(section.title)].includes(norm(blocks[0].text))) { title = blocks[0].text; blocks = blocks.slice(1) }
  let bands: Block[] = []
  if (page === "overview") {
    const hi = blocks.findIndex(b => b.t === "h" && /department highlights/i.test(b.text))
    if (hi >= 0) { bands = blocks.slice(hi); blocks = blocks.slice(0, hi) }
  }
  if (page === "faculty") blocks = blocks.filter(b => !(b.t === "h" && /^faculty & staff$/i.test(b.text)))

  return (
    <>
      <section id="department" className="scroll-mt-4 max-w-[1140px] w-full mx-auto px-4 py-10 lg:py-16 grid lg:grid-cols-[240px_1fr] gap-8 lg:gap-14">
        <aside>
          <h2 className="!font-[family-name:var(--font-dmsans)] text-[20px] sm:text-[22px] !font-semibold tracking-[2px] uppercase">About Us</h2>
          <div className="h-px bg-licet-cream mt-5 mb-4" />
          {/* Phones: a menu that opens; wider screens: the full list */}
          <details className="lg:hidden border border-licet-cream rounded">
            <summary className="lx-menu px-4 py-3 text-[15px] text-licet-indigo cursor-pointer">{label}</summary>
            <ul className="pb-2">{PAGES.map(p => <li key={p.id}><button onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; open(p.id) }} className={`lx-menu w-full text-left px-4 py-2 text-[14.5px] ${p.id === page ? "text-licet-gold" : "text-licet-indigo"}`}>{p.label}</button></li>)}</ul>
          </details>
          <ul className="hidden lg:block space-y-[18px] pl-6">
            {PAGES.map(p => (
              <li key={p.id}>
                <button onClick={() => open(p.id)} aria-current={p.id === page ? "page" : undefined}
                  className={`lx-menu text-left text-[15px] leading-snug transition-colors ${p.id === page ? "text-licet-gold" : "text-licet-indigo hover:text-licet-gold"}`}>{p.label}</button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0">
          <h2 className="text-[40px] sm:text-[50px] leading-tight">{title}</h2>
          <div className="h-px bg-licet-cream mt-3 mb-8" />
          <Blocks blocks={blocks} />
        </div>
      </section>

      {page === "overview" && <OverviewBands blocks={bands} />}
      {page === "faculty" && <FacultyDirectory />}

      <p className="text-center text-[11.5px] text-muted-foreground py-5">
        Department content from{" "}
        <a href={section.url} target="_blank" rel="noopener noreferrer" className="underline decoration-licet-gold underline-offset-2">licet.ac.in</a>
        {" "}· last updated {new Date(site.syncedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
    </>
  )
}
