import { describe, expect, it } from 'vitest'
import {
  TONE,
  activeOn,
  audienceLabel,
  eligibility,
  entryTitle,
  fmtTime,
  scopeOf,
  shortAudience,
  toBlocks,
  weekdayOf,
  yearOf,
  type StudentGroup,
  type TimetableEntry,
  type Vertical,
} from '@/lib/academic'

let seq = 0
function entry(p: Partial<TimetableEntry> & Pick<TimetableEntry, 'period_no'>): TimetableEntry {
  return {
    id: `e${++seq}`, term_id: 't1', section: 'II CSE-A', day_order: 1,
    subject_id: 'ds', label: null, audience: 'ALL', audience_value: null, group_id: null,
    room: null, faculty_ids: [], faculty_names: null, takes_attendance: true,
    effective_from: null, effective_to: null,
    ...p,
  }
}
const shape = (blocks: ReturnType<typeof toBlocks>) =>
  blocks.map(b => ({ section: b.section, subject: b.entry.subject_id ?? b.entry.label, audience: `${b.entry.audience}${b.entry.audience_value ?? ''}`, periods: b.periods }))

describe('yearOf / scopeOf', () => {
  it.each([
    ['I CSE-A', 1, 'FY'], ['I CSE-B', 1, 'FY'],
    ['II CSE-A', 2, 'HS'], ['III CSE-B', 3, 'HS'],
    ['IV CSE-A', 4, 'IV'],
  ])('%s → year %i, calendar scope %s', (section, year, scope) => {
    expect(yearOf(section)).toBe(year)
    expect(scopeOf(section)).toBe(scope)
  })

  it('returns year 0 for unknown sections (and the II–III calendar)', () => {
    expect(yearOf('')).toBe(0)
    expect(yearOf('V CSE-A')).toBe(0)
    expect(yearOf('ii CSE-A')).toBe(0)
    expect(scopeOf('V CSE-A')).toBe('HS')
  })
})

describe('weekdayOf', () => {
  it('numbers Monday 1 … Saturday 6 and Sunday 7', () => {
    expect(weekdayOf('2026-10-12')).toBe(1)
    expect(weekdayOf('2026-10-16')).toBe(5)
    expect(weekdayOf('2026-10-17')).toBe(6)
    expect(weekdayOf('2026-10-18')).toBe(7)
  })

  it('handles month and leap-year boundaries', () => {
    expect(weekdayOf('2028-02-29')).toBe(2)
    expect(weekdayOf('2026-12-31')).toBe(4)
    expect(weekdayOf('2027-01-01')).toBe(5)
  })
})

describe('audienceLabel', () => {
  const verticals: Vertical[] = [{ code: 'AIML', name: 'Artificial Intelligence', description: null, course_codes: [], is_active: true }]
  const groups: StudentGroup[] = [{ id: 'g1', name: 'Honours — Cloud', kind: 'HONOURS', cohort_grad_year: 2028, section: null, term_id: null }]

  it('labels whole class and batches', () => {
    expect(audienceLabel('ALL', null)).toBe('Whole class')
    expect(audienceLabel('BATCH', '2')).toBe('Batch 2')
  })

  it('uses the configured vertical name when available', () => {
    expect(audienceLabel('VERTICAL', 'AIML', verticals)).toBe('Artificial Intelligence')
  })

  it('falls back to built-in vertical names', () => {
    expect(audienceLabel('VERTICAL', 'AIML')).toBe('AI & ML vertical')
    expect(audienceLabel('VERTICAL', 'FSD', verticals)).toBe('Full Stack vertical')
    expect(audienceLabel('VERTICAL', 'CYS')).toBe('CYS vertical')
  })

  it('looks groups up by id', () => {
    expect(audienceLabel('GROUP', null, undefined, groups, 'g1')).toBe('Honours — Cloud')
    expect(audienceLabel('GROUP', null, undefined, groups, 'missing')).toBe('Group')
    expect(audienceLabel('GROUP', null)).toBe('Group')
  })
})

describe('shortAudience', () => {
  it.each<[Parameters<typeof shortAudience>[0], string | null, string]>([
    ['ALL', null, ''],
    ['BATCH', '1', 'B1'],
    ['VERTICAL', 'AIML', 'AI&ML'],
    ['VERTICAL', 'FSD', 'FSD'],
    ['VERTICAL', 'CYS', 'CYS'],
    ['VERTICAL', null, ''],
    ['GROUP', 'x', 'Group'],
  ])('%s %s → "%s"', (a, v, out) => {
    expect(shortAudience(a, v)).toBe(out)
  })
})

