import { describe, it, expect } from 'vitest'
import { guessComponent, COMPONENT_MAX } from '@/lib/marks-columns'

describe('guessComponent (IA workbook headers)', () => {
  it.each([
    ['CAT 1', 'CIA1_CAT'], ['CAT-II (60)', 'CIA2_CAT'], ['Cycle Test 2', 'CIA2_CAT'],
    ['CT1', 'CIA1_CT'], ['Class Test - I', 'CIA1_CT'], ['Quiz 2', 'CIA2_CT'],
    ['Assignment 1', 'CIA1_ACTIVITY'], ['Activity II', 'CIA2_ACTIVITY'],
    ['Record 1', 'CIA1_RECORD'], ['Viva-2', 'CIA2_VIVA'], ['Observation 1', 'CIA1_EXP'],
    ['SEE', 'SEM_END'], ['Semester End', 'SEM_END'], ['University Exam', 'SEM_END'],
  ])('%s → %s', (header, want) => expect(guessComponent(header)).toBe(want))

  it('leaves names, totals and unknown columns unmapped', () => {
    for (const h of ['Name', 'Register No', 'Total', 'Remarks', 'S.No']) expect(guessComponent(h)).toBe('')
  })
  it('knows the maximum of every component it can return', () => {
    for (const h of ['CAT 1', 'CT2', 'SEE', 'Record 1']) expect(COMPONENT_MAX[guessComponent(h)]).toBeGreaterThan(0)
  })
})
