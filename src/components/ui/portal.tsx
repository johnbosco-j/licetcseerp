"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

// Dialogs are drawn at the end of <body> through this portal. A "fixed inset-0" overlay inside
// the page would otherwise be framed by any animated or blurred ancestor and sit in the middle
// of a long page instead of the screen. While a dialog is open the page behind does not scroll,
// and Escape acts like a click on the backdrop of the topmost dialog (so it closes exactly when
// clicking outside would).

const open: HTMLElement[] = []
let locked: { body: string; scroller: string } | null = null

function lockScroll() {
  if (locked) return
  const scroller = document.getElementById("scroll-container")
  locked = { body: document.body.style.overflow, scroller: scroller?.style.overflow ?? "" }
  document.body.style.overflow = "hidden"
  if (scroller) scroller.style.overflow = "hidden"
}
function unlockScroll() {
  if (!locked || open.length) return
  document.body.style.overflow = locked.body
  const scroller = document.getElementById("scroll-container")
  if (scroller) scroller.style.overflow = locked.scroller
  locked = null
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || !open.length) return
  const overlay = open[open.length - 1].firstElementChild as HTMLElement | null
  if (overlay) { e.preventDefault(); overlay.click() }
}

export function Portal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setHost(document.body) }, [])

  useEffect(() => {
    const el = ref.current
    if (!host || !el) return
    open.push(el)
    lockScroll()
    if (open.length === 1) window.addEventListener("keydown", onKey)
    return () => {
      open.splice(open.indexOf(el), 1)
      if (!open.length) window.removeEventListener("keydown", onKey)
      unlockScroll()
    }
  }, [host])

  return host ? createPortal(<div ref={ref} className="contents">{children}</div>, host) : null
}
