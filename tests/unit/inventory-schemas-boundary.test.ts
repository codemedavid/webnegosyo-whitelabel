/**
 * Regression: inventory Zod input schemas must live in a pure module so the
 * client-side form helpers (inventory-form, recipe-form) — which are imported
 * by 'use client' components — can consume them WITHOUT dragging the
 * server-only inventory services (which import '@/lib/supabase/server' and
 * '@/lib/admin-service') into the client bundle.
 *
 * Before the fix, `inventory-form.ts` imported schema VALUES from
 * `ingredients-service`/`units-service`, and `recipe-form.ts` from
 * `recipes-service`, causing the Turbopack production build to fail with
 * "You're importing a component that needs 'next/headers'/'server-only'".
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const LIB = join(process.cwd(), 'src', 'lib', 'inventory')

function read(file: string): string {
  return readFileSync(join(LIB, file), 'utf8')
}

describe('inventory schema/service client boundary', () => {
  it('pure schemas module does not import server-only code', () => {
    const src = read('schemas.ts')
    const importLines = src.match(/^import[^\n]*$/gm) ?? []
    for (const line of importLines) {
      expect(line).not.toMatch(/supabase\/server/)
      expect(line).not.toMatch(/admin-service/)
      expect(line).not.toMatch(/server-only/)
    }
  })

  it('inventory-form imports schema values from the pure schemas module, not the services', () => {
    const src = read('inventory-form.ts')
    expect(src).not.toMatch(/from '@\/lib\/inventory\/(ingredients|units)-service'/)
    expect(src).toMatch(/from '@\/lib\/inventory\/schemas'/)
  })

  it('recipe-form imports the schema value from the pure schemas module', () => {
    const src = read('recipe-form.ts')
    expect(src).toMatch(/import \{[^}]*recipeInputSchema[^}]*\} from '@\/lib\/inventory\/schemas'/)
  })

  it('recipe-form only references recipes-service via a type-only import (no runtime edge)', () => {
    const src = read('recipe-form.ts')
    const serviceImports = src.match(/^import[^\n]*from '@\/lib\/inventory\/recipes-service'/gm) ?? []
    for (const line of serviceImports) {
      expect(line).toMatch(/^import type /)
    }
  })
})
