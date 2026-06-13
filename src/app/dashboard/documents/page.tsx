"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { FolderOpen, Plus, X, FileText, Download, ExternalLink, Loader2 } from "lucide-react"
import { FileUpload, FileList, type UploadedFile } from "@/components/file-upload"

type Profile = Database['public']['Tables']['profiles']['Row']

interface Document {
  id: string
  category: string
  title: string
  description: string
  url: string
  file_type: string
  uploaded_by: string
  created_at: string
  section: string
  isStorageFile?: boolean
  storagePath?: string
  bucket?: string
  size?: number
}

const CATEGORIES = [
  'Syllabus', 'Academic Calendar', 'Course File',
  'Minutes of Meeting', 'Lab Manual', 'Question Papers',
  'Assignment', 'Study Material', 'Circular', 'Other'
]

const CAT_ICONS: Record<string, string> = {
  'Syllabus': '📘', 'Academic Calendar': '📅', 'Course File': '📁',
  'Minutes of Meeting': '📝', 'Lab Manual': '🔬', 'Question Papers': '📄',
  'Assignment': '✏️', 'Study Material': '📚', 'Circular': '📢', 'Other': '📎'
}

export default function DocumentsPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState('ALL')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [form, setForm] = useState({
    category: 'Syllabus', title: '', description: '',
    url: '', section: 'ALL'
  })

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const canUpload = isHOD || isFaculty

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadDocuments = async () => {
    const { data } = await supabase.from('announcements').select('*')
      .like('audience', 'DOCUMENT:%')
      .order('created_at', { ascending: false })

    if (!data) return
    const parsed: Document[] = data.map(a => {
      try {
        const body = JSON.parse(a.body)
        return { id: a.id, ...body, uploaded_by: a.created_by, created_at: a.created_at }
      } catch { return null }
    }).filter(Boolean)
    setDocuments(parsed)
  }

  useEffect(() => { loadDocuments() }, [])

  const uploadDocument = async () => {
    if (!profile || !form.title || !form.url) return
    setSaving(true)
    await supabase.from('announcements').insert({
      title: `DOC: ${form.title}`,
      body: JSON.stringify({ ...form, file_type: form.url.split('.').pop()?.toUpperCase() ?? 'LINK' }),
      audience: `DOCUMENT:${form.category}`,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    setSaving(false)
    setForm({ category: 'Syllabus', title: '', description: '', url: '', section: 'ALL' })
    setShowForm(false)
    loadDocuments()
  }

  const filtered = filter === 'ALL' ? documents : documents.filter(d => d.category === filter)

  const grouped = filtered.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = []
    acc[doc.category].push(doc)
    return acc
  }, {} as Record<string, Document[]>)


  const handleStorageUpload = async (file: UploadedFile) => {
    if (!profile) return
    const title = 'DOC: ' + file.name
    const fileType = file.name.split('.').pop()?.toUpperCase() ?? 'FILE'
    const body = JSON.stringify({
      ...form,
      url: file.path,
      file_type: fileType,
      isStorageFile: true,
      storagePath: file.path,
      bucket: file.bucket,
      size: file.size
    })
    const audience = 'DOCUMENT:' + form.category
    await supabase.from('announcements').insert({
      title,
      body,
      audience,
      is_urgent: false,
      created_by: profile.id,
      department_id: '00000000-0000-0000-0000-000000000001'
    })
    loadDocuments()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: DOCUMENTS</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Document Repository</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Syllabus, course files, academic calendar, MOM and study materials
          </p>
        </div>
        {canUpload && (
          <div className="flex gap-2">
            <button onClick={() => { setShowUpload(!showUpload); setShowForm(false) }}
              className="flex items-center gap-2 px-4 py-2 bg-accent font-mono text-xs rounded border border-border hover:bg-accent/80">
              <FileText className="w-3 h-3" /> Upload File
            </button>
            <button onClick={() => { setShowForm(!showForm); setShowUpload(false) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> Add Link
            </button>
          </div>
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('ALL')}
          className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${filter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
          ALL ({documents.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = documents.filter(d => d.category === cat).length
          if (count === 0) return null
          return (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${filter === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {CAT_ICONS[cat]} {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Direct file upload */}
      {showUpload && canUpload && (
        <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-primary">// UPLOAD DOCUMENT</span>
            <button onClick={() => setShowUpload(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">For Section</label>
              <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                <option value="ALL">All Sections</option>
                {['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <FileUpload
            bucket="dept-documents"
            folder={form.category.toLowerCase().replace(/\s+/g,'-')}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
            maxSizeMB={50}
            multiple={true}
            label="Upload Document (PDF, Word, Excel, Images)"
            onUpload={handleStorageUpload}
          />
          <FileList files={uploadedFiles} canDelete={true} onDelete={f => setUploadedFiles(prev => prev.filter(x => x.id !== f.id))} />
        </div>
      )}

      {/* Upload form */}
      {showForm && canUpload && (
        <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-primary">// ADD DOCUMENT</span>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Document title"
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="font-mono text-xs text-muted-foreground">URL / Google Drive Link *</label>
              <input value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                placeholder="https://drive.google.com/... or direct URL"
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">For Section</label>
              <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none">
                <option value="ALL">All Sections</option>
                {['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-muted-foreground">Description</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Brief description"
                className="w-full h-10 px-3 bg-background border border-border rounded font-mono text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          <button onClick={uploadDocument} disabled={saving || !form.title || !form.url}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            {saving ? 'Adding...' : 'Add Document'}
          </button>
        </div>
      )}

      {/* Documents by category */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground">No documents yet</p>
          {canUpload && <p className="font-mono text-xs text-muted-foreground mt-1">Click "Add Document" to upload</p>}
        </div>
      ) : Object.entries(grouped).map(([cat, docs]) => (
        <div key={cat} className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border">
            <span className="font-mono text-xs text-primary">// {cat.toUpperCase()}</span>
            <h2 className="font-bold text-sm mt-1">{CAT_ICONS[cat]} {cat} ({docs.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 px-6 py-4 hover:bg-accent/30 transition-colors">
                <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {doc.description && <p className="font-mono text-xs text-muted-foreground truncate">{doc.description}</p>}
                    {doc.section !== 'ALL' && <span className="font-mono text-xs text-muted-foreground">{doc.section}</span>}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                {doc.isStorageFile ? (
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from(doc.bucket ?? "dept-documents").createSignedUrl(doc.storagePath ?? "", 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary font-mono text-xs rounded border border-primary/20 hover:bg-primary/20 transition-colors flex-shrink-0">
                    <ExternalLink className="w-3 h-3" /> View
                  </button>
                ) : (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary font-mono text-xs rounded border border-primary/20 hover:bg-primary/20 transition-colors flex-shrink-0">
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
