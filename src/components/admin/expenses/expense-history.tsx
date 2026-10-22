import { Ban, CirclePlus, Inbox, Replace } from 'lucide-react'
import type { Expense, ExpenseCategory } from '@/lib/expenses/types'
import { formatPeso, stampLabel } from './expense-format'

interface HistoryEntry {
  key: string
  icon: typeof CirclePlus
  title: string
  detail?: string
  at: string | null
  link?: { label: string; expenseId: string }
}

/** The story of one entry, oldest first: recorded, replaced/replacing, voided (plan §5.2). */
export function historyEntries(
  expense: Expense,
  versions: readonly Expense[],
  categoriesById: ReadonlyMap<string, ExpenseCategory>,
): HistoryEntry[] {
  const nameOf = (version: Expense) =>
    `${categoriesById.get(version.categoryId)?.name ?? 'Expense'} ${formatPeso(version.amountCents)}`
  const replaces = expense.replacesExpenseId ? versions.find((version) => version.id === expense.replacesExpenseId) : undefined
  const replacedBy = versions.find((version) => version.replacesExpenseId === expense.id)

  const entries: HistoryEntry[] = [
    {
      key: 'recorded',
      icon: expense.paidFrom === 'drawer' ? Inbox : CirclePlus,
      title: `Recorded by ${expense.createdByName}${expense.paidFrom === 'drawer' ? ' from the drawer' : ''}`,
      at: expense.createdAt,
    },
  ]
  if (expense.replacesExpenseId) {
    entries.push({
      key: 'replaces',
      icon: Replace,
      title: 'Replaces an earlier entry',
      detail: replaces ? `Was ${nameOf(replaces)}${replaces.voidReason ? ` · ${replaces.voidReason}` : ''}` : undefined,
      at: null,
      link: { label: 'Open the earlier entry', expenseId: expense.replacesExpenseId },
    })
  }
  if (expense.status === 'void') {
    entries.push({
      key: 'voided',
      icon: Ban,
      title: 'Voided',
      detail: expense.voidReason ?? undefined,
      at: expense.voidedAt,
    })
  }
  if (replacedBy) {
    entries.push({
      key: 'replaced-by',
      icon: Replace,
      title: 'Replaced by a corrected entry',
      detail: nameOf(replacedBy),
      at: replacedBy.createdAt,
      link: { label: 'Open the corrected entry', expenseId: replacedBy.id },
    })
  }
  return entries
}

interface ExpenseHistoryProps {
  expense: Expense
  versions: readonly Expense[]
  categoriesById: ReadonlyMap<string, ExpenseCategory>
  onOpenVersion: (expenseId: string) => void
}

export function ExpenseHistory({ expense, versions, categoriesById, onOpenVersion }: ExpenseHistoryProps) {
  const entries = historyEntries(expense, versions, categoriesById)
  return (
    <ol className="relative flex flex-col gap-4 border-l border-wn-line pl-5">
      {entries.map((entry) => {
        const Icon = entry.icon
        return (
          <li key={entry.key} className="relative">
            <span className="absolute -left-[31px] top-0 grid size-5 place-items-center rounded-full bg-white ring-1 ring-wn-line">
              <Icon className="size-3 text-wn-stone" aria-hidden />
            </span>
            <p className="text-[14px] font-semibold text-wn-ink">{entry.title}</p>
            {entry.detail && <p className="mt-0.5 text-[13.5px] text-wn-ink/80">{entry.detail}</p>}
            {entry.at && <p className="mt-0.5 text-[12.5px] tabular-nums text-wn-stone">{stampLabel(entry.at)}</p>}
            {entry.link && (
              <button
                type="button"
                onClick={() => onOpenVersion(entry.link!.expenseId)}
                className="mt-1 rounded text-[13px] font-bold text-wn-ink underline decoration-wn-line underline-offset-4 outline-none hover:decoration-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
              >
                {entry.link.label}
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
