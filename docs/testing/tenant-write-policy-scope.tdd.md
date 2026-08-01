# Tenant write policies that never checked the tenant

**Branch:** `feat/platform-supabase-order-parity`
**Checkpoints:** `36d8add` (RED) → `7dc4b51` (GREEN)
**Source:** no plan file; found while writing the `facebook_pages` policy in
`docs/testing/facebook-token-exposure.tdd.md` and declining to copy the pattern.

## The defect

Five `*_write_admin` RLS policies were written as:

```sql
au.role = 'admin' AND au.tenant_id = au.tenant_id
```

The right-hand side is the same column as the left, so the comparison is always
true and the policy collapses to "is the caller any admin at all". Affected:
`categories`, `customer_form_fields`, `menu_items`, `order_types`,
`payment_methods`.

Every merchant admin surface writes through the SSR client as `authenticated`,
so RLS was the only thing standing between two tenants. Any merchant admin
could insert, update or delete another tenant's menu, categories, order types,
payment methods and checkout form fields.

## User journeys

- As a merchant, I want another merchant to be unable to edit or delete my menu,
  so my storefront cannot be tampered with.
- As a platform admin, I want to keep editing any tenant from the superadmin
  console, so the fix does not cost me the ability to support merchants.

## Task report

**Scope the policies to the row's tenant (`36d8add` → `7dc4b51`).**

A contract test asserts the corrective migration compares the admin's tenant to
each table's own `tenant_id`, redefines rather than shadows each policy, states
`WITH CHECK` explicitly, and keeps the superadmin branch.

- Validation: `npx jest tests/unit/tenant-write-policies-scope-to-row-tenant.test.ts`
- RED: 12 failed, 0 passed — `ENOENT`, the corrective migration did not exist.
- GREEN: 17 passed.
- Full suite: `npx jest` → 378 suites, 4,671 tests passed.

Two assertions were corrected after the first GREEN run, both test-side and
neither masking a defect: the anti-pattern scan now strips SQL comments,
because the migration quotes the broken predicate in order to explain it; and
the superadmin count expects two occurrences per table now that `WITH CHECK` is
written out instead of defaulting to `USING`.

## Live database evidence

Applied via MCP as migration `fix_tenant_write_policy_scope`, then re-probed
`pg_policies`:

| table | self-comparison in USING | self-comparison in WITH CHECK | scoped to row tenant | superadmin kept |
|---|---|---|---|---|
| `categories` | false | false | true | true |
| `customer_form_fields` | false | false | true | true |
| `menu_items` | false | false | true | true |
| `order_types` | false | false | true | true |
| `payment_methods` | false | false | true | true |

Before the change every row of that table read `true` in the first two columns.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | No policy compares the admin tenant to itself | `...:never compares the admin tenant to itself` | unit | PASS |
| 2 | Each of the five policies is scoped to its own table's tenant | `...:scopes the %s write policy...` (×5) | unit | PASS |
| 3 | Each policy is redefined, not shadowed | `...:redefines the %s policy...` (×5) | unit | PASS |
| 4 | An INSERT is judged on the row being written | `...:judges an inserted %s row...` (×5) | unit | PASS |
| 5 | Superadmins still write across tenants | `...:keeps superadmin able to write across tenants` | unit | PASS |
| 6 | Live policies carry no self-comparison | `pg_policies` probe (table above) | integration | PASS |

## Coverage and known gaps

The guarantee is a database policy, so the CI-runnable half is a contract test
over the migration SQL; the live half is the `pg_policies` probe recorded above
and re-runnable at any time. There is no test that signs in as two different
merchant admins and attempts a cross-tenant write — that would need seeded auth
users, and is the honest gap here.

## Not applied: the Facebook token migration

`20260815120000_facebook_pages_and_messenger_sessions_rls.sql` remains
**unapplied on purpose**. Production still runs the code that reads Facebook
tokens through the anon-role SSR client; revoking that grant before the branch
deploys would stop orders and auto-replies reaching merchants. See
`docs/testing/facebook-token-exposure.tdd.md` for the required order.
