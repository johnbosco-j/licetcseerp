// Elective plan → courses of a term. For a batch (graduation year) in a term, the slots of
// the semester it is in (R2024: PE1/PE2 sem 5, PE3/PE4 sem 6, PE5/PE6 sem 7) become one
// combined offering per vertical, tagged with the slot, for the students of that vertical.
import { supabase } from "@/lib/supabase"
import { PE_SLOTS, peCourse } from "@/lib/verticals"

export type PlanRow = { cohort_grad_year: number; slot: string; vertical: string; course_code: string }

/** Semester a batch is in during a term ("2026-2027", ODD, graduating 2028 → 5). */
export function semesterOf(academicYear: string, parity: 'ODD' | 'EVEN', gradYear: number): number {
  const end = Number(academicYear.split('-')[1])
  const year = 4 - (gradYear - end)
  return year * 2 - (parity === 'ODD' ? 1 : 0)
}

const acronym = (title: string) =>
  title.split(/[\s/-]+/).filter(w => w && !/^(and|of|in|for|the|to)$/i.test(w)).map(w => w[0].toUpperCase()).join('')

export async function applyElectivePlan(term: { id: string; academic_year: string; parity: 'ODD' | 'EVEN' }, gradYear: number) {
  const sem = semesterOf(term.academic_year, term.parity, gradYear)
  const slots = PE_SLOTS.filter(s => s.semester === sem).map(s => s.slot)
  if (!slots.length) return { semester: sem, created: 0, updated: 0, slots }
  const { data: plan } = await supabase.from('elective_plan').select('*').eq('cohort_grad_year', gradYear).in('slot', slots)
  const { data: existing } = await supabase.from('subjects').select('id, code, audience_value, elective_slot')
    .eq('term_id', term.id).is('section', null).eq('cohort_grad_year', gradYear)
  let created = 0, updated = 0
  for (const p of (plan ?? []) as PlanRow[]) {
    const have = ((existing ?? []) as { id: string; code: string; audience_value: string | null; elective_slot: string | null }[])
      .find(s => s.code === p.course_code)
    if (have) {
      if (have.elective_slot !== p.slot || have.audience_value !== p.vertical) {
        const { error } = await supabase.from('subjects').update({ elective_slot: p.slot, audience: 'VERTICAL', audience_value: p.vertical }).eq('id', have.id)
        if (error) throw new Error(error.message)
        updated++
      }
      continue
    }
    const c = peCourse(p.course_code)
    if (!c) throw new Error(`${p.course_code} is not in the R2024 vertical catalogue`)
    const { error } = await supabase.from('subjects').insert({
      code: c.code, name: c.title, short_name: acronym(c.title), semester: sem, credits: c.credits,
      section: null, term_id: term.id, academic_year: term.academic_year, cohort_grad_year: gradYear,
      audience: 'VERTICAL', audience_value: p.vertical, elective_slot: p.slot,
      course_type: c.P > 0 ? 'LAB_INTEGRATED' : 'THEORY', regulation: 'R2024', l: c.L, t: c.T, p: c.P,
    })
    if (error) throw new Error(error.message)
    created++
  }
  return { semester: sem, created, updated, slots }
}
