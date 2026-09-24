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
