/**
 * Offset paging past PostgREST's 1000-row cap, without a strictly serial chain.
 *
 * The first page is read alone: almost every store's window fits in one page,
 * so a small store still costs exactly one query. Only when that page comes
 * back full are the following pages read in concurrent batches, and the result
 * is assembled in PAGE order — the same rows, in the same order, with the same
 * cap and truncation flag the old one-page-at-a-time loop produced. A busy
 * store's 20-page history used to be 20 round trips back to back; it is now
 * 1 + ⌈19 / concurrency⌉.
 *
 * Pages after the first short (or empty) page in a batch are discarded, so a
 * speculative read past the end never adds rows. Any page error fails the whole
 * read: a partial history must never be rendered as a complete one.
 */

export interface PageResponse<T> {
  data: T[] | null
  error: { message: string } | null
}

export type PageReader<T> = (from: number, to: number) => PromiseLike<PageResponse<T>>

export interface PagedReadOptions {
  pageSize: number
  maxRows: number
  /** Pages fetched at once after the first full page. */
  concurrency: number
}

export interface PagedReadResult<T> {
  rows: T[]
  error: string | null
  /** True when `maxRows` was reached with rows possibly still unread. */
  truncated: boolean
}

export async function readPagesConcurrently<T>(
  page: PageReader<T>,
  { pageSize, maxRows, concurrency }: PagedReadOptions,
): Promise<PagedReadResult<T>> {
  const totalPages = Math.ceil(maxRows / pageSize)
  const readPage = (index: number) => page(index * pageSize, index * pageSize + pageSize - 1)

  const first = await readPage(0)
  if (first.error) return { rows: [], error: first.error.message, truncated: false }
  const rows: T[] = [...(first.data ?? [])]
  if (rows.length < pageSize) return { rows, error: null, truncated: false }

  for (let start = 1; start < totalPages; start += concurrency) {
    const indexes = Array.from({ length: Math.min(concurrency, totalPages - start) }, (_, i) => start + i)
    const batch = await Promise.all(indexes.map(readPage))

    const failed = batch.find((result) => result.error)
    if (failed?.error) return { rows: [], error: failed.error.message, truncated: false }

    for (const result of batch) {
      const data = result.data ?? []
      rows.push(...data)
      if (data.length < pageSize) return { rows, error: null, truncated: false }
    }
  }
  return { rows, error: null, truncated: true }
}
