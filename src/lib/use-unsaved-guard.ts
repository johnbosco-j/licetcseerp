"use client"

import { useEffect, useRef, useState } from "react"

// Unsaved-changes guard for editing screens. Typing into a field of the wrapped area marks
// it unsaved; any successful save (toast.success / reportResult) marks it saved. While
// unsaved, closing the tab, reloading or following a link inside the app asks first.
// Search and filter boxes do not count as edits (type="search" or data-filter).

const isFilter = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return true
  if (el.closest('[data-filter]')) return true
  if (el instanceof HTMLInputElement && (el.type === 'search' || el.type === 'file' || /^(search|filter|find)/i.test(el.placeholder))) return true
  return !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
}

export function useUnsavedGuard() {
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    const clear = () => setDirty(false)
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
    // app links (Next.js <Link>) do not fire beforeunload: catch the click first
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
      const a = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.href.startsWith('javascript:')) return
      if (!window.confirm('You have changes that are not saved. Leave this page anyway?')) { e.preventDefault(); e.stopPropagation() }
      else setDirty(false)
    }
    window.addEventListener('licet:saved', clear)
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('licet:saved', clear)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  /** Spread on the element that wraps the editing area. */
  const bind = {
    onInputCapture: (e: React.FormEvent) => { if (!isFilter(e.target)) setDirty(true) },
    onChangeCapture: (e: React.FormEvent) => { if (!isFilter(e.target) && e.target instanceof HTMLSelectElement) setDirty(true) },
  }
  /** Ask before an in-page switch (e.g. another tab) while unsaved; true = go ahead. */
  const confirmLeave = () => {
    if (!dirtyRef.current) return true
    const ok = window.confirm('You have changes that are not saved. Continue anyway?')
    if (ok) { dirtyRef.current = false; setDirty(false) }
    return ok
  }
  return { dirty, bind, confirmLeave, markSaved: () => setDirty(false) }
}
