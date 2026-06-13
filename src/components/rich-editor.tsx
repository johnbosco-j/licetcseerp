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
