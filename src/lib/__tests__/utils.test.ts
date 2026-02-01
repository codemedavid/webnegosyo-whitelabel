import { describe, it, expect } from '@jest/globals'
import { cn } from '../utils'

describe('cn utility function', () => {
  it('merges class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2')
  })

  it('handles undefined and null values', () => {
    expect(cn('class1', null, undefined, 'class2')).toBe('class1 class2')
  })

  it('handles empty strings', () => {
    expect(cn('class1', '', 'class2')).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    expect(cn('class1', false && 'class2', true && 'class3')).toBe('class1 class3')
  })

  it('handles arrays of classes', () => {
    expect(cn(['class1', 'class2'])).toBe('class1 class2')
  })

  it('handles objects with boolean values', () => {
    expect(cn({ class1: true, class2: false })).toBe('class1')
  })

  it('merges conflicting tailwind classes (later wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('keeps non-conflicting tailwind classes', () => {
    expect(cn('p-4', 'm-2')).toBe('p-4 m-2')
  })

  it('handles complex scenarios', () => {
    expect(
      cn('base-class', { conditional: true }, ['array1', 'array2'], null)
    ).toBe('base-class conditional array1 array2')
  })
})
