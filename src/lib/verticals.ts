// Professional-elective verticals of B.E. CSE R2024 (Approved Regulation, CSE_R2024 dated 05.10.2026).
// Each vertical offers these courses; the HOD picks which course a batch takes in each slot
// (PE1 … PE6) in Configuration → Verticals & groups → Elective plan.

export type PeCourse = { code: string; title: string; L: number; T: number; P: number; credits: number }
export type VerticalDef = { code: string; name: string; courses: PeCourse[] }

/** Slots and the semester they are taught in. */
export const PE_SLOTS: { slot: string; semester: number }[] = [
  { slot: 'PE1', semester: 5 }, { slot: 'PE2', semester: 5 }, { slot: 'PE3', semester: 6 },
  { slot: 'PE4', semester: 6 }, { slot: 'PE5', semester: 7 }, { slot: 'PE6', semester: 7 },
]

export const VERTICAL_CATALOG: VerticalDef[] = [
  { code: 'DS', name: 'Data Science', courses: [
    { code: 'PCS2401', title: 'Exploratory Data Analysis', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2402', title: 'Recommender Systems', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2403', title: 'Text and Speech Analysis', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2404', title: 'Healthcare Analytics', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2405', title: 'Business Analytics', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2406', title: 'Image and Video Analytics', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2407', title: 'Computer Vision', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2408', title: 'Big Data Analytics', L: 2, T: 0, P: 2, credits: 3 },
  ] },
  { code: 'FSD', name: 'Full Stack Development', courses: [
    { code: 'PCS2409', title: 'Cloud Application Development', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2410', title: 'App Development', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2411', title: 'Full Stack Web Application Development', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2412', title: 'UI and UX Design', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2413', title: 'Software Testing and Automation', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2414', title: 'Web Application Security', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2415', title: 'DevOps', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2416', title: 'Principles of Programming Languages', L: 3, T: 0, P: 0, credits: 3 },
  ] },
  { code: 'DCT', name: 'Data Center Technologies', courses: [
    { code: 'PCS2417', title: 'Data Warehousing and Data Mining Techniques', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2418', title: 'Virtualization', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2419', title: 'Cloud Services Management', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2420', title: 'Security and Privacy in Cloud', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2421', title: 'Storage Technologies', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2422', title: 'Software Defined Networks', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2424', title: 'Fog and Edge Computing', L: 3, T: 0, P: 0, credits: 3 },
  ] },
  { code: 'CYBER', name: 'Cyber Security and Data Privacy', courses: [
    { code: 'PCS2425', title: 'Ethical Hacking', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2426', title: 'Digital and Mobile Forensics', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2427', title: 'Social Network Security', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2428', title: 'Modern Cryptography', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2429', title: 'Security and Trust in IoT', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2420', title: 'Security and Privacy in Cloud', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2430', title: 'Network Security', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2431', title: 'Malware Analysis', L: 2, T: 0, P: 2, credits: 3 },
  ] },
  { code: 'EMERGING', name: 'Emerging Technologies', courses: [
    { code: 'PCS2432', title: 'Cryptocurrency and Blockchain Technologies', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2433', title: 'Robotic Process Automation and Intelligent Agents', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2434', title: 'Augmented Reality/Virtual Reality', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2435', title: 'Game Development', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2436', title: 'Low-Code/ No-Code Development', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2437', title: 'Quantum Computing', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2438', title: 'Metaverse', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2439', title: 'Green Computing', L: 3, T: 0, P: 0, credits: 3 },
  ] },
  { code: 'AIML', name: 'Artificial Intelligence and Machine Learning', courses: [
    { code: 'PCS2440', title: 'Knowledge Engineering', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2441', title: 'Soft Computing', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2442', title: 'Neural Networks and Deep Learning', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2443', title: 'Pattern Recognition Techniques', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2444', title: 'Reinforcement Learning', L: 3, T: 0, P: 0, credits: 3 },
    { code: 'PCS2445', title: 'Cognitive Science', L: 2, T: 0, P: 2, credits: 3 },
    { code: 'PCS2446', title: 'Ethics and AI', L: 2, T: 0, P: 2, credits: 3 },
  ] },
]

export const peCourse = (code: string): PeCourse | undefined =>
  VERTICAL_CATALOG.flatMap(v => v.courses).find(c => c.code === code)

/** "AI & ML vertical" style label for a vertical code (any vertical, active or not). */
export const verticalName = (code: string | null | undefined) =>
  code === 'AIML' ? 'AI & ML' : code === 'FSD' ? 'Full Stack' : VERTICAL_CATALOG.find(v => v.code === code)?.name ?? code ?? ''
