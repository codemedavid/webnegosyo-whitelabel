'use client'

/**
 * A recipe editor that costs nothing until the merchant opens it.
 *
 * The menu item editor mounts one `RecipeEditor` per add-on and per
 * recipe-stock modifier option. Each fires three server actions on mount, two
 * of which re-read the tenant's whole ingredient and unit catalogs — and Next
 * runs server actions strictly one after another, so a dish with eight
 * add-ons queued roughly thirty sequential round trips the moment the editor
 * hydrated. That was the bulk of the wait merchants reported.
 *
 * Almost none of those rows are ever expanded in a given edit, so the editor
 * is mounted on first open instead. Once mounted it stays mounted, only
 * hidden: collapsing must not discard half-typed lines or pay for the fetch
 * again on re-open.
 */

import { useState } from 'react'
import { ChevronDown, Link2 } from 'lucide-react'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import type { RecipeTarget } from '@/lib/inventory/recipe-target'

interface RecipeDisclosureProps {
  tenantId: string
  tenantSlug: string
  target: RecipeTarget
  /** Heading on the toggle and inside the editor. */
  label: string
  /**
   * Whether this target already has a recipe. Surfaced on the closed row so a
   * linked recipe is not invisible behind a collapsed section — and so a dish
   * that deducts nothing stays obvious at a glance.
   */
  hasRecipe?: boolean
  onSaved?: () => void
}

export function RecipeDisclosure({
  tenantId,
  tenantSlug,
  target,
  label,
  hasRecipe,
  onSaved,
}: RecipeDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [wasOpened, setWasOpened] = useState(false)

  const toggle = () => {
    setWasOpened(true)
    setIsOpen((open) => !open)
  }

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          {hasRecipe && (
            <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Linked
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/*
        `hidden`, not unmounted. Unmounting on collapse would throw away a
        half-typed recipe and pay for the three-action load again on re-open.
      */}
      {wasOpened && (
        <div hidden={!isOpen} className="border-t p-3">
          <RecipeEditor
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            target={target}
            label={label}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  )
}
