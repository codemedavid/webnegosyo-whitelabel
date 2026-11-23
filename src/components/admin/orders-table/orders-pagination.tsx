'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OrdersPaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPage: (page: number) => void
}

const STEP =
  'inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-[13.5px] font-semibold text-wn-ink ring-1 ring-wn-line bg-white outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink disabled:pointer-events-none disabled:opacity-40'

export function OrdersPagination({ page, pageSize, totalCount, totalPages, onPage }: OrdersPaginationProps) {
  if (totalCount === 0) return null
  const from = Math.min(totalCount, (page - 1) * pageSize + 1)
  const to = Math.min(totalCount, page * pageSize)
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13.5px] text-wn-stone tabular-nums">
        {from > totalCount || page > totalPages ? (
          <>Nothing on this page · {totalCount} in all</>
        ) : (
          <>
            Showing <span className="font-semibold text-wn-ink">{from}–{to}</span> of {totalCount}
          </>
        )}
      </p>
      {(totalPages > 1 || page > 1) && (
        <div className="flex items-center gap-2">
          <button type="button" className={STEP} disabled={page <= 1} onClick={() => onPage(Math.min(page - 1, totalPages))}>
            <ChevronLeft aria-hidden className="size-4" />
            Newer
          </button>
          <span className={cn('min-w-16 text-center text-[13.5px] text-wn-stone tabular-nums')}>
            {page} / {totalPages}
          </span>
          <button type="button" className={STEP} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Older
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </nav>
  )
}
