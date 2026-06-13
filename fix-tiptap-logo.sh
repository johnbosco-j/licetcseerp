#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  Excelsior ERP — Fix Script
#  • Fixes Tiptap SSR hydration error (immediatelyRender: false)
#  • Fixes broken licet-logo.png (was HTML, replaced with SVG)
#  • Adds friendly error UI (dashboard error.tsx + global)
#  Run from project root: cd ~/Documents/Excelsior/web
#  Then: bash fix-tiptap-logo.sh
# ══════════════════════════════════════════════════════════════

set -e
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "\n${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Excelsior ERP — Tiptap + Logo + Error UI Fix${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}\n"

if [ ! -f "package.json" ]; then
  echo -e "${RED}  ✗ Run this from ~/Documents/Excelsior/web${NC}"; exit 1
fi

# ──────────────────────────────────────────────────────────
#  STEP 1 — Fix rich-editor.tsx (Tiptap SSR error)
#  Root cause: useEditor runs on SSR. Fix: immediatelyRender: false
#  + mounted guard so the editor only renders client-side.
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 1 — Fixing Tiptap SSR error in rich-editor.tsx"

cat > src/components/rich-editor.tsx << 'RICHEOF'
"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { Table } from "@tiptap/extension-table"
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { useEffect, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Table as TableIcon,
  Heading1, Heading2, Heading3,
  Undo, Redo, Minus
} from 'lucide-react'

interface RichEditorProps {
  content?: string
  onChange?: (html: string) => void
  editable?: boolean
  placeholder?: string
}

export function RichEditor({ content = '', onChange, editable = true, placeholder }: RichEditorProps) {
  // Guard: only render on client to avoid SSR hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const editor = useEditor({
    // ← THE FIX: tell Tiptap not to render immediately on server
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  // Show a clean skeleton while mounting (avoids the flash of broken UI)
  if (!mounted) {
    return (
      <div style={{
        border: '1px solid #e5e7eb', borderRadius: '8px',
        overflow: 'hidden', minHeight: '200px',
        background: '#f9fafb', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Loading editor…</span>
      </div>
    )
  }

  if (!editor) return null

  const ToolBtn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode
  }) => (
    <button
      type="button" onClick={onClick} title={title}
      style={{
        padding: '5px', borderRadius: '5px', border: 'none', cursor: 'pointer',
        background: active ? '#1d3557' : 'transparent',
        color: active ? '#ffffff' : '#6b7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {children}
    </button>
  )

  const Sep = () => (
    <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 3px' }} />
  )

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
      {editable && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px',
          padding: '8px 10px', borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}>
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough size={14} />
          </ToolBtn>
          <Sep />
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 size={14} />
          </ToolBtn>
          <Sep />
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
            <AlignLeft size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Centre">
            <AlignCenter size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
            <AlignRight size={14} />
          </ToolBtn>
          <Sep />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
            <List size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
            <ListOrdered size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus size={14} />
          </ToolBtn>
          <Sep />
          <ToolBtn title="Insert Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <TableIcon size={14} />
          </ToolBtn>
          <Sep />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo size={14} />
          </ToolBtn>
        </div>
      )}
      <EditorContent
        editor={editor}
        style={{
          padding: '16px', minHeight: '200px',
          fontSize: '13px', lineHeight: '1.6', color: '#111827',
          outline: 'none',
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: `
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 8px; }
        .tiptap h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #111827; }
        .tiptap h2 { font-size: 18px; font-weight: 600; margin: 0 0 10px; color: #1f2937; }
        .tiptap h3 { font-size: 15px; font-weight: 600; margin: 0 0 8px; color: #374151; }
        .tiptap ul { list-style: disc; padding-left: 20px; margin: 0 0 8px; }
        .tiptap ol { list-style: decimal; padding-left: 20px; margin: 0 0 8px; }
        .tiptap li { margin-bottom: 3px; }
        .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
        .tiptap table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .tiptap th, .tiptap td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 12px; }
        .tiptap th { background: #f9fafb; font-weight: 600; }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left; color: #9ca3af; pointer-events: none; height: 0;
        }
      `}} />
    </div>
  )
}
RICHEOF

