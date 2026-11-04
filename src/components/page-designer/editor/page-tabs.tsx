'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'
import { PAGE_IDS, PAGE_META } from '@/lib/page-designer/pages'
import type { PageId } from '@/lib/page-designer/types'

/** Switch between the three designed pages. Unpublished edits stay in each page's draft. */
export function PageTabs({ tenantSlug, current }: { tenantSlug: string; current: PageId }) {
  return (
    <nav aria-label="Pages" className="hidden items-center gap-0.5 rounded-lg bg-neutral-100 p-1 lg:flex">
      {PAGE_IDS.map((id) => (
        <Link
          key={id}
          href={`/${tenantSlug}/admin/page-designer/${PAGE_META[id].slug}`}
          aria-current={id === current ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition',
            id === current ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900',
          )}
        >
          {PAGE_META[id].label}
        </Link>
      ))}
    </nav>
  )
}
