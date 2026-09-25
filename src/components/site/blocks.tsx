"use client"

import { useEffect, useState } from "react"
import { ChevronDown, PlayCircle, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"

// Content blocks synced from licet.ac.in by scripts/sync-cse-site.mjs. The HTML in
// "html" / toggle blocks is rebuilt at sync time from a strict allow-list (text
// escaped, only http(s) links), so it is safe to render.
export type Block =
  | { t: "h"; text: string }
  | { t: "html"; html: string }
  | { t: "img"; src: string; alt?: string; caption?: string }
  | { t: "gallery"; images: string[]; variant?: "logos" }
  | { t: "cards"; items: { img: string; title: string; html: string }[] }
  | { t: "toggle"; items: { title: string; html: string }[] }
  | { t: "stats"; items: { value: string; label: string }[] }
  | { t: "video"; url: string }
  | { t: "posts"; items: { title: string; href: string | null; img: string; date: string; excerpt: string }[] }

const PROSE = "site-prose text-[14.5px] leading-relaxed text-[#3c3852]"

function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") setI(x => (x + 1) % images.length)
      if (e.key === "ArrowLeft") setI(x => (x - 1 + images.length) % images.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [images.length, onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-[80] bg-[#0d0628]/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <img src={images[i]} alt="" referrerPolicy="no-referrer" className="max-h-[86vh] max-w-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"><X size={20} /></button>
      {images.length > 1 && <>
        <button onClick={e => { e.stopPropagation(); setI((i - 1 + images.length) % images.length) }} aria-label="Previous photo" className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"><ChevronLeft /></button>
        <button onClick={e => { e.stopPropagation(); setI((i + 1) % images.length) }} aria-label="Next photo" className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"><ChevronRight /></button>
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-white/70">{i + 1} / {images.length}</p>
      </>}
    </div>
  )
}

function Gallery({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const LIMIT = 8
  const shown = all ? images : images.slice(0, LIMIT)
  const single = images.length === 1
  return (
    <div>
      <div className={single ? "" : `grid gap-2.5 ${images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
        {shown.map((src, i) => (
          <button key={src} onClick={() => setOpen(i)} className={`group relative overflow-hidden rounded-lg bg-licet-parchment ${single ? "w-full max-h-[460px]" : "aspect-[4/3]"}`} aria-label="Open photo">
            <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"
              className={`w-full h-full ${single ? "object-contain max-h-[460px]" : "object-cover object-[50%_30%]"} transition-transform duration-500 group-hover:scale-105`} />
          </button>
        ))}
      </div>
      {images.length > LIMIT && (
        <button onClick={() => setAll(a => !a)} className="mt-3 text-[13px] font-semibold text-licet-violet hover:text-licet-indigo underline decoration-licet-gold decoration-2 underline-offset-4">
          {all ? "Show fewer photos" : `Show all ${images.length} photos`}
        </button>
      )}
      {open !== null && <Lightbox images={images} index={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Partner / recruiter logos: uniform white tiles, logos scaled to fit. */
function Logos({ images }: { images: string[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {images.map(src => (
        <div key={src} className="h-24 rounded-xl border border-border bg-white flex items-center justify-center p-2 hover:border-licet-gold transition-colors">
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
        </div>
      ))}
    </div>
  )
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/** People, labs and achievements: each photo stays with its own text. */
function Cards({ items }: { items: { img: string; title: string; html: string }[] }) {
  const avg = items.reduce((a, c) => a + plain(c.html).length, 0) / items.length
  if (avg > 260) {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {items.map(c => (
          <article key={c.img + c.title} className="flex flex-col sm:flex-row gap-4 bg-white border border-border rounded-xl p-4 hover:border-licet-gold transition-colors">
            <img src={c.img} alt={c.title} loading="lazy" referrerPolicy="no-referrer"
              className="w-full sm:w-44 h-44 rounded-lg object-cover object-top bg-licet-parchment shrink-0" />
            <div className="min-w-0">
              {c.title && <h4 className="font-serif text-[19px] font-semibold text-licet-indigo leading-snug mb-1.5">{c.title}</h4>}
              <div className="site-prose text-[13.5px] leading-relaxed text-[#3c3852]" dangerouslySetInnerHTML={{ __html: c.html }} />
            </div>
          </article>
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map(c => (
        <article key={c.img + c.title} className="bg-white border border-border rounded-xl overflow-hidden hover:border-licet-gold hover:shadow-md transition">
          <img src={c.img} alt={c.title || plain(c.html).slice(0, 60)} loading="lazy" referrerPolicy="no-referrer"
            className="w-full aspect-square object-cover object-top bg-licet-parchment" />
          <div className="p-3.5 text-center">
            {c.title && <h4 className="font-serif text-[17px] font-semibold text-licet-indigo leading-snug">{c.title}</h4>}
            <div className="site-prose site-prose-card text-[13px] leading-snug text-[#3c3852]" dangerouslySetInnerHTML={{ __html: c.html }} />
          </div>
        </article>
      ))}
    </div>
  )
}

function Toggle({ items }: { items: { title: string; html: string }[] }) {
  return (
    <div className="divide-y divide-border border border-border rounded-xl bg-white overflow-hidden">
      {items.map(it => (
        <details key={it.title} className="group">
          <summary className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer list-none hover:bg-licet-cream/40">
            <span className="font-serif text-[18px] font-semibold text-licet-indigo">{it.title}</span>
            <ChevronDown size={18} className="text-licet-violet shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className={`px-5 pb-5 ${PROSE}`} dangerouslySetInnerHTML={{ __html: it.html }} />
        </details>
      ))}
    </div>
  )
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return <h3 key={i} className="font-serif text-[24px] sm:text-[27px] font-semibold text-licet-indigo pt-3 first:pt-0 leading-tight">{b.text}</h3>
          case "html":
            return <div key={i} className={PROSE} dangerouslySetInnerHTML={{ __html: b.html }} />
          case "img":
            return (
              <figure key={i} className="max-w-[640px]">
                <img src={b.src} alt={b.alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-xl border border-border bg-licet-parchment" />
                {b.caption && <figcaption className="text-[12.5px] text-muted-foreground mt-1.5">{b.caption}</figcaption>}
              </figure>
            )
          case "gallery":
            return b.variant === "logos" ? <Logos key={i} images={b.images} /> : <Gallery key={i} images={b.images} />
          case "cards":
            return <Cards key={i} items={b.items} />
          case "toggle":
            return <Toggle key={i} items={b.items} />
          case "stats":
            return (
              <div key={i} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {b.items.map(s => (
                  <div key={s.label + s.value} className="rounded-xl bg-licet-indigo text-white p-5 border-b-[3px] border-licet-gold">
                    <p className="font-serif text-[38px] font-semibold leading-none text-[#F8D88D]">{s.value}</p>
                    <p className="text-[12px] font-semibold tracking-[1.5px] uppercase text-licet-cream/85 mt-2">{s.label}</p>
                  </div>
                ))}
              </div>
            )
          case "video":
            return (
              <a key={i} href={b.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-xl border border-border bg-white px-5 py-3.5 hover:border-licet-gold hover:bg-licet-cream/40">
                <PlayCircle className="w-7 h-7 text-licet-violet" />
                <span><span className="block text-[14px] font-semibold text-licet-indigo">Watch the video</span><span className="block text-[12px] text-muted-foreground">Opens on YouTube</span></span>
              </a>
            )
          case "posts":
            return (
              <div key={i} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {b.items.map(p => (
                  <a key={p.title} href={p.href ?? "#"} target="_blank" rel="noopener noreferrer"
                    className="group bg-white border border-border rounded-xl overflow-hidden hover:border-licet-gold hover:shadow-md transition">
                    {p.img && <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full aspect-video object-cover" />}
                    <div className="p-4">
                      {p.date && <p className="text-[11px] font-semibold tracking-wider uppercase text-licet-violet">{p.date}</p>}
                      <p className="font-serif text-[18px] font-semibold text-licet-indigo leading-snug mt-1 group-hover:underline">{p.title}</p>
                      {p.excerpt && <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-3">{p.excerpt}</p>}
                      <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-licet-violet mt-2">Read on licet.ac.in <ExternalLink size={12} /></p>
                    </div>
                  </a>
                ))}
              </div>
            )
        }
      })}
    </div>
  )
}
