const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Stored document HTML is rendered in a same-origin window, so block every
// script (including inline event handlers) with a CSP set before the content.
export function printHtml(title: string, css: string, bodyHtml: string) {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.write(`<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
  return true
}