describe('entryTitle', () => {
  const subjects = { id: 's', code: 'CS24301', name: 'Data Structures', short_name: 'DS', section: 'II CSE-A', cohort_grad_year: 2029, audience: 'ALL' as const, audience_value: null }

  it('uses the label when there is no subject', () => {
    expect(entryTitle({ label: 'Library', subjects: null })).toBe('Library')
  })

  it('prefers the subject short name over a non-lab label', () => {
    expect(entryTitle({ label: 'Tutorial', subjects })).toBe('DS')
  })

  it('keeps a lab label even when a subject is linked', () => {
    expect(entryTitle({ label: 'DS Lab', subjects })).toBe('DS Lab')
    expect(entryTitle({ label: 'LABORATORY', subjects })).toBe('LABORATORY')
  })

  it('falls back from short name to code to label to a dash', () => {
    expect(entryTitle({ label: null, subjects: { ...subjects, short_name: null } })).toBe('CS24301')
    expect(entryTitle({ label: 'Seminar', subjects: { ...subjects, short_name: '', code: '' } })).toBe('Seminar')
    expect(entryTitle({ label: null, subjects: null })).toBe('—')
  })
})

describe('fmtTime', () => {
  it.each([
    ['08:00', '8:00 AM'],
    ['00:05', '12:05 AM'],
    ['11:59', '11:59 AM'],
    ['12:00', '12:00 PM'],
    ['13:30', '1:30 PM'],
    ['23:59', '11:59 PM'],
    ['08:00:00', '8:00 AM'],   // Postgres time columns include seconds
  ])('%s → %s', (t, out) => {
    expect(fmtTime(t)).toBe(out)
  })
})

describe('activeOn', () => {
  it('is always active without effective dates', () => {
    expect(activeOn(entry({ period_no: 1 }), '2026-10-16')).toBe(true)
  })

  it('respects effective_from (inclusive)', () => {
    const e = entry({ period_no: 1, effective_from: '2026-10-16' })
    expect(activeOn(e, '2026-10-15')).toBe(false)
    expect(activeOn(e, '2026-10-16')).toBe(true)
    expect(activeOn(e, '2027-01-01')).toBe(true)
  })

  it('respects effective_to (inclusive)', () => {
    const e = entry({ period_no: 1, effective_to: '2026-10-16' })
    expect(activeOn(e, '2026-10-16')).toBe(true)
    expect(activeOn(e, '2026-10-17')).toBe(false)
  })

  it('handles a window and a single-day entry', () => {
    const e = entry({ period_no: 1, effective_from: '2026-10-01', effective_to: '2026-10-31' })
    expect(activeOn(e, '2026-09-30')).toBe(false)
    expect(activeOn(e, '2026-10-20')).toBe(true)
    expect(activeOn(e, '2026-11-01')).toBe(false)
    const day = entry({ period_no: 1, effective_from: '2026-10-16', effective_to: '2026-10-16' })
    expect(activeOn(day, '2026-10-16')).toBe(true)
    expect(activeOn(day, '2026-10-17')).toBe(false)
  })
})