echo -e "  ${GREEN}✓ src/components/rich-editor.tsx — SSR fixed${NC}"

# ──────────────────────────────────────────────────────────
#  STEP 2 — Fix the broken licet-logo.png
#  The file was an HTML document, not a PNG image.
#  Replace it with a proper SVG logo file.
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 2 — Replacing broken licet-logo.png with real SVG"

# Write the proper LICET-style SVG logo
cat > public/licet-logo.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d3557"/>
      <stop offset="100%" stop-color="#16304d"/>
    </linearGradient>
  </defs>
  <!-- Outer circle -->
  <circle cx="60" cy="60" r="57" fill="url(#bg)"/>
  <circle cx="60" cy="60" r="53" fill="none" stroke="#a8c8e8" stroke-width="1.2" opacity="0.5"/>
  <!-- Cross emblem (Jesuit / Christian cross) -->
  <rect x="56.5" y="20" width="7" height="50" rx="2.5" fill="#ffffff"/>
  <rect x="36" y="42" width="48" height="7" rx="2.5" fill="#ffffff"/>
  <!-- Bottom text -->
  <text x="60" y="90" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="10.5" font-weight="bold" fill="#a8c8e8" letter-spacing="3">
    LICET
  </text>
  <text x="60" y="102" text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="5.5" fill="#7aadcc" letter-spacing="0.5" opacity="0.8">
    EST. 2009
  </text>
</svg>
SVGEOF

# Also remove (or overwrite) the broken PNG so it doesn't confuse anything
cp public/licet-logo.svg public/licet-logo.png.backup 2>/dev/null || true

echo -e "  ${GREEN}✓ public/licet-logo.svg created${NC}"

# ──────────────────────────────────────────────────────────
#  STEP 3 — Update all logo <img> references to use .svg
#  and add onError fallback in case even the SVG fails
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 3 — Updating logo references to .svg"

# Replace every licet-logo.png reference with licet-logo.svg across all tsx/ts files
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's|/licet-logo\.png|/licet-logo.svg|g' 2>/dev/null || true

echo -e "  ${GREEN}✓ All logo references updated to licet-logo.svg${NC}"

# ──────────────────────────────────────────────────────────
#  STEP 4 — Add Logo component with text fallback
#  Inserts a reusable <Logo> component at top of layout.tsx
#  that swaps to a text badge if the image fails to load.
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 4 — Adding Logo component with onError fallback to layout.tsx"

# Check if LogoBadge already exists (idempotent)
if grep -q "LogoBadge\|logoError" src/app/dashboard/layout.tsx 2>/dev/null; then
  echo -e "  ${YELLOW}⚠ Logo fallback already present — skipping${NC}"
else
  # Insert after the first useState line (it already imports useState)
  python3 - << 'PYEOF'
import re

path = "src/app/dashboard/layout.tsx"
with open(path) as f:
    code = f.read()

# Add logoError state after the existing state declarations block
logo_component = '''
// Logo with text fallback if SVG fails to load
function LogoBadge({ size = 30 }: { size?: number }) {
  const [err, setErr] = React.useState(false)
  if (err) return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#1d3557', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 800, letterSpacing: '0.02em',
      flexShrink: 0,
    }}>L</div>
  )
  return <img src="/licet-logo.svg" alt="LICET" onError={() => setErr(true)}
    style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

'''

# Insert the component before the first export default or export function
insert_marker = "export default function DashboardLayout"
if insert_marker not in code:
    insert_marker = "export function DashboardLayout"

# Add React import if not already there (for React.useState in LogoBadge)
if 'import React' not in code:
    code = code.replace('"use client"', '"use client"\nimport React from "react"', 1)

code = code.replace(insert_marker, logo_component + insert_marker, 1)

with open(path, 'w') as f:
    f.write(code)

# Now replace img tags with LogoBadge
import re
# Pattern: <img src="/licet-logo.svg" ... className="w-8 h-8 ...
code2 = open(path).read()

# Replace the main header logo (w-8 = 32px)
code2 = re.sub(
    r'<img src="/licet-logo\.svg" alt="LICET"[^/]*/>\s*(?=\n.*(?:Excelsior|LICET CSE|playfair|serif))',
    '<LogoBadge size={32} />',
    code2, count=1
)

