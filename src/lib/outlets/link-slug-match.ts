/**
 * Which branch a printed link means.
 *
 * Branch slugs in production carry the store name — `gungjeon-valenzuela`,
 * `cainta-main` — but the merchant painting a link onto signage writes the part
 * that tells the branches apart: `/b/valenzuela`. An exact-match-only rule
 * turns that into silence. The menu opens, no branch is remembered, and
 * checkout asks the customer which branch they are standing in, with nothing
 * anywhere to say the link was the cause.
 *
 * So a link may name a whole SEGMENT of a slug, and only a whole segment.
 * `valenzuela` reaches `gungjeon-valenzuela`; `valen` reaches nothing, because
 * once fragments match, a typo stops being a typo and starts being a branch.
 *
 * The hard limit is uniqueness. `main` against `cainta-main` and `makati-main`
 * resolves to NEITHER — an order attributed to a branch the customer is not
 * standing in is a real operational error, and asking is always available.
 * Ranking a tie would trade a visible question for an invisible mistake.
 *
 * Pure and dependency-free, like the rest of `outlets/`, so the storefront and
 * anything else that resolves a link cannot disagree about what it points at.
 */

/** The one field a link is matched against. */
interface LinkableOutlet {
  slug: string
}

const normalize = (value: string): string => value.trim().toLowerCase()

/** Whether `link` is one of the dash-separated segments of `slug`. */
function hasSegment(slug: string, link: string): boolean {
  return slug.split('-').includes(link)
}

/**
 * The branch a link names, or null when none does — or when more than one could.
 *
 * Callers pass the branches already narrowed to the ones on offer; this does no
 * filtering of its own so that "active" stays defined in one place.
 */
export function matchOutletByLinkSlug<T extends LinkableOutlet>(
  outlets: readonly T[],
  linkSlug: string
): T | null {
  const wanted = normalize(linkSlug)
  if (wanted === '') return null

  // An exact slug always wins, even when it is also a segment of another
  // branch's slug: a branch named `cafe` owns `/b/cafe` outright.
  const exact = outlets.find((outlet) => normalize(outlet.slug) === wanted)
  if (exact) return exact

  const partial = outlets.filter((outlet) => hasSegment(normalize(outlet.slug), wanted))
  return partial.length === 1 ? partial[0] : null
}
