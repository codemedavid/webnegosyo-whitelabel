'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  findUnusedIngredients,
  summarizeRecipeCoverage,
  type RecipeCoverageRow,
} from '@/lib/inventory/recipe-coverage'
import type { InventoryItem, RecipeComponent } from '@/types/database'

interface RecipeCoverageTabProps {
  tenantSlug: string
  rows: RecipeCoverageRow[]
  ingredients: InventoryItem[]
  components: RecipeComponent[]
}

/**
 * Which dishes are set up, and which ingredients nothing consumes.
 *
 * A recipe was only ever reachable by opening one dish and scrolling to the
 * bottom of a very long form. Nothing counted them, so a merchant could switch
 * inventory on, create an ingredient, and have no way to discover that the
 * feature does nothing at all until a dish links to it — which is precisely
 * what happened to the first tenant to try.
 *
 * The rules live in `recipe-coverage.ts`; this only renders them.
 */
export function RecipeCoverageTab({
  tenantSlug,
  rows,
  ingredients,
  components,
}: RecipeCoverageTabProps) {
  const summary = summarizeRecipeCoverage(rows)
  const unused = findUnusedIngredients(ingredients, components)

  // A recipe cannot be built before an ingredient exists, so when the shelf is
  // empty that is the only useful instruction — listing dishes to set up would
  // send the merchant to a form they cannot complete.
  if (ingredients.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Add ingredients first</p>
          <p className="mt-1">
            A recipe is built from ingredients, so start on the Ingredients tab. Once you have a
            few, come back here to link them to your dishes.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-medium">
              {summary.covered} of {summary.total} dishes have a recipe
            </p>
            <p className="text-sm text-muted-foreground">
              A dish with no recipe never touches your stock — nothing is deducted when it sells.
            </p>
          </div>
          {summary.uncovered === 0 ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              All set up
            </Badge>
          ) : (
            <Badge variant="destructive">{summary.uncovered} to set up</Badge>
          )}
        </CardContent>
      </Card>

      {unused.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Not used by any recipe
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              These are in stock but nothing consumes them, so their quantity will never change on
              its own.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {unused.map((ingredient) => (
                <Badge key={ingredient.id} variant="outline">
                  {ingredient.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.menuItemId} data-testid={`coverage-row-${row.menuItemId}`}>
            <CardContent className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="text-sm text-muted-foreground">
                  {row.hasRecipe
                    ? `${row.ingredientCount} ingredient${row.ingredientCount === 1 ? '' : 's'}`
                    : 'No recipe — sales will not deduct stock'}
                </p>
              </div>
              <Button asChild variant={row.hasRecipe ? 'ghost' : 'default'} size="sm">
                <Link href={`/${tenantSlug}/admin/menu/${row.menuItemId}`}>
                  {row.hasRecipe ? 'Edit' : 'Set up recipe'}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
