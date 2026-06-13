"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { RichEditor } from "@/components/rich-editor"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { Save, Download, FileText, Plus, X, Loader2, ChevronDown } from "lucide-react"

type Profile = Database['public']['Tables']['profiles']['Row']

interface Doc {
  id: string
  title: string
  category: string
  content: string
  created_by: string
  created_at: string
  section: string
}

const TEMPLATES: Record<string, { title: string; content: string }> = {
  mom: {
    title: 'Minutes of Meeting',
    content: `<h1>Minutes of Meeting</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>Venue:</strong> HOD Room / CSE Department</p>
<p><strong>Chaired by:</strong> Dr. Sharmila V J, HoD – CSE</p>
<hr/>
<h2>Attendees</h2>
<table><tr><th>S.No</th><th>Name</th><th>Designation</th><th>Signature</th></tr>
<tr><td>1</td><td></td><td></td><td></td></tr>
<tr><td>2</td><td></td><td></td><td></td></tr>
</table>
<h2>Agenda</h2>
<ol><li></li><li></li></ol>
<h2>Discussion & Decisions</h2>
<p></p>
<h2>Action Items</h2>
<table><tr><th>S.No</th><th>Action Item</th><th>Responsible</th><th>Target Date</th></tr>
<tr><td>1</td><td></td><td></td><td></td></tr>
</table>
<h2>Next Meeting</h2>
<p><strong>Date:</strong> &nbsp;&nbsp;<strong>Venue:</strong></p>
<br/><p>_________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_________________________</p>
<p>HoD – CSE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Faculty Representative</p>`
  },
  question_paper: {
    title: 'Question Paper',
    content: `<h1 style="text-align:center">LOYOLA-ICAM COLLEGE OF ENGINEERING AND TECHNOLOGY</h1>
<p style="text-align:center"><strong>Department of Computer Science and Engineering</strong></p>
<p style="text-align:center">B.E. CSE – R2024 | Even Semester 2025-2026</p>
<hr/>
<table><tr><th>Course Code</th><th>Course Title</th><th>Date</th><th>Time</th><th>Max Marks</th></tr>
<tr><td></td><td></td><td></td><td>3 Hours</td><td>100</td></tr></table>
<p><strong>Instructions:</strong> Answer ALL questions. All questions carry equal marks.</p>
<hr/>
<h2>PART A – (10 × 2 = 20 Marks)</h2>
<ol>
<li><p></p></li>
<li><p></p></li>
<li><p></p></li>
<li><p></p></li>
<li><p></p></li>
</ol>
<h2>PART B – (5 × 13 = 65 Marks)</h2>
<ol start="6">
<li><p>(a) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(13)</p><p>(OR)</p><p>(b) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(13)</p></li>
</ol>
<h2>PART C – (1 × 15 = 15 Marks)</h2>
<ol start="11">
<li><p>(a) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(15)</p><p>(OR)</p><p>(b) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(15)</p></li>
</ol>`
  },
  naac: {
    title: 'NAAC Criterion Document',
    content: `<h1>NAAC Self Study Report – Criterion 1</h1>
<p><strong>Institution:</strong> Loyola-ICAM College of Engineering and Technology (LICET)</p>
<p><strong>Department:</strong> Computer Science and Engineering</p>
<p><strong>Academic Year:</strong> 2025-2026</p>
<hr/>
<h2>1.1 Curriculum Design and Development</h2>
<h3>1.1.1 Programmes offered by HEI</h3>
<table>
<tr><th>Programme</th><th>Level</th><th>Intake</th><th>Duration</th><th>Regulation</th></tr>
<tr><td>B.E. Computer Science and Engineering</td><td>UG</td><td>120</td><td>4 Years</td><td>R2024</td></tr>
</table>
<h3>1.1.2 Focus on employability, entrepreneurship and skill development</h3>
<p></p>
<h2>1.2 Academic Flexibility</h2>
<h3>1.2.1 New courses/programmes introduced</h3>
<table>
<tr><th>Course Code</th><th>Course Title</th><th>Year of Introduction</th><th>No. of Students Enrolled</th></tr>
<tr><td></td><td></td><td></td><td></td></tr>
</table>
<h2>1.3 Curriculum Enrichment</h2>
<p></p>
<h2>1.4 Feedback System</h2>
<p></p>`
  },
  nba: {
    title: 'NBA SAR Document',
    content: `<h1>NBA Self Assessment Report</h1>
<p><strong>Programme:</strong> B.E. Computer Science and Engineering</p>
<p><strong>Institution:</strong> LICET, Chennai – 600 034</p>
<p><strong>Academic Year:</strong> 2025-2026</p>
<hr/>
<h2>Criterion 1: Vision, Mission and Programme Educational Objectives</h2>
<h3>1.1 Vision of the Department</h3>
<p>To form competent computing engineers who are motivated towards innovation and collaborative research, to serve the ever changing needs of the society.</p>
<h3>1.2 Mission of the Department</h3>
<ol>
<li>To inculcate learnability skills in the student to acquire knowledge in the fundamentals of Computer Science and Engineering.</li>
<li>To bring out the creativeness in the mind of the student leading to innovation and research.</li>
<li>To develop professional skills and adaptiveness through collaborative activities.</li>
<li>To create awareness on ethical values and involve the student to serve the societal needs.</li>
</ol>
<h3>1.3 Programme Educational Objectives (PEOs)</h3>
<table>
<tr><th>PEO</th><th>Statement</th></tr>
<tr><td>PEO1</td><td>Graduates will have successful careers in computer engineering fields.</td></tr>
<tr><td>PEO2</td><td>Graduates will be able to pursue higher education in reputed institutions.</td></tr>
<tr><td>PEO3</td><td>Graduates will adapt to rapidly changing work environment.</td></tr>
<tr><td>PEO4</td><td>Graduates will engage in lifelong learning and prioritize ethical values.</td></tr>
</table>
<h2>Criterion 2: Programme Outcomes</h2>
<h3>2.1 Programme Outcomes (POs)</h3>
<table>
<tr><th>PO</th><th>Statement</th><th>Level of Attainment</th></tr>
<tr><td>PO1</td><td>Engineering knowledge</td><td></td></tr>
<tr><td>PO2</td><td>Problem analysis</td><td></td></tr>
<tr><td>PO3</td><td>Design/Development of Solutions</td><td></td></tr>
<tr><td>PO4</td><td>Conduct investigations</td><td></td></tr>
<tr><td>PO5</td><td>Modern tool usage</td><td></td></tr>
<tr><td>PO6</td><td>The engineer and society</td><td></td></tr>
<tr><td>PO7</td><td>Environment and sustainability</td><td></td></tr>
<tr><td>PO8</td><td>Ethics</td><td></td></tr>
<tr><td>PO9</td><td>Individual and team work</td><td></td></tr>
<tr><td>PO10</td><td>Communication</td><td></td></tr>
<tr><td>PO11</td><td>Project management and finance</td><td></td></tr>
<tr><td>PO12</td><td>Life-long learning</td><td></td></tr>
</table>
<h2>Criterion 3: Course Outcomes and Attainment</h2>
<p></p>`
  },
  course_file: {
    title: 'Course File',
    content: `<h1>Course File</h1>
<p><strong>Course Code:</strong> &nbsp;&nbsp;<strong>Course Title:</strong></p>
<p><strong>Faculty:</strong> &nbsp;&nbsp;<strong>Section:</strong> &nbsp;&nbsp;<strong>Semester:</strong></p>
<p><strong>Academic Year:</strong> 2025-2026</p>
<hr/>
<h2>1. Syllabus</h2>
<p></p>
<h2>2. Lesson Plan</h2>
<table>
<tr><th>Unit</th><th>Topic</th><th>No. of Hours</th><th>Date</th><th>Reference</th></tr>
<tr><td>I</td><td></td><td></td><td></td><td></td></tr>
</table>
<h2>3. Internal Assessment Details</h2>
<table>
<tr><th>Assessment</th><th>Date</th><th>Portions</th><th>Max Marks</th><th>Avg Marks</th></tr>
<tr><td>CIA 1 – CT</td><td></td><td></td><td>30</td><td></td></tr>
<tr><td>CIA 1 – CAT</td><td></td><td></td><td>60</td><td></td></tr>
<tr><td>CIA 2 – CT</td><td></td><td></td><td>30</td><td></td></tr>
<tr><td>CIA 2 – CAT</td><td></td><td></td><td>60</td><td></td></tr>
</table>
<h2>4. CO Attainment</h2>
<table>
<tr><th>CO</th><th>Statement</th><th>CIA Attainment</th><th>SEE Attainment</th><th>Overall</th></tr>
<tr><td>CO1</td><td></td><td></td><td></td><td></td></tr>
</table>
<h2>5. Student Feedback Summary</h2>
<p></p>`
  }
}

