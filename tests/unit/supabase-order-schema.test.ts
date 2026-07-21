import { describe, it, expect } from '@jest/globals'
import { ORDER_SCHEMA_BUNDLE } from '@/lib/supabase-order-schema'

const sql = ORDER_SCHEMA_BUNDLE.toLowerCase()

describe('ORDER_SCHEMA_BUNDLE', () => {
  it('is a non-empty SQL string', () => {
    expect(typeof ORDER_SCHEMA_BUNDLE).toBe('string')
    expect(ORDER_SCHEMA_BUNDLE.trim().length).toBeGreaterThan(0)
  })

  it('enables pgcrypto so gen_random_uuid() is available', () => {
    expect(sql).toContain('create extension if not exists pgcrypto')
  })

  it('creates orders, order_items, customers and push_subscriptions tables', () => {
    for (const table of ['orders', 'order_items', 'customers', 'push_subscriptions']) {
      expect(sql).toContain(`create table if not exists public.${table}`)
    }
  })

  it('is idempotent: every table create is guarded by "if not exists"', () => {
    // No bare `create table <name>` without the guard.
    const bareCreate = /create table\s+(?!if not exists)/i.test(ORDER_SCHEMA_BUNDLE)
    expect(bareCreate).toBe(false)
  })

  it('does NOT reference the platform-only app_users table (standalone project)', () => {
    expect(sql).not.toContain('app_users')
  })

  it('does NOT foreign-key to the platform-only tenants table (standalone project)', () => {
    expect(sql).not.toMatch(/references\s+(public\.)?tenants/i)
  })

  it('enables row-level security on the order tables', () => {
    for (const table of ['orders', 'order_items', 'customers']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
    }
  })

  it('drops policies before recreating them so re-deploy is idempotent', () => {
    expect(sql).toContain('drop policy if exists')
  })

  it('adds orders and order_items to the supabase_realtime publication', () => {
    expect(sql).toContain('publication supabase_realtime add table public.orders')
    expect(sql).toContain('publication supabase_realtime add table public.order_items')
  })

  it('includes the per-tenant daily order number function and trigger', () => {
    expect(sql).toContain('daily_order_number')
    expect(sql).toContain('asia/manila')
    expect(sql).toContain('create or replace function')
    expect(sql).toContain('create trigger')
  })

  it('keeps customers PII off any anon/public read path (service-role only)', () => {
    // The customers table must NOT expose a permissive SELECT to anon.
    // We assert there is no policy granting select on customers to anon/public.
    expect(sql).not.toMatch(/create policy[^;]*on public\.customers[^;]*for select[^;]*to (anon|public)/i)
  })
})
