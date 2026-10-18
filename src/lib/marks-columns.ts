// Reading Excel column headers of IA workbooks ("CT1", "CAT2 [100]", "ABA1", "LP", "PT1",
// "SP", "SEE" …) into marks components of a course's CIA scheme (lib/cia-scheme.ts).
import { examType, SP_KEY, type Scheme } from './cia-scheme'

/** Best guess of the component a column header means ('' = ignore). With a scheme, only its
 *  components (and SP / SEM_END) are returned; without one, the older fixed names. */
export function guessComponent(header: string, scheme?: Scheme): string {
  // words, with letters and digits split apart: "CT1" → ct 1, "CAT-II (60)" → cat ii 60
  const words = header.toLowerCase().replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean)
  const has = (...w: string[]) => w.some(x => words.includes(x))
  const text = words.join(' ')
  if (has('see', 'external', 'university') || /semester end|end sem|sem end/.test(text)) return 'SEM_END'
  if (has('total', 'internal', 'name', 'reg', 'roll', 'out')) return ''
  if (has('sp', 'special')) return scheme?.sp === false ? '' : SP_KEY
  const n = has('1', 'i', 'one', 'first') ? '1' : has('2', 'ii', 'two', 'second') ? '2' : ''
  if (!n) return ''
  const ok = (key: string) => !scheme || scheme.comps.some(c => examType(c) === `CIA${n}_${key}`) ? `CIA${n}_${key}` : ''
  if (has('cat', 'cycle', 'model', 'unit')) return ok('CAT')
  if (has('ct', 'quiz', 'slip') || /class test|concept test/.test(text)) return ok('CT')
  if (has('ass', 'assignment') && scheme?.comps.some(c => c.key === 'ASSIGN')) return ok('ASSIGN')
  if (has('aba', 'abl', 'at', 'ass') || words.some(w => /^(activit|assign|seminar|mini)/.test(w))) return ok('ACTIVITY')
  if (scheme) {
    if (has('lp', 'performance', 'record', 'viva') || words.some(w => /^(exp|observ)/.test(w))) return ok('LP')
    if (has('pt', 'test', 'practical', 'lab')) return ok('PT')
    return ''
  }
  if (words.some(w => /^(exp|observ|practical)/.test(w))) return `CIA${n}_EXP`
  if (has('record')) return `CIA${n}_RECORD`
  if (has('viva')) return `CIA${n}_VIVA`
  if (has('lab')) return `CIA${n}_LAB`
  return ''
}

/** "[100]", "(60)", "/40" or "out of 25" in a header → that maximum. */
export function headerMax(header: string): number | null {
  const m = header.match(/(?:\[|\(|\/|out of\s*)\s*(\d{1,3})\s*\]?\)?/i)
  return m ? Number(m[1]) : null
}
