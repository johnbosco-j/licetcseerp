"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, RefreshCw, Home, ChevronRight } from "lucide-react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Log to console in dev — don't expose to user
    console.error("[Excelsior Error]", error)
  }, [error])

  // Derive a friendly message from the error type
  const isEditorError = error.message?.includes("Tiptap") || error.message?.includes("SSR")
  const isNetworkError = error.message?.includes("fetch") || error.message?.includes("network")

  const friendly = isEditorError
    ? "The document editor encountered a loading issue."
    : isNetworkError
    ? "A network request failed. Please check your connection."
    : "This module encountered an unexpected issue."

  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      background: "#F9F7F5",
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        background: "#ffffff",
        border: "1px solid #E6DCC3",
        borderRadius: "12px",
        padding: "40px",
        textAlign: "center",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        {/* Icon */}
        <div style={{
          width: "56px", height: "56px", borderRadius: "50%",
          background: "#fef3cd", border: "1px solid #fde68a",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <AlertTriangle size={24} style={{ color: "#d97706" }} />
        </div>

        {/* Heading */}
        <h2 style={{
          fontSize: "18px", fontWeight: 600, color: "#1A0C4E",
          margin: "0 0 8px", letterSpacing: "-0.01em",
        }}>
          Something went wrong
        </h2>

        {/* Friendly description */}
        <p style={{ fontSize: "13px", color: "#6B6480", margin: "0 0 6px", lineHeight: 1.6 }}>
          {friendly}
        </p>
        <p style={{ fontSize: "12px", color: "#8A8298", margin: "0 0 28px" }}>
          If this keeps happening, please contact the IT department.
        </p>

        {/* Error code (non-technical) */}
        {error.digest && (
          <div style={{
            padding: "8px 12px", borderRadius: "6px",
            background: "#F9F7F5", border: "1px solid #F3EEE3",
            marginBottom: "24px",
          }}>
            <span style={{ fontSize: "11px", color: "#8A8298", fontFamily:'inherit' }}>
              Ref: {error.digest}
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={reset} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "7px",
            background: "#1A0C4E", color: "#ffffff",
            border: "none", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "inherit",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#41317E"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "#1A0C4E"}>
            <RefreshCw size={14} /> Try again
          </button>
          <button onClick={() => router.push("/dashboard")} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "7px",
            background: "transparent", color: "#3C3852",
            border: "1px solid #E6DCC3", fontSize: "13px", fontWeight: 500,
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "inherit",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#F9F7F5"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
            <Home size={14} /> Dashboard
          </button>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid #F3EEE3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <img src="/images.png" alt="LICET" style={{ width: "16px", opacity: 0.4 }} />
            <span style={{ fontSize: "11px", color: "#DCD0B4", letterSpacing: "0.06em" }}>
              LICET · EXCELSIOR ERP
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
