'use client'

import { useState } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertTriangle, Loader2, Plus } from 'lucide-react'

import { makeTempId, type FormQuestion } from '@/lib/page-designer/form-changes'
import { availablePresets, BLANK_QUESTIONS, questionFromPreset, type QuestionPreset } from '@/lib/page-designer/form-presets'
import type { Widget } from '@/lib/hero-builder/types'
import { Group } from '@/components/hero-builder/editor/controls'
import { cn } from '@/lib/utils'

import { useCheckoutFormEditor } from './form-context'
import { QuestionItem } from './question-item'
import type { CheckoutFormEditor } from './use-checkout-form'

function OrderTypeTabs({ form }: { form: CheckoutFormEditor }) {
  return (
    <div role="tablist" aria-label="Order type" className="flex flex-wrap gap-1">
      {form.tabs.map((tab) => {
        const isActive = tab.id === form.activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => form.setActiveId(tab.id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              isActive ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:border-neutral-400',
            )}
          >
            {tab.name}
          </button>
        )
      })}
    </div>
  )
}

/** "Copy questions from Pickup": pick a source, then confirm in place. */
function CopyFrom({ form, activeId }: { form: CheckoutFormEditor; activeId: string }) {
  const [source, setSource] = useState('')
  const others = form.tabs.filter((t) => t.id !== activeId)
  if (!others.length) return null
  const activeName = form.tabs.find((t) => t.id === activeId)?.name ?? 'this order type'
  const sourceName = others.find((t) => t.id === source)?.name
  return (
    <div className="space-y-1.5">
      <select
        aria-label="Copy questions from"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="h-7 w-full cursor-pointer rounded-md border border-neutral-200 bg-white px-2 text-[11px] text-neutral-700"
      >
        <option value="">Copy questions from…</option>
        {others.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {sourceName && (
        <div role="group" aria-label="Copy questions?" className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-900">
          <p>
            Replace {activeName}&apos;s questions with {sourceName}&apos;s ({(form.draft[source] ?? []).length})?
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                form.copyFrom(source, activeId)
                setSource('')
              }}
              className="rounded bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700"
            >
              Copy
            </button>
            <button type="button" onClick={() => setSource('')} className="rounded px-2 py-1 font-semibold hover:bg-amber-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddQuestion({ questions, onAdd }: { questions: readonly FormQuestion[]; onAdd: (preset: QuestionPreset) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const ready = availablePresets(questions)
  const pick = (preset: QuestionPreset) => {
    onAdd(preset)
    setIsOpen(false)
  }
  const item = 'block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-neutral-100'
  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 py-1.5 text-[11px] font-semibold text-neutral-700 hover:border-neutral-500"
      >
        <Plus className="h-3.5 w-3.5" /> Add a question
      </button>
      {isOpen && (
        <div role="menu" aria-label="Add a question" className="mt-1 max-h-72 overflow-y-auto rounded-md border border-neutral-200 bg-white p-1 shadow-sm">
          {ready.length > 0 && <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Ready-made</p>}
          {ready.map((preset) => (
            <button key={preset.id} type="button" role="menuitem" onClick={() => pick(preset)} className={item}>
              <span className="font-medium text-neutral-900">{preset.label}</span>
              {preset.hint && <span className="block text-[10px] text-neutral-500">{preset.hint}</span>}
            </button>
          ))}
          <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Blank</p>
          {BLANK_QUESTIONS.map((preset) => (
            <button key={preset.id} type="button" role="menuitem" onClick={() => pick(preset)} className={item}>
              <span className="font-medium text-neutral-900">{preset.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionList({ form, activeId }: { form: CheckoutFormEditor; activeId: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const questions = form.draft[activeId] ?? []
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const edit = (change: (list: readonly FormQuestion[]) => readonly FormQuestion[]) => form.edit(activeId, change)
  const move = (from: number, to: number) => edit((list) => (to < 0 || to >= list.length ? list : arrayMove([...list], from, to)))
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = questions.findIndex((q) => q.id === active.id)
    const to = questions.findIndex((q) => q.id === over.id)
    if (from >= 0 && to >= 0) move(from, to)
  }
  const add = (question: FormQuestion) => {
    edit((list) => [...list, question])
    setOpenId(question.id)
  }

  return (
    <>
      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-200 px-3 py-4 text-center text-[11px] text-neutral-500">
          No questions yet. Customers order without giving a name or number.
        </p>
      ) : (
        <DndContext id={`form-${activeId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Questions" className="space-y-1.5">
              {questions.map((question, index) => (
                <QuestionItem
                  key={question.id}
                  question={question}
                  index={index}
                  count={questions.length}
                  isOpen={openId === question.id}
                  onToggle={() => setOpenId((id) => (id === question.id ? null : question.id))}
                  onChange={(next) => edit((list) => list.map((q) => (q.id === question.id ? next : q)))}
                  onMove={(to) => move(index, to)}
                  onDuplicate={() =>
                    add({ ...question, id: makeTempId(), field_name: '', field_label: `${question.field_label} (copy)`, options: [...question.options], validation_rules: { ...question.validation_rules } })
                  }
                  onRemove={() => edit((list) => list.filter((q) => q.id !== question.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <AddQuestion questions={questions} onAdd={(preset) => add(questionFromPreset(preset))} />
    </>
  )
}

/**
 * The checkout customer block's Content-tab form editor: the questions each
 * order type asks, saved with Publish (or "Save form now").
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the panel hook point hands every panel its widget; the form is store-wide.
export function CustomerFormPanel(_props: { widget: Widget }) {
  const context = useCheckoutFormEditor()
  if (!context) return null
  const { form, onSaveNow, isSaving } = context
  const activeId = form.activeId

  return (
    <Group title="Questions">
      <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] leading-snug text-amber-900">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        These are your store&apos;s checkout questions — they also show on your standard checkout and the POS.
      </p>
      {!activeId ? (
        <p className="text-[11px] text-neutral-500">Turn on an order type (Store setup → Order types) to ask questions.</p>
      ) : (
        <div className="space-y-2.5">
          <OrderTypeTabs form={form} />
          <p className="text-[11px] text-neutral-500">The page on the left shows this order type&apos;s questions.</p>
          <CopyFrom key={activeId} form={form} activeId={activeId} />
          <QuestionList key={`list-${activeId}`} form={form} activeId={activeId} />
        </div>
      )}
      {form.hasChanges && (
        <div className="space-y-1.5 rounded-md bg-neutral-50 p-2">
          {form.problems.length > 0 ? (
            <ul className="space-y-0.5 text-[11px] text-rose-700" aria-label="Fix before saving">
              {form.problems.slice(0, 3).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-neutral-600">Unsaved question changes. They save with Publish.</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaveNow}
              disabled={isSaving || form.problems.length > 0}
              className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Save form now
            </button>
            <button type="button" onClick={form.discard} disabled={isSaving} className="rounded-md px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100">
              Undo changes
            </button>
          </div>
        </div>
      )}
    </Group>
  )
}