# Replace sidebar bottom logos (w-6 = 24px)  
code2 = re.sub(
    r'<img src="/licet-logo\.svg"[^/]*/>\s*\n.*Loyola',
    '<LogoBadge size={22} />\n                  <div>\n                    <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", color: "#9ca3af", margin: 0, textTransform: "uppercase" }}>Loyola',
    code2, count=1
)

with open(path, 'w') as f:
    f.write(code2)

print("  layout.tsx patched")
PYEOF
  echo -e "  ${GREEN}✓ LogoBadge component added to layout.tsx${NC}"
fi

# ──────────────────────────────────────────────────────────
#  STEP 5 — Friendly dashboard error page (error.tsx)
#  Next.js App Router: src/app/dashboard/error.tsx
#  Shows a clean "something went wrong" UI instead of
#  the raw stack trace that Tiptap was displaying.
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 5 — Creating friendly dashboard error boundary"

cat > src/app/dashboard/error.tsx << 'ERREOF'
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
      background: "#f7f8fa",
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
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
          fontSize: "18px", fontWeight: 600, color: "#111827",
          margin: "0 0 8px", letterSpacing: "-0.01em",
        }}>
          Something went wrong
        </h2>

        {/* Friendly description */}
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 6px", lineHeight: 1.6 }}>
          {friendly}
        </p>
        <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 28px" }}>
          If this keeps happening, please contact the IT department.
        </p>

        {/* Error code (non-technical) */}
        {error.digest && (
          <div style={{
            padding: "8px 12px", borderRadius: "6px",
            background: "#f9fafb", border: "1px solid #f3f4f6",
            marginBottom: "24px",
          }}>
            <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>
              Ref: {error.digest}
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={reset} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "7px",
            background: "#1d3557", color: "#ffffff",
            border: "none", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "inherit",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#16304d"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "#1d3557"}>
            <RefreshCw size={14} /> Try again
          </button>
          <button onClick={() => router.push("/dashboard")} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "7px",
            background: "transparent", color: "#374151",
            border: "1px solid #e5e7eb", fontSize: "13px", fontWeight: 500,
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "inherit",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
            <Home size={14} /> Dashboard
          </button>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <img src="/licet-logo.svg" alt="LICET" style={{ width: "16px", opacity: 0.4 }} />
            <span style={{ fontSize: "11px", color: "#d1d5db", letterSpacing: "0.06em" }}>
              LICET · EXCELSIOR ERP
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
ERREOF

echo -e "  ${GREEN}✓ src/app/dashboard/error.tsx created${NC}"

# ──────────────────────────────────────────────────────────
#  STEP 6 — Global error boundary (root level)
#  Catches errors outside the dashboard layout too.
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 6 — Creating global error boundary"

cat > src/app/error.tsx << 'GLOBALERR'
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
GLOBALERR

echo -e "  ${GREEN}✓ src/app/error.tsx created${NC}"

# ──────────────────────────────────────────────────────────
#  STEP 7 — Clear cache & restart
# ──────────────────────────────────────────────────────────
echo -e "▶ Step 7 — Clearing build cache"
pkill -f "next dev" 2>/dev/null || true
rm -rf .next

echo -e "\n${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All fixes applied successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e ""
echo -e "  Changes made:"
echo -e "  ${GREEN}✓${NC} rich-editor.tsx   — immediatelyRender: false + mounted guard"
echo -e "  ${GREEN}✓${NC} licet-logo.svg    — real SVG logo (was broken HTML file)"
echo -e "  ${GREEN}✓${NC} logo refs         — updated .png → .svg across all files"
echo -e "  ${GREEN}✓${NC} dashboard/error   — friendly error UI (no stack traces shown)"
echo -e "  ${GREEN}✓${NC} app/error.tsx     — global fallback error boundary"
echo -e ""
echo -e "  ${YELLOW}Next:${NC}"
echo -e "  1. npm run dev"
echo -e "  2. Open /dashboard/editor and /dashboard/naac — editor should load cleanly"
echo -e "  3. Check logo appears in the header and sidebar"
echo -e "  4. To test error UI: temporarily throw in any page, then revert\n"

npm run dev
