import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAcademicState } from '@/lib/semester'
import {
  academicYear,
  cn,
  formatMobile,
  graduationYear,
  needsVertical,
  normalizeMobile,
  safeUrl,
  semesterTerm,
  toTitleCase,
} from '@/lib/utils'

const OCT_2026 = new Date(2026, 9, 16)

describe('academicYear (June–May)', () => {
  it('starts the academic year on 1 June', () => {
    expect(academicYear(new Date(2026, 4, 31))).toBe('2025-2026')
    expect(academicYear(new Date(2026, 5, 1))).toBe('2026-2027')
    expect(academicYear(OCT_2026)).toBe('2026-2027')
    expect(academicYear(new Date(2027, 0, 15))).toBe('2026-2027')
  })

  it('has a short form', () => {
    expect(academicYear(OCT_2026, true)).toBe('2026-27')
    expect(academicYear(new Date(2099, 6, 1), true)).toBe('2099-00')
  })
})

describe('graduationYear', () => {
  it.each([['IV CSE-A', 2027], ['III CSE-B', 2028], ['II CSE-A', 2029], ['I CSE-B', 2030]])(
    '%s graduates in %i (academic year 2026-27)', (section, year) => {
      expect(graduationYear(section, OCT_2026)).toBe(year)
    })

  it('stays the same until the academic year turns over in June', () => {
    expect(graduationYear('IV CSE-A', new Date(2027, 4, 31))).toBe(2027)
    expect(graduationYear('IV CSE-A', new Date(2027, 5, 1))).toBe(2028)
  })

  it('treats unknown sections as first years', () => {
    expect(graduationYear('', OCT_2026)).toBe(2030)
    expect(graduationYear('Alumni', OCT_2026)).toBe(2030)
  })
})

describe('needsVertical (R2024 batches choose a vertical in III year)', () => {
  it('is required in III and IV year for batches graduating 2028 onwards', () => {
    expect(needsVertical('III CSE-A', 2028)).toBe(true)
    expect(needsVertical('III CSE-B', 2029)).toBe(true)
    expect(needsVertical('IV CSE-A', 2028)).toBe(true)
  })

  it('is not required for pre-R2024 batches', () => {
    expect(needsVertical('III CSE-A', 2027)).toBe(false)
    expect(needsVertical('IV CSE-A', 2027)).toBe(false)
  })

  it('is not required in I and II year', () => {
    expect(needsVertical('I CSE-A', 2030)).toBe(false)
    expect(needsVertical('II CSE-B', 2029)).toBe(false)
  })

  it('is not required without a batch year or with an unknown section', () => {
    expect(needsVertical('III CSE-A', null)).toBe(false)
    expect(needsVertical('III CSE-A', undefined)).toBe(false)
    expect(needsVertical('', 2028)).toBe(false)
  })
})

describe('normalizeMobile', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['98765-43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-9876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(0) 98765 43210', '9876543210'],
    ['9123456789', '9123456789'],   // starts with 91 but is already 10 digits
    ['6000000000', '6000000000'],
  ])('%s → %s', (raw, out) => {
    expect(normalizeMobile(raw)).toBe(out)
  })

  it('returns "" for empty input', () => {
    expect(normalizeMobile('')).toBe('')
    expect(normalizeMobile('   ')).toBe('')
    expect(normalizeMobile('-')).toBe('')
    expect(normalizeMobile(null)).toBe('')
    expect(normalizeMobile(undefined)).toBe('')
  })

  it.each([
    '12345',
    '5876543210',          // Indian mobiles start with 6–9
    '0441234567',          // landline
    '98765432101',         // 11 digits without a leading 0
    '915876543210',        // +91 then an invalid number
    '+1 415 555 0100',
    '98765432',
  ])('rejects %s', raw => {
    expect(normalizeMobile(raw)).toBeNull()
  })
})

describe('formatMobile', () => {
  it('splits a 10-digit number 5 + 5', () => {
    expect(formatMobile('9876543210')).toBe('98765 43210')
  })

  it('leaves anything else alone', () => {
    expect(formatMobile('12345')).toBe('12345')
    expect(formatMobile('')).toBe('')
    expect(formatMobile(null)).toBe('')
    expect(formatMobile(undefined)).toBe('')
  })
})

describe('toTitleCase', () => {
  it.each([
    ['JOHN doe', 'John Doe'],
    ['john', 'John'],
    ['A. B. SMITH', 'A. B. Smith'],
    ['mARY  ann', 'Mary  Ann'],
    ['', ''],
  ])('%s → %s', (raw, out) => {
    expect(toTitleCase(raw)).toBe(out)
  })
})

describe('cn', () => {
  it('joins classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2', 'py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c')
  })
})

describe('safeUrl', () => {
  beforeEach(() => { vi.stubGlobal('window', { location: { origin: 'https://cseerp.vercel.app' } }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('allows http and https links', () => {
    expect(safeUrl('https://licet.ac.in/cse')).toBe('https://licet.ac.in/cse')
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
  })

  it('resolves relative links against the app origin', () => {
    expect(safeUrl('/documents/a.pdf')).toBe('https://cseerp.vercel.app/documents/a.pdf')
  })

  it('blocks script, data and other schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl(' JavaScript:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeUrl('file:///etc/passwd')).toBeUndefined()
    expect(safeUrl('mailto:hod@licet.ac.in')).toBeUndefined()
  })

  it('returns undefined for empty or malformed input', () => {
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(null)).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
    expect(safeUrl('http://[::1')).toBeUndefined()
  })
})

describe('semesterTerm', () => {
  beforeEach(() => setAcademicState({ academicYear: null, promotedAt: null }))

  it('is odd from June and even from January', () => {
    expect(semesterTerm(OCT_2026)).toBe('Odd Semester')
    expect(semesterTerm(new Date(2027, 2, 1))).toBe('Even Semester')
  })

  it('stays even in June–December until the year is promoted', () => {
    setAcademicState({ academicYear: '2025-2026', promotedAt: '2025-06-20' })
    expect(semesterTerm(OCT_2026)).toBe('Even Semester')
  })
})
