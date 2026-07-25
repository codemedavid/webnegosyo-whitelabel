# TDD Evidence — Inventory schemas client/server boundary fix

## Source

Derived during this TDD run while unblocking the failing Vercel deployment on
PR #22 (`feat/unified-modifier-groups` → `main`). No `*.plan.md` was supplied.

## Problem (RED — compile/build time)

The Turbopack production build (`next build --turbopack`) failed with 3 errors:

```
./src/lib/imagekit-server.ts:1:1  — importing a component that needs "server-only"
./src/lib/supabase/server.ts:2:1  — importing a component that needs "next/headers"
./src/lib                          — 'server-only' cannot be imported from a Client Component module
```

Root cause: the client-only inventory form helpers imported Zod **schema values**
from the server-backed services, dragging server code into the client bundle:

```
inventory-manager.tsx ('use client')
  → src/lib/inventory/inventory-form.ts
      → import { ingredientInputSchema } from '.../ingredients-service'  ← value import
      → import { unitInputSchema }       from '.../units-service'        ← value import
          → import { createClient } from '@/lib/supabase/server'  (next/headers)
          → import { verifyTenantPermission } from '@/lib/admin-service' (server-only)

modifier-option-recipe-editor.tsx ('use client')
  → src/lib/inventory/recipe-form.ts
      → import { recipeInputSchema } from '.../recipes-service'          ← value import
          → (same server-only chain)
```

## Fix (GREEN)

Extracted the four Zod input schemas into a **pure** module with no server
imports: `src/lib/inventory/schemas.ts`
(`unitInputSchema`, `ingredientInputSchema`, `recipeComponentInputSchema`,
`recipeInputSchema` + inferred types).

- The three services now import the schemas from `schemas.ts` for internal
  `.parse(...)` use and **re-export** them, keeping their public API unchanged.
- `inventory-form.ts` and `recipe-form.ts` import schema **values** from
  `schemas.ts`. `recipe-form.ts` keeps `RecipeWithComponents` as a **type-only**
  import from `recipes-service` (erased at compile — no runtime edge).

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Pure schemas module has no server-only import | `tests/unit/inventory-schemas-boundary.test.ts` | unit | PASS | `npx jest inventory-schemas-boundary` |
| 2 | `inventory-form` imports schemas from the pure module, not the services | same file | unit | PASS | same |
| 3 | `recipe-form` imports the schema value from the pure module | same file | unit | PASS | same |
| 4 | `recipe-form` references `recipes-service` only via `import type` (no runtime edge) | same file | unit | PASS | same |
| 5 | Existing inventory form/service behavior unchanged | `inventory-form.test.ts`, `recipe-form.test.ts`, `inventory-units-service.test.ts` | unit | PASS | `npm run test` |

## Validation commands actually run

- RED: `npm run build` → `Turbopack build failed with 3 errors` (see above)
- RED (unit): `npx jest tests/unit/inventory-schemas-boundary.test.ts` → 3 failing before fix
- GREEN (unit): `npx jest tests/unit/inventory-schemas-boundary.test.ts` → **4 passed**
- GREEN (build): `npm run build` → `✓ Compiled successfully in 36.8s`, `✓ Generating static pages (31/31)`, exit 0
- Full suite: `npm run test` → 2099 passed / 3 failed

## Known gaps

- 3 pre-existing failures unrelated to this change, in the merchant admin app:
  `webnegosyo-app/lib/printer-native-load.test.ts` and
  `webnegosyo-app/lib/order-item-images.test.ts` (jest mock-hoisting in those
  test setups). Not touched by this branch; not caused by this fix.
