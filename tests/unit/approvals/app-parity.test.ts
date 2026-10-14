/**
 * @jest-environment node
 *
 * The merchant app carries its own copy of the approvals vocabulary (it cannot
 * import from src/). This pins the two together.
 */
import * as web from '@/lib/approvals/types'
import * as webReasons from '@/lib/approvals/reasons'
import * as app from '../../../webnegosyo-app/lib/approvals/types'
import fs from 'node:fs'
import path from 'node:path'

const HARDENING = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261012170300_approvals_hardening.sql'), 'utf8')

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

  test('the register refund refusal text is the same in SQL, web and app', () => {
    expect(app.REFUND_NEEDS_APPROVAL_MESSAGE).toBe(web.REFUND_NEEDS_APPROVAL_MESSAGE)
    expect(HARDENING).toContain(`raise exception '${web.REFUND_NEEDS_APPROVAL_MESSAGE}' using errcode = '42501'`)
  })
})

describe('approvals hardening migration (20261012170300)', () => {
  test('every refund row, from any role, goes through the guard', () => {
    expect(HARDENING).toMatch(/create trigger order_payments_refund_guard\s+before insert on public\.order_payments\s+for each row\s+when \(new\.kind = 'refund'\)/)
  })
  test('the database refuses discount requests too', () => {
    expect(HARDENING).toContain("if p_kind = 'discount' then\n    return public.approval_refusal('not_supported', 'Discount approvals are coming soon.')")
  })
  test('discount tokens are stored hashed only', () => {
    expect(HARDENING).toContain("'tokenSha256', encode(sha256(convert_to(v_token, 'UTF8')), 'hex')")
    expect(HARDENING).not.toMatch(/'discountToken', replace\(/)
  })
  test('balance refunds are a stored scope, capped at the overpayment, and never write a revision (B1)', () => {
    expect(HARDENING).toContain("check (scope in ('items', 'amount', 'whole', 'balance'))")
    expect(HARDENING).toContain("if v_amount > v_net - v_order.total then")
    expect(HARDENING).toContain("if v_scope = 'balance' and v_amount > v_net - v_order.total then")
    // The revision / total change is written only for items and amount scopes.
    expect(HARDENING.match(/if v_scope in \('items', 'amount'\) then/g)).toHaveLength(2)
  })
  test('the over-limit check applies only to approvals', () => {
    expect(HARDENING).toContain("if p_to = 'approved' and v_cap is not null and v_amount > v_cap then")
  })
})
