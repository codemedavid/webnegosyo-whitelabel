/**
 * A printed branch link should name the branch the way a person would.
 *
 * Merchants write these links by hand onto signage and QR codes, and they
 * write the part that distinguishes the branch — `/b/valenzuela`, not
 * `/b/gungjeon-valenzuela`. Today only an exact slug match resolves, so the
 * shorter form silently resolves to nothing: the menu opens, no branch is
 * remembered, and checkout asks which branch the customer is standing in. The
 * merchant gets no signal at all that the link they printed is wrong.
 *
 * These tests pin the tolerant rule and, more importantly, its limit: a link
 * resolves only when EXACTLY ONE active branch can be meant. Two candidates is
 * not a near-miss to be broken by ranking — attributing an order to the wrong
 * branch is a real operational error — so ambiguity still asks.
 */

import { matchOutletByLinkSlug } from '@/lib/outlets/link-slug-match'

interface TestOutlet {
  id: string
  slug: string
}

const outlets = (...slugs: string[]): TestOutlet[] =>
  slugs.map((slug) => ({ id: `o-${slug}`, slug }))

describe('matching a branch link to a branch', () => {
  it('matches an exact slug', () => {
    // Arrange
    const branches = outlets('gungjeon-cafe', 'gungjeon-valenzuela')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'gungjeon-cafe')

    // Assert
    expect(matched?.slug).toBe('gungjeon-cafe')
  })

  it('matches the distinctive tail of a slug', () => {
    // Arrange: the merchant printed /b/valenzuela for gungjeon-valenzuela.
    const branches = outlets('gungjeon-cafe', 'gungjeon-valenzuela', 'central-cignal')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'valenzuela')

    // Assert
    expect(matched?.slug).toBe('gungjeon-valenzuela')
  })

  it('matches the distinctive head of a slug', () => {
    // Arrange
    const branches = outlets('cainta-main', 'makati-bgc')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'cainta')

    // Assert
    expect(matched?.slug).toBe('cainta-main')
  })

  it('prefers an exact match over a partial one', () => {
    // Arrange: `cafe` is a branch in its own right AND the tail of another.
    const branches = outlets('cafe', 'gungjeon-cafe')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'cafe')

    // Assert
    expect(matched?.slug).toBe('cafe')
  })

  it('refuses to guess when two branches could be meant', () => {
    // Arrange: `main` is the tail of both. Picking either would attribute the
    // order to a branch the customer is not standing in.
    const branches = outlets('cainta-main', 'makati-main')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'main')

    // Assert
    expect(matched).toBeNull()
  })

  it('ignores case and surrounding whitespace', () => {
    // Arrange
    const branches = outlets('gungjeon-valenzuela')

    // Act
    const matched = matchOutletByLinkSlug(branches, '  VALENZUELA  ')

    // Assert
    expect(matched?.slug).toBe('gungjeon-valenzuela')
  })

  it('does not match a fragment that is not a whole segment', () => {
    // Arrange: `valen` is a prefix of a segment, not a segment. Loosening this
    // far would let one typo silently pick a branch.
    const branches = outlets('gungjeon-valenzuela')

    // Act
    const matched = matchOutletByLinkSlug(branches, 'valen')

    // Assert
    expect(matched).toBeNull()
  })

  it('returns null for an empty link', () => {
    // Arrange
    const branches = outlets('gungjeon-cafe')

    // Act & Assert
    expect(matchOutletByLinkSlug(branches, '')).toBeNull()
    expect(matchOutletByLinkSlug(branches, '   ')).toBeNull()
  })

  it('returns null when there are no branches', () => {
    // Act & Assert
    expect(matchOutletByLinkSlug([], 'valenzuela')).toBeNull()
  })
})
