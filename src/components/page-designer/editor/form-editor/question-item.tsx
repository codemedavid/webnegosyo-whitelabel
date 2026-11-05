'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, ChevronDown, Copy, GripVertical, Trash2 } from 'lucide-react'

import { FIELD_TYPE_LABELS } from '@/lib/checkout-field-types'
import { isDeliveryAddressField, isTableNumberField } from '@/lib/checkout-field-presets'
import type { FormQuestion } from '@/lib/page-designer/form-changes'
import { cn } from '@/lib/utils'

import { QuestionEditor } from './question-editor'

interface QuestionItemProps {
  question: FormQuestion
  index: number
  count: number
  isOpen: boolean
  onToggle: () => void
  onChange: (next: FormQuestion) => void
  onMove: (to: number) => void
  onDuplicate: () => void
  onRemove: () => void
}

function kindLabel(question: FormQuestion): string {
  if (isDeliveryAddressField(question)) return 'Delivery address'
  if (isTableNumberField(question)) return 'Table number'
  return FIELD_TYPE_LABELS[question.field_type]
}

const iconButton = 'rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent'

/** One question in the list: drag it, move it, tap it open to edit it. Delete asks in place. */
export function QuestionItem({ question, index, count, isOpen, onToggle, onChange, onMove, onDuplicate, onRemove }: QuestionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id })
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const label = question.field_label.trim() || 'Untitled question'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('rounded-lg border bg-white', isDragging ? 'z-10 border-sky-400 shadow-lg' : 'border-neutral-200', isOpen && 'border-neutral-300')}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button type="button" aria-label={`Drag "${label}"`} className={cn(iconButton, 'cursor-grab touch-none')} {...attributes} {...listeners}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-medium text-neutral-900">
            {label}
            {question.is_required && <span className="ml-0.5 text-rose-600" aria-label="required">*</span>}
          </span>
          <span className="block truncate text-[10px] text-neutral-500">{kindLabel(question)}</span>
        </button>
        <button type="button" aria-label={`Move "${label}" up`} disabled={index === 0} onClick={() => onMove(index - 1)} className={iconButton}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label={`Move "${label}" down`} disabled={index === count - 1} onClick={() => onMove(index + 1)} className={iconButton}>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform', isOpen ? 'rotate-0' : '-rotate-90')} aria-hidden />
      </div>
      {isOpen && (
        <div className="space-y-3 border-t border-neutral-100 px-3 py-3">
          <QuestionEditor question={question} onChange={onChange} />
          {isConfirmingDelete ? (
            <div role="group" aria-label="Delete this question?" className="rounded-md bg-rose-50 p-2 text-[11px] text-rose-900">
              <p className="font-medium">Delete “{label}”? Answers already given stay on their orders.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={onRemove} className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700">
                  Delete
                </button>
                <button type="button" onClick={() => setIsConfirmingDelete(false)} className="rounded px-2 py-1 font-semibold text-rose-900 hover:bg-rose-100">
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={onDuplicate} className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 hover:text-neutral-900">
                <Copy className="h-3 w-3" /> Duplicate
              </button>
              <button type="button" onClick={() => setIsConfirmingDelete(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900">
                <Trash2 className="h-3 w-3" /> Delete question
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
