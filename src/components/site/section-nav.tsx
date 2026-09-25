"use client"

import { useEffect, useRef, useState } from "react"

/** Sticky, horizontally scrollable menu of the homepage sections; highlights the one in view. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const seen = new Map<string, number>()
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
      const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best && best[1] > 0) setActive(best[0])
    }, { rootMargin: "-120px 0px -45% 0px", threshold: [0, 0.1, 0.3, 0.6] })
    items.forEach(i => { const el = document.getElementById(i.id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [items])

  // Keep the active chip visible in the scrollable bar.
  useEffect(() => {
    const chip = bar.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [active])

  return (
    <nav aria-label="Department sections" className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-border shadow-[0_6px_18px_-14px_rgba(26,12,78,0.5)]">
      <div ref={bar} className="max-w-[1200px] mx-auto px-4 flex gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none]">
        {items.map(i => (
          <a key={i.id} href={`#${i.id}`} data-id={i.id}
            className={`shrink-0 h-8 px-3.5 inline-flex items-center rounded-full text-[12.5px] font-semibold font-nav whitespace-nowrap transition-colors ${active === i.id
              ? "bg-licet-indigo text-white" : "text-licet-indigo hover:bg-licet-cream/70"}`}>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
