// Marks components of the Regulations 2024 entry scheme, and reading Excel column headers.

/** Marks components and their maximum (Regulations 2024 entry scheme). */
export const COMPONENT_MAX: Record<string, number> = {
  CIA1_CT: 30, CIA1_CAT: 60, CIA1_ACTIVITY: 10, CIA2_CT: 30, CIA2_CAT: 60, CIA2_ACTIVITY: 10,
  CIA1_EXP: 25, CIA1_RECORD: 25, CIA1_VIVA: 25, CIA1_LAB: 25, CIA2_EXP: 25, CIA2_RECORD: 25, CIA2_VIVA: 25, CIA2_LAB: 25,
  SEM_END: 100,
}
export const COMPONENT_NAMES: Record<string, string> = {
  CIA1_CT: 'CIA 1 class test', CIA1_CAT: 'CIA 1 CAT', CIA1_ACTIVITY: 'CIA 1 activity', CIA2_CT: 'CIA 2 class test', CIA2_CAT: 'CIA 2 CAT', CIA2_ACTIVITY: 'CIA 2 activity',
  CIA1_EXP: 'CIA 1 experiments', CIA1_RECORD: 'CIA 1 record', CIA1_VIVA: 'CIA 1 viva', CIA1_LAB: 'CIA 1 lab test', CIA2_EXP: 'CIA 2 experiments', CIA2_RECORD: 'CIA 2 record', CIA2_VIVA: 'CIA 2 viva', CIA2_LAB: 'CIA 2 lab test',
  SEM_END: 'Semester-end',
}

/** Best guess of the component a column header means ('' = ignore). */
export function guessComponent(header: string): string {
  // words, with letters and digits split apart: "CT1" → ct 1, "CAT-II (60)" → cat ii 60
  const words = header.toLowerCase().replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean)
  const has = (...w: string[]) => w.some(x => words.includes(x))
  const text = words.join(' ')
  if (has('see', 'external', 'university') || /semester end|end sem|sem end/.test(text)) return 'SEM_END'
  const n = has('1', 'i', 'one', 'first') ? '1' : has('2', 'ii', 'two', 'second') ? '2' : ''
  if (!n) return ''
  if (has('cat', 'cycle', 'model', 'unit')) return `CIA${n}_CAT`
  if (has('ct', 'quiz', 'slip') || /class test/.test(text)) return `CIA${n}_CT`
  if (words.some(w => /^(activit|assign|seminar|mini)/.test(w))) return `CIA${n}_ACTIVITY`
  if (words.some(w => /^(exp|observ|practical)/.test(w))) return `CIA${n}_EXP`
  if (has('record')) return `CIA${n}_RECORD`
  if (has('viva')) return `CIA${n}_VIVA`
  if (has('lab')) return `CIA${n}_LAB`
  return ''
}
