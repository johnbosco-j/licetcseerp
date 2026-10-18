import { describe, it, expect } from 'vitest'
import { guessComponent, headerMax } from '@/lib/marks-columns'
import { defaultScheme } from '@/lib/cia-scheme'

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
  it('maps the department sheet headers onto a course scheme', () => {
    const lit = defaultScheme('CS24411')   // DAA, lab-integrated
    expect(['CT1', 'CAT2', 'ABA1', 'Ass', 'LP', 'PT1', 'TEST2', 'SP'].map(h => guessComponent(h + (/\d$/.test(h) || h === 'SP' ? '' : ' 1'), lit)))
      .toEqual(['CIA1_CT', 'CIA2_CAT', 'CIA1_ACTIVITY', 'CIA1_ACTIVITY', 'CIA1_LP', 'CIA1_PT', 'CIA2_PT', 'SP'])
    expect(guessComponent('LP 1', defaultScheme('CS24401'))).toBe('')   // a theory course has no lab part
    expect(guessComponent('Total-T', lit)).toBe('')
  })
  it('reads the maximum written in a header', () => {
    expect(headerMax('CAT2 [100]')).toBe(100); expect(headerMax('Internal(60)')).toBe(60); expect(headerMax('CT1')).toBeNull()
  })
})
