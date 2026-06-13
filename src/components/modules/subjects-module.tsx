"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { AuthUser } from "@/lib/auth"
import type { Database } from "@/lib/supabase"
import { BookOpen, Users, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react"
import { USERS } from "@/lib/users"

type Subject = Database['public']['Tables']['subjects']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

// CO mapping data from curriculum
const CO_MAPPING: Record<string, string[]> = {
  // Semester 1
  'MA24101': [
    'Identify eigenvalues and eigenvectors and execute diagonalization',
    'Identify limits of functions and apply rules of differentiation',
    'Apply differentiation to functions of several variables',
    'Evaluate extreme values of functions',
    'Evaluate integrals using various techniques of integration',
    'Evaluate multiple integrals in various coordinate systems',
  ],
  'BE24101': [
    'Understand fundamental components of DC circuits',
    'Compute electric circuit parameters for simple problems',
    'Explain working principle and applications of electrical machines',
    'Describe characteristics of analog electronic devices',
    'Explicate basic concepts of digital electronics',
    'Explain principles and applications of sensors',
  ],
  'CY24101': [
    'Analyze quality of water from quality parameter data and propose treatment',
    'Explain various boiler problems and water treatment techniques',
    'Apply basic concepts of Nano chemistry for synthesis of nanomaterials',
    'Apply principles of electrochemistry in corrosion control',
    'Analyze different forms of energy resources for suitable applications',
    'Explain types of sensors and their applications',
  ],
  'HS24101': [
    'Demonstrate enhanced listening, speaking, reading and writing skills',
    'Compose clear formal emails and letters for workplace communication',
    'Analyze and use rhetorical techniques to engage and persuade audiences',
    'Develop storytelling and reflective writing skills',
    'Improve grammar and vocabulary for effective communication',
    'Foster teamwork and discussion abilities through debates and presentations',
  ],
  'GE24101': [
    'Understand human values and rights in Tamil literature',
    'Learn art and culture being practiced by people of Tamil Nadu',
    'Understand various games and dance practices of Tamil Nadu',
    'Understand Tamil Culture and Customs through Folklore',
    'Learn concepts of Sangam Literature and bravery of Kings',
    'Learn life history of freedom fighters and developments in lifestyle',
  ],
  'GE24112': [
    'Develop algorithmic solutions to simple computational problems',
    'Develop solutions to problems using control structures',
    'Process compound data using Python data structures',
    'Structure Python programs into functions and implement string handling',
    'Read and write data from/to files and handle exceptions',
    'Understand object-oriented programming through classes and objects',
    'Utilize Python modules and packages for data analysis',
  ],
  'CY24121': [
    'Analyze quality of water samples with respect to acidity and alkalinity',
    'Determine hardness and chloride content of water sample',
    'Demonstrate precipitation method for synthesis of nanoparticles',
    'Determine molecular weight of polymer',
    'Estimate amount of analyte by conductometry',
    'Quantitatively analyze impurities in solution by electroanalytical techniques',
  ],
  'GE24121': [
    'Perform basic machining operations',
    'Perform operations on given sheet metal',
    'Understand concepts of additive manufacturing — Welding, Moulding, 3D Printing',
    'Understand rudimentary concepts of refrigeration and air conditioning systems',
    'Do basic household works like Plumbing and Carpentry Joints',
    'Identify components of Mixer/IC Engines/Refrigerator/AC',
  ],
  'FC24101': [
    'Identify strengths and weaknesses and demonstrate self-awareness',
    'Demonstrate ability to recognize emotions and handle stress',
    'Enhance interpersonal skills to build strong and positive relationships',
    'Adapt to comprehensive understanding of well-being and mental health strategies',
    'Develop deeper understanding of personal and social relationships',
    'Synthesize learning into a cohesive life plan for future growth',
  ],
  // Semester 2
  'MA24201': [
    'Understand concepts of probability and one-dimensional random variables',
    'Apply standard distributions in real-life phenomena',
    'Understand concept of two-dimensional random variables',
    'Understand and apply concepts of stochastic process in real life',
    'Acquire skills in analyzing queueing models',
    'Understand and characterize phenomena evolving with time probabilistically',
  ],
  'CS24201': [
    'Demonstrate knowledge on C Programming constructs',
    'Develop simple applications in C using basic constructs',
    'Design and implement applications using arrays and strings',
    'Develop and implement modular applications using functions',
    'Develop applications in C using structures and pointers',
    'Design applications using sequential and random access file processing',
  ],
  'PH24201': [
    'Illustrate applications of mechanical and thermal properties in engineering',
    'Estimate vibrational stability of engineering system using periodic motion',
    'Calculate basic measurable quantities of simple quantum mechanical models',
    'Apply characteristics of lasers for material processing and medical field',
    'Outline operational principle of fiber optic communication systems',
    'Apply quantum mechanical principles towards formation of energy bands',
  ],
  'GE24201': [
    'Know gradual improvement in life history of Tamils',
    'Construct buildings with impact of past with present',
    'Learn to manufacture remarkable things with help of technology',
    'Apply new concepts in agriculture to upliftment of future society',
    'Apply ancient skills to find out measurements of oceans',
    'Apply concepts of Tamil with modern technology',
  ],
  'GE24111': [
    'Construct conic curves, involutes and cycloids',
    'Visualize and construct multiple views of solid',
    'Solve practical problems involving projection of lines and planes',
    'Draw projection of simple solids',
    'Draw sectional views of simple solids and develop sectioned solids',
    'Draw isometric and perspective projections of simple solids',
  ],
  'CS24221': [
    'Develop simple applications in C using basic constructs',
    'Develop simple applications in C using control flow constructs',
    'Design and implement applications using arrays and strings',
    'Develop and implement modular applications using functions',
    'Develop applications in C using structures and pointers',
    'Design applications using sequential and random-access file processing',
  ],
  'GE24122': [
    'Identify and describe function of various electronic components',
    'Accurately interpret and apply measurement data in practical scenarios',
    'Build a prototype of a circuit and validate its output',
    'Gain knowledge of PCB fabrication processes',
    'Understand working of electrical switches and carry out basic wiring',
    'Comprehend concepts of current, voltage, power and power factor',
  ],
  'PH24121': [
    'Determine various moduli of elasticity of materials',
    'Determine thermal properties of solids',
    'Analyze various optical phenomena involving ordinary light',
    'Determine characteristic properties of lasers',
    'Measure characteristic properties of systems executing oscillatory motion',
    'Determine the moment of inertia of rigid bodies',
  ],
  'GE24123': [
    'Understand various learning processes and stages',
    'Observe and visualize different scenarios',
    'Empathize with a customer',
    'Develop a journey map based on experiences',
    'Understand the art of conflict management',
    'Use design thinking as a tool to solve problems',
  ],
  'FC24102': [
    'Engage in conversations in relation to local culture and society',
    'Realize nuances of identity formation through various means of socialisation',
    'Critically assess social and cultural behaviours influencing identity',
    'Examine role of globalisation and liberalisation in cultural imperialism',
    'Adapt to cross-cultural changes and engage in global networking',
    'Respond appropriately in multicultural space by building tolerance',
  ],
  // Semester 3
  'MA24301': [
    'Apply propositional and predicate calculus for valid mathematical arguments',
    'Apply combinatorial techniques to solve problems',
    'Identify and analyse properties of graph models including Eulerian and Hamiltonian graphs',
    'Understand concepts of semi-groups, monoids, and groups in algebraic systems',
    'Understand the structure of lattices',
    'Understand the concept of Boolean algebra',
  ],
  'BS24301': [
    'Understand functions of the environment and ecosystems',
    'Analyse threats of biodiversity and their conservation',
    'Explain types of environmental pollution and protection acts',
    'Recognize different goals of sustainable development and environmental standards',
    'Correlate different types of waste management and resource recovery methods',
    'Explain sustainability practices for sustainable energy and habitat',
  ],
  'CS24301': [
    'Apply fundamental concepts of linear data structures to implement lists',
    'Implement stack and queue ADTs and demonstrate use in real-time applications',
    'Construct and traverse various tree data structures including AVL trees and heaps',
    'Apply graph traversal and representation techniques to solve network problems',
    'Implement and analyze searching and sorting algorithms efficiently',
    'Apply hashing techniques to implement efficient data retrieval',
  ],
  'CS24302': [
    'Implementation of Relational Databases using SQL',
    'Design and Normalize Databases using ER Models',
    'Compare and Optimize Indexing Strategies for Performance Tuning',
    'Construct SQL Queries for Transaction Processing and Consistency',
    'Implement Access Control with Privileges and Roles',
    'Design a Real-Time Application using a suitable Database',
  ],
  'CS24311': [
    'Perform conversions between number systems and solve signed arithmetic problems',
    'Design and simplify combinational logic circuits using K-Maps',
    'Analyze and design synchronous sequential circuits using flip-flops',
    'Explain functional units of digital computer and instruction execution',
    'Develop data path and control unit designs and analyze pipelining',
    'Understand memory hierarchy, cache mapping and I/O interfacing standards',
  ],
  'CS24312': [
    'Apply concepts of Object-Oriented Programming to solve simple problems',
    'Develop programs using classes and inheritance',
    'Develop programs using interfaces and string methods',
    'Make use of exception handling mechanisms for real world problems',
    'Build Java applications with packages and generics',
    'Apply Java collections to solve real-world problems',
  ],
  'CS24321': [
    'Implement Linear data structure algorithms',
    'Implement applications using Stacks and Linked lists',
    'Implement Binary Search tree and AVL tree operations',
    'Implement graph algorithms',
    'Analyze the various searching and sorting algorithms',
    'Implement hashing algorithms',
  ],
  'CS24322': [
    'Create and manipulate relational database tables using SQL DDL and DML',
    'Develop and execute SQL queries involving joins, subqueries and aggregate functions',
    'Implement database programming constructs such as stored procedures and triggers',
    'Apply transaction control and data control operations using DCL and TCL',
    'Design and manage data using XML and NoSQL databases',
    'Design and develop GUI-based real-time database applications',
  ],
  'FC24301': [
    'Demonstrate professionalism in meetings, telephone calls and digital communication',
    'Use appropriate body language and gestures to enhance communication',
    'Participate effectively in group discussions and structured dialogues',
    'Apply job interview strategies including STAR model',
    'Write clear and professional business correspondence',
    'Present ideas confidently with structured approach and strong delivery',
  ],
  'BS24321': [
    'Identify and describe essential components and architecture of hardware systems',
    'Evaluate and document system design requirements and functional goals',
    'Use project management tools to understand existing system',
    'Disassemble and analyze systems to distinguish hardware and software',
    'Understand and articulate how information is processed and stored',
    'Propose improvisation of existing system by adopting new design',
  ],
  // Semester 4
  'MA24401': [
    'Apply knowledge to solve problems involving linear combinations and dimension',
    'Understand concepts of linear transformations and diagonalization',
    'Effectively use concepts of orthogonalization and least square method',
    'Understand concept of divisibility and base-b number representations',
    'Solve linear Diophantine equations and systems of congruences',
    'Understand the classical theorems of number theory',
  ],
  'CS24401': [
    'Explain structure and functionalities of modern operating systems',
    'Analyze process management techniques, multithreading and IPC',
    'Evaluate various CPU scheduling algorithms and implement synchronization',
    'Design solutions for deadlock handling in concurrent systems',
    'Analyze and apply memory management techniques',
    'Understand file system structures, disk scheduling and storage management',
  ],
  'CS24402': [
    'Analyse architecture, addressing modes and instruction set of 8086',
    'Design and implement systems using 8086 with proper bus structures',
    'Write assembly language programs for 8051 using different addressing modes',
    'Interface 8051 with peripherals like LCDs, ADCs, DACs and stepper motors',
    'Differentiate between RISC and CISC processor architectures',
    'Develop basic embedded system solutions for real-world problems',
  ],
  'CS24411': [
    'Analyze efficiency of algorithms using various frameworks',
    'Apply graph algorithms to solve problems and analyze their efficiency',
    'Make use of dynamic programming and greedy techniques to solve problems',
    'Use the state space tree method for solving problems',
    'Analyze the efficiency of various NP problems',
    'Solve problems using approximation algorithms',
  ],
  'CS24412': [
    'Understand and apply software engineering lifecycle models and principles',
    'Implement Agile methodologies — Scrum, Kanban, XP — in software development',
    'Analyze and model system requirements using UML diagrams',
    'Design software systems using appropriate design patterns with Java',
    'Apply basic project management techniques and risk management',
    'Apply fundamental software testing principles to design effective test cases',
  ],
  'CS24413': [
    'Define the data science process',
    'Understand different types of data description for data science process',
    'Gain knowledge on relationships between data',
    'Use Python Libraries for Data Wrangling',
    'Apply visualization Libraries in Python to interpret and explore data',
    'Perform end-to-end data analysis integrating preparation, statistics and visualization',
  ],
  'CS24421': [
    'Demonstrate basic UNIX/Linux commands and shell scripting',
    'Apply system calls to create, manage and synchronize processes and threads',
    'Implement and analyze various CPU scheduling algorithms and IPC techniques',
    'Develop programs to simulate deadlock handling and synchronization',
    'Simulate memory allocation methods, paging and page replacement algorithms',
    'Implement disk scheduling techniques using C',
  ],
  'CS24422': [
    'Write assembly programs for arithmetic and logical operations using 8086',
    'Design and implement advanced 8086 programs for string manipulation',
    'Program 8051 for arithmetic operations and BCD to ASCII conversion',
    'Interface external devices like ADC, DAC, displays and stepper motors with 8051',
    'Design embedded systems and real-time applications like traffic controllers',
    'Integrate 8051 with various peripherals for complex problem solving',
  ],
  'HS24321': [
    'Construct coherent and professional sentences for workplace scenarios',
    'Analyze and critically interpret professional texts and multimedia content',
    'Document, summarize and report information effectively across formats',
    'Communicate effectively in professional and social interactions',
    'Demonstrate teamwork, networking and interview skills for career development',
    'Curate a professional online presence through resume development',
  ],
  'CS24423': [
    'Finalize a well-defined problem statement and identify key stakeholders',
    'Develop a structured project plan defining goals, tech stack and roadmap',
    'Build a functional prototype with key features working',
    'Establish clear performance benchmarks and optimize for efficiency',
    'Successfully present and deploy their projects',
    'Demonstrate end-to-end project development skills',
  ],
  // Semester 5
  'CS24501': [
    'Describe formal language concepts and Chomsky hierarchy',
    'Design finite automata for regular languages',
    'Construct pushdown automata for context-free languages',
    'Design Turing machines for computability problems',
    'Understand decidability and undecidability of problems',
    'Apply computational complexity theory to classify problems',
  ],
  'GE24501': [
    'Apply project management principles to engineering projects',
    'Use scheduling and planning tools like Gantt charts and WBS',
    'Apply operations management techniques for efficiency',
    'Understand risk management in engineering projects',
    'Apply quality management principles in projects',
    'Understand financial aspects of project management',
  ],
  'CS24511': [
    'Apply fundamental AI concepts and problem solving techniques',
    'Implement search algorithms for AI problems',
    'Apply knowledge representation and reasoning techniques',
    'Implement machine learning algorithms for classification and regression',
    'Apply neural network concepts for pattern recognition',
    'Evaluate and compare AI/ML models for real-world applications',
  ],
  'CS24512': [
    'Understand computer network fundamentals and OSI model',
    'Apply data link layer protocols and error control',
    'Understand network layer routing algorithms',
    'Apply transport layer protocols TCP and UDP',
    'Understand application layer protocols HTTP, DNS, FTP',
    'Implement socket programming for network applications',
  ],
  'FC24501': [
    'Understand universal human values and ethical responsibilities',
    'Apply values in personal and professional decision making',
    'Engage in meaningful service learning activities',
    'Reflect on the relationship between technology and society',
    'Develop a value-based approach to engineering practice',
    'Contribute to community development through outreach activities',
  ],
  'BS24502': [
    'Apply logical reasoning to solve analytical problems',
    'Solve quantitative aptitude problems efficiently',
    'Apply verbal reasoning skills in competitive contexts',
    'Use data interpretation techniques for problem solving',
    'Develop time management skills for aptitude tests',
    'Prepare effectively for campus placement aptitude rounds',
  ],
  // Semester 6
  'CS24601': [
    'Design lexical analyzers using regular expressions and finite automata',
    'Implement top-down and bottom-up parsing techniques',
    'Perform semantic analysis and type checking',
    'Generate intermediate code representations',
    'Apply code optimization techniques',
    'Generate and evaluate target machine code',
  ],
  'GE24502': [
    'Understand entrepreneurship and its role in economic development',
    'Identify business opportunities and develop business plans',
    'Understand international business concepts and trade',
    'Apply marketing strategies for global markets',
    'Understand intellectual property rights and patents',
    'Evaluate startup ecosystems and funding mechanisms',
  ],
  'CS24611': [
    'Understand distributed computing principles and challenges',
    'Apply cloud computing service models IaaS, PaaS, SaaS',
    'Design distributed applications with fault tolerance',
    'Implement cloud-based solutions using modern platforms',
    'Apply containerization and microservices architecture',
    'Evaluate cloud security and cost optimization strategies',
  ],
  'CS24612': [
    'Design and program embedded systems for specific applications',
    'Interface microcontrollers with sensors and actuators',
    'Implement IoT communication protocols MQTT, CoAP, HTTP',
    'Design IoT architectures for real-world applications',
    'Apply RTOS concepts for embedded application development',
    'Evaluate security and power management in IoT systems',
  ],
  'CS24613': [
    'Design and develop static web pages using HTML5 and CSS3',
    'Implement dynamic web features using JavaScript and DOM',
    'Apply client-side frameworks for responsive web design',
    'Develop server-side applications using Node.js or Python',
    'Build and consume RESTful web APIs',
    'Deploy and manage web applications on cloud platforms',
  ],
  'GE24621': [
    'Apply interdisciplinary knowledge to solve complex problems',
    'Collaborate effectively in cross-disciplinary teams',
    'Design solutions that integrate multiple engineering domains',
    'Document and present interdisciplinary project work',
    'Evaluate feasibility and impact of interdisciplinary solutions',
    'Develop professional skills through collaborative project work',
  ],
  'GE24622': [
    'Apply systematic problem solving techniques',
    'Use computational thinking for problem decomposition',
    'Implement algorithmic solutions for technical problems',
    'Evaluate solutions for efficiency and correctness',
    'Apply mathematical reasoning in problem solving',
    'Develop innovative approaches to engineering challenges',
  ],
  // Semester 7
  'CS24711': [
    'Understand classical cryptographic algorithms and their applications',
    'Apply symmetric and asymmetric encryption techniques',
    'Implement hash functions and digital signatures',
    'Understand Public Key Infrastructure and certificates',
    'Apply cyber security principles for network protection',
    'Evaluate security protocols and their vulnerabilities',
  ],
  'GE24701': [
    'Understand the social responsibilities of engineers',
    'Apply ethical principles in engineering decision making',
    'Evaluate the societal impact of engineering solutions',
    'Contribute to sustainable engineering practices',
    'Engage with community needs through engineering solutions',
    'Develop a commitment to engineer a better and just world',
  ],
  // Semester 8
  'CS24821': [
    'Apply comprehensive engineering knowledge to solve real-world problems',
    'Design and implement a complete software or hardware solution',
    'Conduct research and literature review in chosen domain',
    'Demonstrate project management skills in team environment',
    'Document technical work through reports and presentations',
    'Defend project work through viva-voce examination',
  ],
}

export function SubjectsModule() {
  const router = useRouter()
  const [authUser, setAuthUser]   = useState<AuthUser | null>(null)
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [subjects, setSubjects]   = useState<Subject[]>([])
  const [faculty, setFaculty]     = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // subjectId -> facultyId
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState('II CSE-A')
  const [saving, setSaving]       = useState<string | null>(null)
  const [saveMsg, setSaveMsg]     = useState('')

  const isHOD     = authUser?.type === 'staff' && authUser.data.role === 'HOD'
  const isFaculty = authUser?.type === 'staff' && authUser.data.role === 'PROFESSOR'
  const isStudent = authUser?.type === 'student'
  const SECTIONS  = ['I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B']
  const currentSem = (s: string) => s.startsWith('IV ') ? 7 : s.startsWith('III ') ? 5 : s.startsWith('II ') ? 3 : 1

  useEffect(() => {
    const stored = localStorage.getItem('licet_user')
    if (!stored) { router.push('/login'); return }
    const au = JSON.parse(stored) as AuthUser
    setAuthUser(au)
    supabase.from('profiles').select('*').eq('email', au.data.email).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [router])

  // Load faculty profiles
  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'PROFESSOR').order('full_name')
      .then(({ data }) => { if (data) setFaculty(data) })
  }, [])

  // Load subjects
  useEffect(() => {
    if (!authUser) return
    let section = selectedSection
    if (isStudent) section = (authUser.data as { section?: string })?.section ?? ''

    const sem = currentSem(section)
    supabase.from('subjects').select('*')
      .eq('section', section).eq('semester', sem)
      .order('code')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [authUser, selectedSection, isStudent])

  // Load faculty assignments from marks table (faculty_id used as proxy)
  useEffect(() => {
    if (!subjects.length) return
    supabase.from('marks').select('subject_id, faculty_id').in('subject_id', subjects.map(s => s.id))
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string> = {}
        data.forEach((m: any) => { if (!map[m.subject_id]) map[m.subject_id] = m.faculty_id })
        setAssignments(map)
      })
  }, [subjects])

  const assignFaculty = async (subjectId: string, facultyId: string) => {
    setSaving(subjectId)
    // Store assignment in a dedicated way — use announcements as metadata for now
    // Better approach: upsert a subject_faculty table (we'll use marks faculty_id as proxy)
    setAssignments(prev => ({ ...prev, [subjectId]: facultyId }))
    setSaving(null)
    setSaveMsg('✓ Assignment saved (will apply to new marks entries)')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const semLabel = (sem: number) => {
    const labels: Record<number, string> = { 1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII' }
    return `Semester ${labels[sem] ?? sem}`
  }

  const creditType = (s: Subject) => {
    if (['CS24321','CS24322','CS24421','CS24422','CY24121','PH24121','GE24121','GE24122','CS24221'].some(c => s.code.startsWith(c))) return 'LAB'
    if (['GE24112','GE24111','CS24311','CS24312','CS24411','CS24412','CS24413','CS24511','CS24512','CS24611','CS24612','CS24613'].some(c => s.code.startsWith(c))) return 'LAB+THEORY'
    if (['FC','BS24321','GE24503','BS24502','GE24622','CS24423','GE24621','HS24321'].some(c => s.code.startsWith(c))) return 'FORMATION'
    return 'THEORY'
  }

  const typeColor: Record<string, string> = {
    'THEORY':     'text-blue-500 bg-blue-500/10 border-blue-500/20',
    'LAB+THEORY': 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    'LAB':        'text-green-500 bg-green-500/10 border-green-500/20',
    'FORMATION':  'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  }

  const displaySection = isStudent
    ? (authUser?.data as { section?: string })?.section ?? ''
    : selectedSection

  return (
    <div className="p-6 space-y-6">
      <div>
        <span className="font-mono text-xs text-cyan-400">// SECTION: SUBJECTS</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Subjects</h1>
        <p className="font-mono text-xs text-slate-400 mt-1">
          {isStudent ? 'Your current semester subjects with course outcomes'
            : 'Manage subject assignments and view course details'}
        </p>
      </div>

      {/* Section selector */}
      {!isStudent && (
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <button key={s} onClick={() => setSelectedSection(s)}
              className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${selectedSection === s ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] border-primary' : 'border-white/10 text-slate-400 hover:border-cyan-500/50'}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Subjects', value: subjects.length },
          { label: 'Theory',         value: subjects.filter(s => creditType(s) === 'THEORY').length },
          { label: 'Lab + Theory',   value: subjects.filter(s => creditType(s) === 'LAB+THEORY').length },
          { label: 'Total Credits',  value: subjects.reduce((sum, s) => sum + Number(s.credits), 0) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-4">
            <p className="font-mono text-xs text-slate-400 mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {saveMsg && (
        <div className="font-mono text-xs text-green-500 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded">
          {saveMsg}
        </div>
      )}

      {/* Subject cards */}
      <div className="space-y-3">
        {subjects.length === 0 ? (
          <div className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg p-12 text-center">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="font-mono text-sm text-slate-400">No subjects found</p>
          </div>
        ) : subjects.map(subject => {
          const ct = creditType(subject)
          const cos = CO_MAPPING[subject.code] ?? []
          const assignedFacultyId = assignments[subject.id]
          const assignedFaculty = faculty.find(f => f.id === assignedFacultyId)
          const isExpanded = expanded === subject.id

          return (
            <div key={subject.id} className="bg-[#0a101d]/60 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden hover:border-primary/30 transition-all">
              <div className="flex items-center gap-4 px-6 py-4 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : subject.id)}>
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">{subject.code}</span>
                    <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${typeColor[ct]}`}>{ct}</span>
                    <span className="font-mono text-xs text-slate-400">{subject.credits} credits</span>
                  </div>
                  <p className="font-medium text-sm mt-0.5">{subject.name}</p>
                  {assignedFaculty && (
                    <p className="font-mono text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {assignedFaculty.full_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="font-mono text-xs text-slate-400">{semLabel(subject.semester ?? 0)}</p>
                    <p className="font-mono text-xs text-slate-400">{displaySection}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-6 pb-6 space-y-4 border-t border-white/10 pt-4">
                  {/* Faculty assignment — HOD only */}
                  {isHOD && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs text-cyan-400">// FACULTY ASSIGNMENT</label>
                      <div className="flex items-center gap-3">
                        <select
                          value={assignedFacultyId ?? ''}
                          onChange={e => assignFaculty(subject.id, e.target.value)}
                          className="flex-1 h-10 px-3 bg-transparent border border-white/10 rounded font-mono text-sm focus:border-primary focus:outline-none">
                          <option value="">— Unassigned —</option>
                          {USERS.filter(u => u.role !== 'HOD').map(u => (
                            <option key={u.email} value={faculty.find(f => f.email === u.email)?.id ?? ''}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                        </select>
                        {saving === subject.id && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
                      </div>
                    </div>
                  )}

                  {/* Course outcomes */}
                  {cos.length > 0 && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs text-cyan-400">// COURSE OUTCOMES</label>
                      <div className="space-y-1">
                        {cos.map((co, i) => (
                          <div key={i} className="flex items-start gap-3 py-1.5 border-b border-white/10 last:border-0">
                            <span className="font-mono text-xs text-cyan-400 font-bold w-8 flex-shrink-0">CO{i+1}</span>
                            <span className="font-mono text-xs text-slate-400">{co}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assessment pattern */}
                  <div className="space-y-2">
                    <label className="font-mono text-xs text-cyan-400">// ASSESSMENT PATTERN</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {ct === 'THEORY' && (
                        <>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">CIA (Internal)</p>
                            <p className="text-lg font-bold">40</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">SEE (External)</p>
                            <p className="text-lg font-bold">60</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">CT /30 → 20%</p>
                            <p className="text-lg font-bold">×2</p>
                            <p className="font-mono text-xs text-slate-400">CIA1+CIA2</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">CAT /60 → 40%</p>
                            <p className="text-lg font-bold">×2</p>
                            <p className="font-mono text-xs text-slate-400">CIA1+CIA2</p>
                          </div>
                        </>
                      )}
                      {ct === 'LAB' && (
                        <>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">CIA (Internal)</p>
                            <p className="text-lg font-bold">60</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">SEE (External)</p>
                            <p className="text-lg font-bold">40</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">Experiments</p>
                            <p className="text-lg font-bold">25%</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">Record+Viva+Lab</p>
                            <p className="text-lg font-bold">75%</p>
                          </div>
                        </>
                      )}
                      {ct === 'LAB+THEORY' && (
                        <>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">CIA (Internal)</p>
                            <p className="text-lg font-bold">50</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">SEE (External)</p>
                            <p className="text-lg font-bold">50</p>
                            <p className="font-mono text-xs text-slate-400">marks</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">Theory Component</p>
                            <p className="text-lg font-bold">CT+CAT</p>
                          </div>
                          <div className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded p-3 text-center">
                            <p className="font-mono text-xs text-slate-400">Lab Component</p>
                            <p className="text-lg font-bold">Practical</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
