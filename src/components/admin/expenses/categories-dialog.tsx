'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, PencilLine, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { GROUP_LABELS, sortCategories } from '@/lib/expenses/categories'
import { EXPENSE_GROUPS, type ExpenseCategory, type ExpenseGroup } from '@/lib/expenses/types'
import { MAX_CATEGORY_ICON_LENGTH, MAX_CATEGORY_NAME_LENGTH } from '@/lib/expenses/validation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryBadge } from './expense-badges'
import { FIELD_INPUT, FIELD_LABEL } from './expense-form-fields'
import { archiveCategory, saveCategory } from './expense-mutations'

/** What each group means for Profit, in the owner's words. */
const GROUP_HINTS: Readonly<Record<ExpenseGroup, string>> = {
  ingredients: 'Food and drink cost',
  staff: 'Labor',
  occupancy: 'Rent',
  utilities: 'Power, water, gas, internet',
  operating: 'Day-to-day running costs',
  admin: 'Permits, accountant, bank',
  other: 'Anything else',
  capex: 'Shown below operating profit',
  not_expense: 'Moves cash only, never lowers Profit',
}

/** Gap between sort orders, so a new category can slot in without renumbering. */
const SORT_STEP = 10

interface CategoriesDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  tenantSlug: string
  categories: readonly ExpenseCategory[]
  onChanged?: () => void
}

interface Draft {
  id?: string
  name: string
  icon: string
  group: ExpenseGroup
  needsNote: boolean
  sortOrder?: number
}

