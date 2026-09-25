"use client"

import { useState } from "react"

// Official LICET wordmark as served on licet.ac.in (light artwork for dark backgrounds).
export const LICET_WORDMARK = "https://licet.ac.in/wp-content/uploads/2021/02/licet-e1617087721530.png"

export function LicetLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={`flex items-center gap-2 ${className}`}>
        <img src="/images.png" alt="LICET" className="h-full w-auto aspect-square rounded-full bg-white p-0.5" />
        <span className="font-serif text-2xl font-bold tracking-wide text-white">LICET</span>
      </span>
    )
  }
  return (
    <img src={LICET_WORDMARK} alt="LICET — Loyola-ICAM College of Engineering and Technology"
      className={className} onError={() => setFailed(true)} referrerPolicy="no-referrer" />
  )
}

export const APP_NAME = "LICET Things"

/**
 * "LICET Things" wordmark: LICET in Marcellus Roman capitals, Things in gold
 * Cormorant italic. `size` sets the cap height; everything else scales with it.
 */
export function Wordmark({ size = 22, tone = "light", className = "" }: { size?: number | string; tone?: "light" | "dark"; className?: string }) {
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap leading-none ${className}`} style={{ fontSize: size }} aria-label={APP_NAME}>
      <span aria-hidden className={`font-brand tracking-[0.2em] ${tone === "light" ? "text-white" : "text-licet-indigo"}`}>LICET</span>
      <span aria-hidden className="mx-[0.28em] self-center w-[0.22em] h-[0.22em] rotate-45 bg-licet-gold" />
      <span aria-hidden className={`font-serif italic font-semibold text-[1.28em] tracking-[0.01em] bg-clip-text text-transparent ${tone === "light"
        ? "bg-gradient-to-r from-[#F8D88D] via-licet-gold to-[#F8D88D]"
        : "bg-gradient-to-r from-licet-violet via-licet-indigo to-licet-violet"}`}>Things</span>
    </span>
  )
}
