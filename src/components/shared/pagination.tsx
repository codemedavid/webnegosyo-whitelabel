'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalCount: number
}

export function Pagination({ currentPage, totalPages, totalCount }: PaginationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createPageURL = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', pageNumber.toString())
    return `${pathname}?${params.toString()}`
  }

  if (totalPages <= 1) return null

  const showingFrom = (currentPage - 1) * 20 + 1
  const showingTo = Math.min(currentPage * 20, totalCount)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-medium">{showingFrom}</span> to{' '}
        <span className="font-medium">{showingTo}</span> of{' '}
        <span className="font-medium">{totalCount}</span> results
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={createPageURL(currentPage - 1)}
          className={currentPage <= 1 ? 'pointer-events-none' : ''}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
        </Link>

        <div className="flex items-center gap-1">
          {currentPage > 2 && (
            <>
              <Link href={createPageURL(1)}>
                <Button variant="outline" size="sm">
                  1
                </Button>
              </Link>
              {currentPage > 3 && <span className="px-2">...</span>}
            </>
          )}

          {currentPage > 1 && (
            <Link href={createPageURL(currentPage - 1)}>
              <Button variant="outline" size="sm">
                {currentPage - 1}
              </Button>
            </Link>
          )}

          <Button variant="default" size="sm">
            {currentPage}
          </Button>

          {currentPage < totalPages && (
            <Link href={createPageURL(currentPage + 1)}>
              <Button variant="outline" size="sm">
                {currentPage + 1}
              </Button>
            </Link>
          )}

          {currentPage < totalPages - 1 && (
            <>
              {currentPage < totalPages - 2 && <span className="px-2">...</span>}
              <Link href={createPageURL(totalPages)}>
                <Button variant="outline" size="sm">
                  {totalPages}
                </Button>
              </Link>
            </>
          )}
        </div>

        <Link
          href={createPageURL(currentPage + 1)}
          className={currentPage >= totalPages ? 'pointer-events-none' : ''}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  )
}


