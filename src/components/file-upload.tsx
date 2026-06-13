"use client"

import { useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Upload, X, FileText, Loader2, Eye, Download, Trash2 } from "lucide-react"

export interface UploadedFile {
  id:         string
  name:       string
  path:       string
  bucket:     string
  size:       number
  type:       string
  uploadedAt: string
}

interface FileUploadProps {
  bucket:      'question-papers' | 'naac-documents' | 'dept-documents'
  folder?:     string
  accept?:     string
  maxSizeMB?:  number
  onUpload:    (file: UploadedFile) => void
  label?:      string
  multiple?:   boolean
}

export function FileUpload({
  bucket, folder = '', accept = '.pdf,.doc,.docx',
  maxSizeMB = 50, onUpload, label = 'Upload File', multiple = false
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [progress, setProgress]   = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList) => {
    setError('')
    for (const file of Array.from(files)) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File too large — max ${maxSizeMB}MB`); return
      }
      setUploading(true)
      setProgress(10)

      const ext      = file.name.split('.').pop()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path     = folder ? `${folder}/${Date.now()}_${safeName}` : `${Date.now()}_${safeName}`

      const { data, error: upErr } = await supabase.storage
        .from(bucket).upload(path, file, { upsert: false })

      setProgress(90)

      if (upErr) {
        setError(upErr.message); setUploading(false); setProgress(0); return
      }

      const uploaded: UploadedFile = {
        id: data.id ?? path, name: file.name, path: data.path ?? path,
        bucket, size: file.size, type: file.type,
        uploadedAt: new Date().toISOString()
      }
      onUpload(uploaded)
      setProgress(100)
      setTimeout(() => setProgress(0), 1000)
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const formatSize = (bytes: number) =>
    bytes > 1024*1024 ? `${(bytes/1024/1024).toFixed(1)} MB` : `${Math.round(bytes/1024)} KB`

  return (
    <div className="space-y-2">
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer
          ${uploading ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}`}>
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <p className="font-mono text-xs text-primary">Uploading... {progress}%</p>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="font-mono text-sm text-muted-foreground">{label}</p>
            <p className="font-mono text-xs text-muted-foreground">
              Drag & drop or click · {accept.replace(/\./g,'').toUpperCase().replace(/,/g,' ')} · Max {maxSizeMB}MB
            </p>
          </div>
        )}
      </div>
      {error && <p className="font-mono text-xs text-red-500">{error}</p>}
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={e => { if (e.target.files?.length) upload(e.target.files) }} />
    </div>
  )
}

interface FileViewerProps {
  files:    UploadedFile[]
  onDelete?: (file: UploadedFile) => void
  canDelete?: boolean
}

export function FileList({ files, onDelete, canDelete = false }: FileViewerProps) {
  const [viewing, setViewing]   = useState<string | null>(null)
  const [viewUrl, setViewUrl]   = useState<string>('')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const getUrl = async (file: UploadedFile) => {
    setLoadingId(file.id)
    const { data } = await supabase.storage.from(file.bucket).createSignedUrl(file.path, 3600)
    setLoadingId(null)
    if (data?.signedUrl) return data.signedUrl
    return null
  }

  const viewFile = async (file: UploadedFile) => {
    const url = await getUrl(file)
    if (url) { setViewUrl(url); setViewing(file.id) }
  }

  const downloadFile = async (file: UploadedFile) => {
    const url = await getUrl(file)
    if (url) { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click() }
  }

  const formatSize = (bytes: number) =>
    bytes > 1024*1024 ? `${(bytes/1024/1024).toFixed(1)} MB` : `${Math.round(bytes/1024)} KB`

  if (!files.length) return null

  return (
    <>
      <div className="space-y-2">
        {files.map(file => (
          <div key={file.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:border-primary/30 transition-all">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-medium truncate">{file.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {loadingId === file.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {file.type === 'application/pdf' && (
                    <button onClick={() => viewFile(file)}
                      className="flex items-center gap-1 px-2 py-1.5 font-mono text-xs bg-primary/10 text-primary rounded border border-primary/20 hover:bg-primary/20 transition-colors">
                      <Eye className="w-3 h-3" /> View
                    </button>
                  )}
                  <button onClick={() => downloadFile(file)}
                    className="flex items-center gap-1 px-2 py-1.5 font-mono text-xs bg-accent rounded border border-border hover:bg-accent/80 transition-colors">
                    <Download className="w-3 h-3" /> Download
                  </button>
                  {canDelete && onDelete && (
                    <button onClick={() => onDelete(file)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PDF Viewer Modal */}
      {viewing && viewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
            <span className="font-mono text-sm font-bold">Document Viewer</span>
            <button onClick={() => { setViewing(null); setViewUrl('') }}
              className="p-2 hover:bg-accent rounded transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={`${viewUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title="Document Viewer"
            />
          </div>
        </div>
      )}
    </>
  )
}
