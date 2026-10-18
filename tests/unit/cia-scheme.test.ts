import { describe, it, expect } from 'vitest'
import { computeInternal, defaultScheme, schemeProblems, type Scheme, type MarkRow } from '@/lib/cia-scheme'

// Real rows from the department's IA workbooks; each expectation is the sheet's own "Internal".
const r = (exam_type: string, marks: number | 'AB', max: number): MarkRow =>
  marks === 'AB' ? { exam_type, marks_obtained: 0, max_marks: max, absent: true } : { exam_type, marks_obtained: marks, max_marks: max }
const lit = (theory: number, lab: number, labSteps = false): Scheme => ({ ...defaultScheme('CS24411'), parts: [{ key: 'T', label: 'Theory', out_of: theory, steps: true }, { key: 'P', label: 'Lab', out_of: lab, steps: labSteps }] })

describe('CIA schemes against the IA workbooks', () => {
  it('theory (OS): CT/30→20, CAT/60 or /100→40, ABA/40 → internal 33', () => {
    const rows = [r('CIA1_CT', 25, 30), r('CIA1_CAT', 46, 60), r('CIA1_ACTIVITY', 38, 40), r('CIA2_CT', 18, 30), r('CIA2_CAT', 77, 100), r('CIA2_ACTIVITY', 38, 40)]
    const c = computeInternal(defaultScheme('CS24401'), rows)
    expect(c.internal).toBe(33)
    expect(c.cia[1].T.got).toBeCloseTo(85.67, 1)   // the sheet's CIA-I: CAT 46/60·40 = 30.67 rounded to 31
    expect(c.complete).toBe(true)
  })
  it('the special test replaces an absent CAT (OS, CAT 1 AB, SP 76) → 34', () => {
    const rows = [r('CIA1_CT', 23, 30), r('CIA1_CAT', 'AB', 60), r('CIA1_ACTIVITY', 38, 40), r('CIA2_CT', 20, 30), r('CIA2_CAT', 86, 100), r('CIA2_ACTIVITY', 40, 40), r('SP', 76, 100)]
    const c = computeInternal(defaultScheme('CS24401'), rows)
    expect(c.spUsed).toBe(1)
    expect(c.internal).toBe(34)
    expect(computeInternal({ ...defaultScheme('CS24401'), sp: false }, rows).internal).toBe(28)
  })
  it('lab-integrated with the sheet’s 25/25 split (DAA) → 46', () => {
    const rows = [r('CIA1_CT', 25, 30), r('CIA1_CAT', 52, 60), r('CIA1_ACTIVITY', 10, 10), r('CIA1_LP', 73, 75), r('CIA1_PT', 25, 25),
      r('CIA2_CT', 22, 30), r('CIA2_CAT', 90, 100), r('CIA2_ACTIVITY', 10, 10), r('CIA2_LP', 72, 75), r('CIA2_PT', 25, 25)]
    const c = computeInternal(lit(25, 25), rows)
    expect(c.parts.map(p => p.value)).toEqual([22, 24])
    expect(c.internal).toBe(46)
  })
  it('lab-integrated 30/20 (FoDS) → 23 + 20', () => {
    const rows = [r('CIA1_CT', 23, 30), r('CIA1_CAT', 55, 60), r('CIA1_ACTIVITY', 10, 10), r('CIA1_LP', 75, 75), r('CIA1_PT', 25, 25),
      r('CIA2_CT', 18, 30), r('CIA2_CAT', 60, 100), r('CIA2_ACTIVITY', 10, 10), r('CIA2_LP', 75, 75), r('CIA2_PT', 25, 25)]
    expect(computeInternal(lit(30, 20, true), rows).parts.map(p => p.value)).toEqual([23, 20])
  })
  it('lab course: LP /75 + test /25 per CIA, reduced to 60 (OS Lab) → 57', () => {
    const rows = [r('CIA1_LP', 73, 75), r('CIA1_PT', 19.75, 25), r('CIA2_LP', 72, 75), r('CIA2_PT', 25, 25)]
    expect(computeInternal(defaultScheme('CS24421'), rows).internal).toBe(57)
  })
  it('pooled components: Engineering Graphics adds CT + CAT before scaling to 50', () => {
    const eg: Scheme = { parts: [{ key: 'T', label: 'Internal', out_of: 50 }], comps: ([1, 2] as const).flatMap(cia => [
      { cia, key: 'CT', label: 'CT', max: 30, weight: 25, part: 'T', pool: 'TC' }, { cia, key: 'CAT', label: 'CAT', max: cia === 1 ? 60 : 100, weight: 25, part: 'T', pool: 'TC' },
      { cia, key: 'ACTIVITY', label: 'ABA', max: 40, weight: 50, part: 'T' }]) }
    expect(schemeProblems(eg)).toEqual([])
    // CIA1 (24+48)/90·50 = 40 + 30/40·50 = 37.5 → 77.5; CIA2 (21+80)/130·50 = 38.85 + 40 → 78.85; /200·50 = 39.1
    const rows = [r('CIA1_CT', 24, 30), r('CIA1_CAT', 48, 60), r('CIA1_ACTIVITY', 30, 40), r('CIA2_CT', 21, 30), r('CIA2_CAT', 80, 100), r('CIA2_ACTIVITY', 32, 40)]
    expect(computeInternal(eg, rows).internal).toBe(39)
  })
  it('units of a formation course (CI&G: U1–U2 in IA 1, U3–U5 in IA 2) → 97', () => {
    const ci: Scheme = { parts: [{ key: 'F', label: 'Internal', out_of: 100 }], rounding: 'up', comps: [
      ...[1, 2].map(u => ({ cia: 1 as const, key: `U${u}`, label: `Unit ${u}`, max: 20, weight: 20, part: 'F' })),
      ...[3, 4, 5].map(u => ({ cia: 2 as const, key: `U${u}`, label: `Unit ${u}`, max: 20, weight: 20, part: 'F' }))] }
    const rows = [r('CIA1_U1', 19.5, 20), r('CIA1_U2', 18.5, 20), r('CIA2_U3', 20, 20), r('CIA2_U4', 19, 20), r('CIA2_U5', 20, 20)]
    expect(computeInternal(ci, rows).internal).toBe(97)
  })
  it('refuses broken schemes', () => {
    expect(schemeProblems({ parts: [], comps: [] }).length).toBeGreaterThan(0)
    expect(schemeProblems({ parts: [{ key: 'T', label: 'T', out_of: 40 }], comps: [{ cia: 1, key: 'SP', label: 'x', max: 10, weight: 10, part: 'T' }] })).toContainEqual(expect.stringMatching(/code/))
  })
})
