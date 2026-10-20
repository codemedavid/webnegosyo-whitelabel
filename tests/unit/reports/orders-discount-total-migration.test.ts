/**
 * `orders.discount_total` is derived by the database from the stored discount,
 * with the same precedence as `readOrderDiscount`, so SQL reports can sum it.
 * Runs without a database; the live objects are probed after apply
 * (docs/testing/reports-sales-model.tdd.md).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

/** Part 2 hardens part 1 after review; the hotfix in between granted anon. */
const FILES = [
  '20261013090000_orders_discount_total_sync.sql',
  '20261013090010_orders_discount_total_sync_anon_grant.sql',
  '20261013090100_orders_discount_total_hardening.sql',
]
const sql = FILES.map((file) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase()

/** The live trigger body: the last definition wins. */
function triggerBody(): string {
  const start = sql.lastIndexOf('create or replace function public.orders_sync_discount_total()')
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2))
}

describe('orders discount_total sync migration', () => {
  test('reads the column first, then the POS blob, each only with a numeric total (readOrderDiscount)', () => {
    const column = sql.indexOf("jsonb_typeof(p_discount_data -> 'total') = 'number'")
    const blob = sql.indexOf("jsonb_typeof(p_customer_data -> 'discount' -> 'total') = 'number'")
    expect(column).toBeGreaterThan(0)
    expect(blob).toBeGreaterThan(column)
  })

  test('sets the column on every insert and on any change to the payload or the column', () => {
    expect(sql).toContain(
      'create or replace trigger orders_sync_discount_total before insert or update of discount_data, customer_data, discount_total on public.orders for each row',
    )
    expect(triggerBody()).toContain('v_total := public.order_discount_payload_total(new.discount_data, null)')
  })

  test('the column is purely derived: no usable payload, or one out of range, is no discount', () => {
    // A writer (an anon checkout included) cannot store a discount the order does not carry.
    expect(triggerBody()).toContain(
      'new.discount_total := case when v_total is not null and v_total >= 0 and v_total < 99999999.995 then round(v_total, 2) else 0 end',
    )
  })

  test('a register that only wrote the blob has it copied into discount_data', () => {
    expect(triggerBody()).toContain("if tg_op = 'insert' then if public.order_discount_payload_total(new.discount_data, null) is null and v_blob is not null then new.discount_data := v_blob")
    // Only when the blob itself changed: a write carrying an old customer_data
    // after an edit removed the discount must not bring it back.
    expect(triggerBody()).toContain(
      "elsif old.discount_data is null and v_blob is not null and (new.customer_data -> 'discount') is distinct from (old.customer_data -> 'discount') then",
    )
  })

  test('an edit that removes the discount removes the blob too, and resets the column', () => {
    expect(triggerBody()).toContain("new.customer_data := new.customer_data - 'discount'")
  })

  test('a garbled discount never fails the order', () => {
    expect(triggerBody()).not.toContain('raise exception')
  })

  test('the trigger runs as the writer, so every writing role can run its pure helper', () => {
    // Part 1 left anon out: the invoker trigger failed every storefront checkout with 42501.
    expect(sql).toContain('grant execute on function public.order_discount_payload_total(jsonb, jsonb) to anon, authenticated, service_role')
    expect(sql).not.toContain('security definer')
    expect(sql).toContain('revoke all on function public.orders_sync_discount_total() from public, anon, authenticated')
  })

  test('the backfill corrects only the column, without firing order triggers', () => {
    const replica = sql.indexOf('set session_replication_role = replica')
    const update = sql.indexOf("update public.orders o set discount_data = o.customer_data -> 'discount'")
    expect(sql.indexOf('update public.orders o set discount_total')).toBeGreaterThan(update)
    const origin = sql.indexOf('set session_replication_role = origin')
    expect(replica).toBeGreaterThan(0)
    expect(update).toBeGreaterThan(replica)
    expect(origin).toBeGreaterThan(update)
  })
})
