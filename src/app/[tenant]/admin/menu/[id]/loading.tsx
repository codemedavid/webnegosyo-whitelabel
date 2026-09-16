import { Breadcrumbs } from '@/components/shared/breadcrumbs'

/**
 * The edit page's own skeleton.
 *
 * Without it this route inherited `../loading.tsx`, the menu *list* skeleton —
 * so opening a dish flashed a grid of cards, then blanked, then rendered a
 * form. A form-shaped placeholder keeps the layout still while the page's
 * queries resolve.
 */
export default function EditMenuItemLoading() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '#' },
          { label: 'Menu Management', href: '#' },
          { label: 'Edit Item' },
        ]}
      />

      <div className="space-y-2">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-4 rounded-xl border p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>

      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
