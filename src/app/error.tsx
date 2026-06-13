"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error("[Excelsior Global Error]", error) }, [error])

  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f8fa" }}>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: "40px 24px",
        }}>
          <div style={{
            maxWidth: "440px", width: "100%",
            background: "#ffffff", border: "1px solid #e5e7eb",
            borderRadius: "12px", padding: "40px", textAlign: "center",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              width: "52px", height: "52px", borderRadius: "50%",
              background: "#fef3cd", border: "1px solid #fde68a",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: "22px",
            }}>⚠</div>
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>
              Application error
            </h2>
            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 24px", lineHeight: 1.6 }}>
              Excelsior ERP encountered an unexpected error. Please refresh the page or contact the IT department if the problem persists.
            </p>
            <button onClick={reset} style={{
              padding: "9px 24px", borderRadius: "7px",
              background: "#1d3557", color: "#ffffff",
              border: "none", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Refresh page
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