describe('toBlocks', () => {
  it('returns nothing for no entries', () => {
    expect(toBlocks([])).toEqual([])
  })

  it('merges consecutive periods of the same class into one block', () => {
    const es = [entry({ period_no: 5 }), entry({ period_no: 6 }), entry({ period_no: 7 })]
    const blocks = toBlocks(es)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].periods).toEqual([5, 6, 7])
    expect(blocks[0].entry).toBe(es[0])
    expect(blocks[0].entries).toEqual(es)
    expect(blocks[0].key).toBe('II CSE-A|ds|ALL||5')
  })

  it('breaks a block at a gap', () => {
    expect(shape(toBlocks([entry({ period_no: 1 }), entry({ period_no: 2 }), entry({ period_no: 4 })])).map(b => b.periods))
      .toEqual([[1, 2], [4]])
  })

  it('keeps different subjects apart', () => {
    const blocks = toBlocks([entry({ period_no: 1 }), entry({ period_no: 2, subject_id: 'dbms' }), entry({ period_no: 3 })])
    expect(shape(blocks).map(b => [b.subject, b.periods])).toEqual([['ds', [1]], ['dbms', [2]], ['ds', [3]]])
  })

  it('merges by label when there is no subject', () => {
    const blocks = toBlocks([entry({ period_no: 7, subject_id: null, label: 'Library' }), entry({ period_no: 8, subject_id: null, label: 'Library' })])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].periods).toEqual([7, 8])
  })

  it('sorts by section then period, and keeps sections apart', () => {
    const blocks = toBlocks([
      entry({ period_no: 2, section: 'II CSE-B' }),
      entry({ period_no: 2 }),
      entry({ period_no: 1, section: 'II CSE-B' }),
      entry({ period_no: 1 }),
    ])
    expect(shape(blocks).map(b => [b.section, b.periods])).toEqual([['II CSE-A', [1, 2]], ['II CSE-B', [1, 2]]])
  })

  it('does not mutate its input', () => {
    const es = [entry({ period_no: 2 }), entry({ period_no: 1 })]
    const before = es.map(e => e.id)
    toBlocks(es)
    expect(es.map(e => e.id)).toEqual(before)
  })

  it('keeps different audiences in the same period as separate blocks', () => {
    const blocks = toBlocks([
      entry({ period_no: 3, audience: 'BATCH', audience_value: '1' }),
      entry({ period_no: 3, audience: 'BATCH', audience_value: '2' }),
    ])
    expect(shape(blocks)).toEqual([
      { section: 'II CSE-A', subject: 'ds', audience: 'BATCH1', periods: [3] },
      { section: 'II CSE-A', subject: 'ds', audience: 'BATCH2', periods: [3] },
    ])
  })

  it('does not confuse audience values that share a prefix', () => {
    const blocks = toBlocks([
      entry({ period_no: 3, audience: 'BATCH', audience_value: '1' }),
      entry({ period_no: 4, audience: 'BATCH', audience_value: '12' }),
    ])
    expect(blocks).toHaveLength(2)
  })

  it('merges each batch of a split lab across periods, even when batches share every period', () => {
    // Two batches in different labs for periods 5–7, in the order the database returns them
    // (by period, batches interleaved).
    const es = [5, 6, 7].flatMap(p => [
      entry({ period_no: p, subject_id: 'ds-lab', audience: 'BATCH', audience_value: '1' }),
      entry({ period_no: p, subject_id: 'dbms-lab', audience: 'BATCH', audience_value: '2' }),
    ])
    expect(shape(toBlocks(es))).toEqual([
      { section: 'II CSE-A', subject: 'ds-lab', audience: 'BATCH1', periods: [5, 6, 7] },
      { section: 'II CSE-A', subject: 'dbms-lab', audience: 'BATCH2', periods: [5, 6, 7] },
    ])
  })

  it('merges verticals of the same section running side by side', () => {
    const es = [1, 2].flatMap(p => [
      entry({ period_no: p, subject_id: 'aiml', audience: 'VERTICAL', audience_value: 'AIML' }),
      entry({ period_no: p, subject_id: 'fsd', audience: 'VERTICAL', audience_value: 'FSD' }),
      entry({ period_no: p, subject_id: 'aiml', audience: 'VERTICAL', audience_value: 'AIML', section: 'III CSE-B' }),
    ])
    expect(shape(toBlocks(es)).map(b => [b.section, b.audience, b.periods])).toEqual([
      ['II CSE-A', 'VERTICALAIML', [1, 2]],
      ['II CSE-A', 'VERTICALFSD', [1, 2]],
      ['III CSE-B', 'VERTICALAIML', [1, 2]],
    ])
  })

  it('splits a split-lab block at a gap for one batch only', () => {
    const es = [
      entry({ period_no: 1, audience: 'BATCH', audience_value: '1' }),
      entry({ period_no: 1, audience: 'BATCH', audience_value: '2' }),
      entry({ period_no: 2, audience: 'BATCH', audience_value: '2' }),
      entry({ period_no: 3, audience: 'BATCH', audience_value: '1' }),
    ]
    expect(shape(toBlocks(es)).map(b => [b.audience, b.periods])).toEqual([
      ['BATCH1', [1]], ['BATCH2', [1, 2]], ['BATCH1', [3]],
    ])
  })

  it('gives every block a unique key', () => {
    const es = [1, 2, 4].flatMap(p => [
      entry({ period_no: p, audience: 'BATCH', audience_value: '1' }),
      entry({ period_no: p, audience: 'BATCH', audience_value: '2' }),
    ])
    const keys = toBlocks(es).map(b => b.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('eligibility', () => {
  it('shows no status before any class', () => {
    expect(eligibility(null)).toEqual({ code: '—', label: 'No classes yet', tone: 'none' })
    expect(eligibility(NaN).tone).toBe('none')
  })

  it.each([
    [100, 'VG', 'ok'], [95, 'VG', 'ok'], [94.5, 'VG', 'ok'], [94.4, 'G', 'ok'],
    [85, 'G', 'ok'], [84.5, 'G', 'ok'], [84.4, 'S', 'ok'],
    [75, 'S', 'ok'], [74.5, 'S', 'ok'], [74.4, 'C', 'warn'],
    [65, 'C', 'warn'], [64.5, 'C', 'warn'], [64.4, 'SA', 'bad'], [0, 'SA', 'bad'],
  ])('%f%% → %s (%s)', (pct, code, tone) => {
    expect(eligibility(pct)).toMatchObject({ code, tone })
  })

  it('rounds 74.5 up to 75 and treats it as eligible', () => {
    expect(eligibility(74.5)).toEqual({ code: 'S', label: 'Satisfactory', tone: 'ok' })
  })

  it('honours configured thresholds', () => {
    expect(eligibility(72, 70, 60)).toMatchObject({ code: 'S', tone: 'ok' })
    expect(eligibility(78, 80, 70)).toMatchObject({ code: 'C', tone: 'warn' })
    expect(eligibility(68, 80, 70)).toMatchObject({ code: 'SA', tone: 'bad' })
  })

  it('has a style for every tone', () => {
    for (const pct of [null, 100, 70, 10]) expect(TONE[eligibility(pct).tone]).toBeTruthy()
  })
})