/** The gear: rename, badge, group, "needs a note", order, archive (never delete), add. */
export function CategoriesDialog({ isOpen, onOpenChange, tenantSlug, categories, onChanged }: CategoriesDialogProps) {
  const [local, setLocal] = useState<readonly ExpenseCategory[]>(categories)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isShowingArchived, setIsShowingArchived] = useState(false)

  const sorted = useMemo(() => sortCategories(local), [local])
  const archived = sorted.filter((category) => category.archivedAt !== null)

  function replaceLocal(next: ExpenseCategory): void {
    setLocal((current) => (current.some((entry) => entry.id === next.id) ? current.map((entry) => (entry.id === next.id ? next : entry)) : [...current, next]))
  }

  async function submitDraft(draft: Draft): Promise<void> {
    setIsBusy(true)
    setError(null)
    const result = await saveCategory(tenantSlug, {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name,
      group: draft.group,
      icon: draft.icon,
      needsNote: draft.needsNote,
      ...(draft.sortOrder !== undefined ? { sortOrder: draft.sortOrder } : {}),
    })
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    replaceLocal(result.data)
    setEditing(null)
    toast.success(draft.id ? `Saved ${result.data.name}.` : `Added ${result.data.name}.`)
    onChanged?.()
  }

  async function setArchived(category: ExpenseCategory, isArchived: boolean): Promise<void> {
    setIsBusy(true)
    setError(null)
    const result = await archiveCategory(tenantSlug, { id: category.id, archived: isArchived })
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    replaceLocal(result.data)
    toast.success(isArchived ? `${category.name} archived. Old expenses keep it.` : `${category.name} is back.`)
    onChanged?.()
  }

  /** Swaps with the neighbour in the same group; two writes, refreshed together. */
  async function move(category: ExpenseCategory, direction: -1 | 1): Promise<void> {
    const siblings = sorted.filter((entry) => entry.group === category.group && entry.archivedAt === null)
    const index = siblings.findIndex((entry) => entry.id === category.id)
    const neighbour = siblings[index + direction]
    if (!neighbour) return
    const [first, second] =
      category.sortOrder === neighbour.sortOrder
        ? [neighbour.sortOrder + (direction === -1 ? -1 : 1), category.sortOrder]
        : [neighbour.sortOrder, category.sortOrder]
    setIsBusy(true)
    setError(null)
    const results = await Promise.all([
      saveCategory(tenantSlug, { id: category.id, name: category.name, group: category.group, icon: category.icon, needsNote: category.needsNote, sortOrder: Math.max(0, first) }),
      saveCategory(tenantSlug, { id: neighbour.id, name: neighbour.name, group: neighbour.group, icon: neighbour.icon, needsNote: neighbour.needsNote, sortOrder: Math.max(0, second) }),
    ])
    setIsBusy(false)
    const failed = results.find((result) => !result.ok)
    if (failed && !failed.ok) setError(failed.error)
    results.forEach((result) => result.ok && replaceLocal(result.data))
    onChanged?.()
  }

  function startAdding(group: ExpenseGroup): void {
    const lastInGroup = sorted.filter((entry) => entry.group === group).at(-1)
    setEditing({ name: '', icon: '', group, needsNote: false, sortOrder: (lastInGroup?.sortOrder ?? 0) + SORT_STEP })
    setError(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,860px)] flex-col gap-0 overflow-hidden rounded-2xl border-wn-line p-0 sm:max-w-[640px]">
        <header className="border-b border-wn-line px-6 pb-4 pt-5 pr-12">
          <DialogTitle className="text-[19px] font-extrabold text-wn-ink">Categories</DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px] text-wn-stone">
            Rename them in your own words. The group decides where each one lands in Profit. Used categories are archived, never deleted.
          </DialogDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800 ring-1 ring-red-200">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-6">
            {EXPENSE_GROUPS.map((group) => {
              const items = sorted.filter((entry) => entry.group === group && entry.archivedAt === null)
              const isAddingHere = editing !== null && !editing.id && editing.group === group
              return (
                <section key={group} aria-labelledby={`cat-group-${group}`}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 id={`cat-group-${group}`} className="text-[14px] font-bold text-wn-ink">
                      {GROUP_LABELS[group]} <span className="font-normal text-wn-stone">· {GROUP_HINTS[group]}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => startAdding(group)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Add<span className="sr-only"> to {GROUP_LABELS[group]}</span>
                    </button>
                  </div>
                  <ul className="overflow-hidden rounded-xl ring-1 ring-wn-line">
                    {items.map((category, index) =>
                      editing?.id === category.id ? (
                        <li key={category.id} className="border-b border-wn-line bg-wn-sand/60 p-3 last:border-b-0">
                          <CategoryEditor draft={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={(draft) => void submitDraft(draft)} isBusy={isBusy} />
                        </li>
                      ) : (
                        <li key={category.id} className="flex min-h-12 items-center gap-2.5 border-b border-wn-line px-3 py-1.5 last:border-b-0">
                          <CategoryBadge category={category} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-wn-ink">{category.name}</span>
                            {category.needsNote && <span className="block text-[12px] text-wn-stone">Needs a note</span>}
                          </span>
                          <IconButton label={`Move ${category.name} up`} disabled={isBusy || index === 0} onClick={() => void move(category, -1)}>
                            <ArrowUp className="size-4" aria-hidden />
                          </IconButton>
                          <IconButton label={`Move ${category.name} down`} disabled={isBusy || index === items.length - 1} onClick={() => void move(category, 1)}>
                            <ArrowDown className="size-4" aria-hidden />
                          </IconButton>
                          <IconButton
                            label={`Edit ${category.name}`}
                            disabled={isBusy}
                            onClick={() =>
                              setEditing({ id: category.id, name: category.name, icon: category.icon ?? '', group: category.group, needsNote: category.needsNote, sortOrder: category.sortOrder })
                            }
                          >
                            <PencilLine className="size-4" aria-hidden />
                          </IconButton>
                          <IconButton label={`Archive ${category.name}`} disabled={isBusy} onClick={() => void setArchived(category, true)}>
                            <Archive className="size-4" aria-hidden />
                          </IconButton>
                        </li>
                      ),
                    )}
                    {isAddingHere && (
                      <li className="bg-wn-sand/60 p-3">
                        <CategoryEditor draft={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={(draft) => void submitDraft(draft)} isBusy={isBusy} />
                      </li>
                    )}
                    {items.length === 0 && !isAddingHere && <li className="px-3 py-3 text-[13px] text-wn-stone">None yet.</li>}
                  </ul>
                </section>
              )
            })}
            {archived.length > 0 && (
              <section>
                <button
                  type="button"
                  aria-expanded={isShowingArchived}
                  onClick={() => setIsShowingArchived((shown) => !shown)}
                  className="rounded text-[13.5px] font-bold text-wn-ink underline decoration-wn-line underline-offset-4 outline-none hover:decoration-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
                >
                  {isShowingArchived ? 'Hide' : 'Show'} archived ({archived.length})
                </button>
                {isShowingArchived && (
                  <ul className="mt-2 overflow-hidden rounded-xl ring-1 ring-wn-line">
                    {archived.map((category) => (
                      <li key={category.id} className="flex min-h-12 items-center gap-2.5 border-b border-wn-line px-3 last:border-b-0">
                        <CategoryBadge category={category} />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-wn-stone">
                          {category.name} · {GROUP_LABELS[category.group]}
                        </span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void setArchived(category, false)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
                        >
                          <ArchiveRestore className="size-3.5" aria-hidden />
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-wn-stone outline-none hover:bg-wn-sand hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

interface CategoryEditorProps {
  draft: Draft
  onChange: (draft: Draft) => void
  onCancel: () => void
  onSave: (draft: Draft) => void
  isBusy: boolean
}

function CategoryEditor({ draft, onChange, onCancel, onSave, isBusy }: CategoryEditorProps) {
  const id = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const groupLabelId = `${id}-group`

  function save(): void {
    if (draft.name.trim() === '') {
      setProblem('Name the category.')
      return
    }
    onSave({ ...draft, name: draft.name.trim(), icon: draft.icon.trim() })
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
      className="grid gap-3 sm:grid-cols-[1fr_6rem]"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className={FIELD_LABEL}>
          Name
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          type="text"
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          value={draft.name}
          placeholder="e.g. Ice (Yelo)"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(event) => {
            setProblem(null)
            onChange({ ...draft, name: event.target.value })
          }}
          className={FIELD_INPUT}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-icon`} className={FIELD_LABEL}>
          Badge
        </label>
        <input
          id={`${id}-icon`}
          type="text"
          maxLength={MAX_CATEGORY_ICON_LENGTH}
          value={draft.icon}
          placeholder="IC"
          onChange={(event) => onChange({ ...draft, icon: event.target.value.toUpperCase() })}
          className={`${FIELD_INPUT} text-center font-bold uppercase`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={groupLabelId} className={FIELD_LABEL}>
          Counts as
        </span>
        <Select value={draft.group} onValueChange={(group) => onChange({ ...draft, group: group as ExpenseGroup })}>
          <SelectTrigger aria-labelledby={groupLabelId} className="min-h-11 w-full rounded-xl border-wn-line bg-white data-[size=default]:h-11">
            <SelectValue>{GROUP_LABELS[draft.group]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_GROUPS.map((group) => (
              <SelectItem key={group} value={group}>
                {GROUP_LABELS[group]} · {GROUP_HINTS[group]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-[13.5px] text-wn-ink sm:col-span-1">
        <Checkbox checked={draft.needsNote} onCheckedChange={(checked) => onChange({ ...draft, needsNote: checked === true })} className="size-[18px]" />
        Needs a note
      </label>
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-[12.5px] font-semibold text-red-800 sm:col-span-2">
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center rounded-full px-4 text-[13.5px] font-bold text-wn-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex min-h-10 items-center rounded-full bg-wn-ink px-4 text-[13.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isBusy ? 'Saving…' : draft.id ? 'Save' : 'Add category'}
        </button>
      </div>
    </form>
  )
}