export default function EditorPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [docs, setDocs]         = useState<Doc[]>([])
  const [current, setCurrent]   = useState<Doc | null>(null)
  const [content, setContent]   = useState('')
  const [title, setTitle]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [showNew, setShowNew]   = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff'
  const canEdit   = isHOD || isFaculty

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  const loadDocs = async () => {
    const { data } = await supabase.from('announcements').select('*')
      .like('audience', 'EDITOR:%')
      .order('created_at', { ascending: false })
    if (!data) return
    const parsed: Doc[] = data.map(a => {
      try {
        const body = JSON.parse(a.body)
        return { id: a.id, title: a.title.replace('EDITOR: ',''), ...body, created_by: a.created_by, created_at: a.created_at }
      } catch { return null }
    }).filter(Boolean)
    setDocs(parsed)
  }

  useEffect(() => { if (profile) loadDocs() }, [profile])

  const newDoc = (templateKey?: string) => {
    const tmpl = templateKey ? TEMPLATES[templateKey] : null
    const newTitle = tmpl ? tmpl.title : 'Untitled Document'
    const newContent = tmpl ? tmpl.content : '<p></p>'
    setTitle(newTitle)
    setContent(newContent)
    setCurrent(null)
    setShowNew(false)
  }

  const openDoc = (doc: Doc) => {
    setCurrent(doc)
    setTitle(doc.title)
    setContent(doc.content)
  }

  const saveDoc = async () => {
    if (!profile || !title) return
    setSaving(true)
    const body = JSON.stringify({ content, category: 'editor', section: 'ALL' })

    if (current) {
      await supabase.from('announcements').update({
        title: `EDITOR: ${title}`, body
      }).eq('id', current.id)
    } else {
      const { data } = await supabase.from('announcements').insert({
        title: `EDITOR: ${title}`,
        body,
        audience: 'EDITOR:document',
        is_urgent: false,
        created_by: profile.id,
        department_id: '00000000-0000-0000-0000-000000000001'
      }).select().single()
      if (data) setCurrent({ id: data.id, title, content, category: 'editor', created_by: profile.id, created_at: data.created_at, section: 'ALL' })
    }

    setSaving(false)
    setSaveMsg('✓ Saved')
    loadDocs()
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const printDoc = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 2.5cm; line-height: 1.6; }
          h1 { font-size: 16pt; text-align: center; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }
          table { border-collapse: collapse; width: 100%; margin: 0.5cm 0; }
          th, td { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
          th { background: #f0f0f0; font-weight: bold; }
          @media print { body { margin: 1.5cm; } }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-primary">// SECTION: DOCUMENT EDITOR</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Document Editor</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Create MOM, question papers, NAAC/NBA criteria, course files
          </p>
        </div>
        {canEdit && (
          <div className="relative">
            <button onClick={() => setShowNew(!showNew)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Document
              <ChevronDown className="w-3 h-3" />
            </button>
            {showNew && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 w-56 overflow-hidden">
                <div className="px-3 py-2 border-b border-border font-mono text-xs text-muted-foreground">Templates</div>
                {Object.entries(TEMPLATES).map(([key, tmpl]) => (
                  <button key={key} onClick={() => newDoc(key)}
                    className="w-full text-left px-4 py-2.5 font-mono text-xs hover:bg-accent transition-colors flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    {tmpl.title}
                  </button>
                ))}
                <div className="border-t border-border">
                  <button onClick={() => newDoc()}
                    className="w-full text-left px-4 py-2.5 font-mono text-xs hover:bg-accent transition-colors">
                    Blank Document
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Sidebar — saved docs */}
        <div className="w-56 flex-shrink-0 space-y-2">
          <p className="font-mono text-xs text-muted-foreground px-1">Saved Documents ({docs.length})</p>
          {docs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="font-mono text-xs text-muted-foreground">No documents yet</p>
            </div>
          ) : docs.map(doc => (
            <button key={doc.id} onClick={() => openDoc(doc)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all hover:border-primary/50 ${current?.id === doc.id ? 'border-primary' : 'border-border'}`}>
              <p className="font-mono text-xs font-medium truncate">{doc.title}</p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0 space-y-3">
          {(current || content) ? (
            <>
              <div className="flex items-center gap-3">
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="flex-1 h-10 px-3 bg-background border border-border rounded font-mono text-sm font-bold focus:border-primary focus:outline-none"
                  placeholder="Document title..." />
                <div className="flex items-center gap-2">
                  {saveMsg && <span className="font-mono text-xs text-green-500">{saveMsg}</span>}
                  <button onClick={printDoc}
                    className="flex items-center gap-1.5 px-3 py-2 bg-accent font-mono text-xs rounded hover:bg-accent/80 transition-colors">
                    <Download className="w-3 h-3" /> Print / PDF
                  </button>
                  {canEdit && (
                    <button onClick={saveDoc} disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-mono text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
              </div>
              <RichEditor
                key={current?.id ?? 'new'}
                content={content}
                onChange={setContent}
                editable={canEdit}
              />
            </>
          ) : (
            <div className="bg-card border border-border rounded-lg p-16 text-center space-y-4">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-mono text-sm text-muted-foreground">Select a document or create new</p>
                <p className="font-mono text-xs text-muted-foreground mt-1">Templates: MOM, Question Paper, NAAC, NBA, Course File</p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap justify-center gap-2">
                  {Object.entries(TEMPLATES).map(([key, tmpl]) => (
                    <button key={key} onClick={() => newDoc(key)}
                      className="font-mono text-xs px-3 py-1.5 bg-accent border border-border rounded hover:border-primary/50 transition-all">
                      {tmpl.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
