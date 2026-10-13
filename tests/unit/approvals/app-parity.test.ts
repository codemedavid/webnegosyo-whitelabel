/**
 * @jest-environment node
 *
 * The merchant app carries its own copy of the approvals vocabulary (it cannot
 * import from src/). This pins the two together.
 */
import * as web from '@/lib/approvals/types'
import * as webReasons from '@/lib/approvals/reasons'
import * as app from '../../../webnegosyo-app/lib/approvals/types'

describe('approvals vocabulary: web ⇄ app', () => {
  test('kinds and statuses match', () => {
    expect(app.APPROVAL_KINDS).toEqual(web.APPROVAL_KINDS)
    expect(app.APPROVAL_STATUSES).toEqual(web.APPROVAL_STATUSES)
  })

  test('every reason list matches code, label and stock default', () => {
    for (const kind of web.APPROVAL_KINDS) {
      expect(app.REASONS_BY_KIND[kind]).toEqual(webReasons.REASONS_BY_KIND[kind])
    }
    expect(app.DECLINE_REASONS).toEqual(webReasons.DECLINE_REASONS)
  })
})
