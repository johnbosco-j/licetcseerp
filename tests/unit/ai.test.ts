import { describe, it, expect } from 'vitest'
import { extractJsonArray } from '@/lib/ai/claude'

describe('extractJsonArray', () => {
  it('reads the array even with text around it', () => {
    expect(extractJsonArray('Here you go:\n[{"Name":"A","Email":"a@licet.ac.in"}]\nDone')).toEqual([{ Name: 'A', Email: 'a@licet.ac.in' }])
  })
  it('returns null for no / broken JSON', () => {
    expect(extractJsonArray('no table here')).toBeNull()
    expect(extractJsonArray('[{"a":1},')).toBeNull()
  })
})
