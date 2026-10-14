import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OWL_MARKUP } from '@/components/mascot/owl-art.generated'
import { OWL_PARTS, owlMarkup, prefixIds, toLite } from '@/components/mascot/owl-markup'

const idsIn = (markup: string) => [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
const refsIn = (markup: string) => [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])

describe('owl art (generated)', () => {
  it('has every rigged part the animations target', () => {
    for (const part of OWL_PARTS) {
      expect(OWL_MARKUP).toContain(`class="o-${part}"`)
    }
  })

  it('resolves every url(#…) reference to an element in the art', () => {
    const ids = new Set(idsIn(OWL_MARKUP))
    const missing = refsIn(OWL_MARKUP).filter((ref) => !ids.has(ref))
    expect(missing).toEqual([])
  })

  it('never puts a transform attribute on a rigged group (animations would fight it)', () => {
    const riggedWithTransform = OWL_MARKUP.match(/<g [^>]*class="o-[^"]*"[^>]*\stransform="/g)
    expect(riggedWithTransform).toBeNull()
  })

  it('is the same art as public/assistant/owl-mascot.svg (both come from one build)', () => {
    const svg = readFileSync(join(process.cwd(), 'public/assistant/owl-mascot.svg'), 'utf8')
    const squash = (s: string) => s.replace(/\s+/g, ' ')
    expect(squash(svg)).toContain(squash(OWL_MARKUP).trim())
  })
})

describe('prefixIds', () => {
  it('prefixes every id and every reference to it', () => {
    const out = prefixIds(OWL_MARKUP, 'a1')
    expect(idsIn(out).every((id) => id.startsWith('a1-'))).toBe(true)
    expect(refsIn(out).every((ref) => ref.startsWith('a1-'))).toBe(true)
  })

  it('gives two owls on one page no shared ids', () => {
    const first = new Set(idsIn(prefixIds(OWL_MARKUP, 'a1')))
    const shared = idsIn(prefixIds(OWL_MARKUP, 'b2')).filter((id) => first.has(id))
    expect(shared).toEqual([])
  })
})

describe('toLite', () => {
  it('drops every blurred element, leaving no filter references', () => {
    const lite = toLite(OWL_MARKUP)
    expect(lite).not.toContain('o-soft')
    expect(lite).not.toMatch(/filter="url\(/)
    expect(lite.length).toBeLessThan(OWL_MARKUP.length)
  })

  it('keeps every rigged part', () => {
    const lite = toLite(OWL_MARKUP)
    for (const part of OWL_PARTS) expect(lite).toContain(`class="o-${part}"`)
  })
})

describe('owlMarkup', () => {
  it('is prefixed and, when lite, filter-free', () => {
    const out = owlMarkup({ prefix: 'z9', isLite: true })
    expect(idsIn(out).every((id) => id.startsWith('z9-'))).toBe(true)
    expect(out).not.toMatch(/filter="url\(/)
  })
})
