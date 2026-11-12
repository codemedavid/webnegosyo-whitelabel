'use client'

/**
 * Auto-replies tab: each automation as a When → Then card, in the order the
 * bot checks them (first match wins). Drag (or focus the handle and use the
 * arrow keys) to reorder. "Add" opens ready-made recipes.
 */

import { useRef, type Ref } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { RECIPES, ruleFromRecipe, type Recipe } from '@/lib/messenger/recipes'
import { ACTION_LABELS, TRIGGER_LABELS, newDraftRule } from '@/lib/messenger/rule-labels'
import { triggerWhen, type MessengerRule } from '@/lib/messenger/rules'
import { Notice, PanelHeader, SectionLabel, StudioSwitch } from './studio-ui'

interface RulesPanelProps {
  rules: MessengerRule[]
  isCustomized: boolean
  firstCategoryId: string | null
  /** The rule that answered the last test-chat message. */
  answeredRuleId: string | null
  problem: string | null
  onChange: (rules: MessengerRule[]) => void
  onEdit: (rule: MessengerRule) => void
}

/** "Only when" as a chip; nothing for always. */
function WhenChip({ rule }: { rule: MessengerRule }) {
  const only = triggerWhen(rule.trigger)
  if (!only) return null
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${only === 'open' ? 'bg-emerald-50 text-emerald-800' : 'bg-[#E9E5F5] text-[#4B3F7A]'}`}>
      {only === 'open' ? 'Only when open' : 'Only when closed'}
    </span>
  )
}

function TriggerChips({ rule }: { rule: MessengerRule }) {
  const trigger = rule.trigger
  if (trigger.kind !== 'keyword') {
    const label = trigger.kind === 'ice_breaker' ? `Starter: ${trigger.question}` : trigger.kind === 'menu_button' ? `Menu: ${trigger.label}` : TRIGGER_LABELS[trigger.kind].title
    return <span className="rounded-full bg-[#EFECE6] px-2 py-0.5 text-[11px] font-bold text-[#5E574C]">{label}</span>
  }
  const shown = trigger.keywords.slice(0, 3)
  const more = trigger.keywords.length - shown.length
  return (
    <>
      {trigger.match === 'exact' ? <span className="text-[11px] font-bold text-[#8B857B]">exactly</span> : null}
      {shown.map((word) => <span key={word} className="max-w-[120px] truncate rounded-full bg-[#EFECE6] px-2 py-0.5 text-[11px] font-bold text-[#5E574C]">{word}</span>)}
      {more > 0 ? <span className="text-[11px] font-bold text-[#8B857B]">+{more}</span> : null}
      {trigger.keywords.length === 0 ? <span className="text-[11px] font-bold text-red-700">No words yet</span> : null}
    </>
  )
}

function RuleCard({ rule, index, isAnswered, onToggle, onEdit, onDelete }: {
  rule: MessengerRule
  index: number
  isAnswered: boolean
  onToggle: (isOn: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch gap-1.5 rounded-[10px] border bg-white ${isDragging ? 'z-10 border-[#1D1815] shadow-lg' : 'border-[#E5E0D6]'} ${rule.isEnabled ? '' : 'opacity-70'}`}
    >
      <button
        type="button"
        className="flex w-7 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded-l-[10px] text-[#B5AEA2] hover:bg-[#F7F5F0] active:cursor-grabbing"
        aria-label={`Move ${rule.name}. Use arrow keys to move, space to drop.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 py-2.5 text-left">
        <span className="flex items-center gap-2">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-[#1D1815] px-1 text-[10.5px] font-black text-white">{index + 1}</span>
          <span className="truncate text-[13px] font-extrabold text-[#1D1815]">{rule.name}</span>
          {!rule.isEnabled ? <span className="text-[11px] font-bold text-[#8B857B]">· Off</span> : null}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <TriggerChips rule={rule} />
          <WhenChip rule={rule} />
          <span aria-hidden className="px-0.5 text-[12px] font-bold text-[#B5AEA2]">→</span>
          <span className="text-[12px] font-bold text-[#1D1815]">{ACTION_LABELS[rule.action.kind].title}</span>
        </span>
        {isAnswered ? <span className="mt-1.5 inline-block rounded-full bg-[#FBEAE3] px-2 py-0.5 text-[11px] font-bold text-[#B23E1B]">Answered the test message</span> : null}
      </button>
      <div className="flex flex-shrink-0 flex-col items-center justify-between gap-1 py-2.5 pr-2.5">
        <StudioSwitch isOn={rule.isEnabled} onChange={onToggle} label={`${rule.name} on`} />
        <button type="button" onClick={onDelete} aria-label={`Delete ${rule.name}`} className="rounded-md p-1 text-[#B5AEA2] hover:bg-red-50 hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}

function RecipeGallery({ onPick, onBlank, sectionRef }: { onPick: (recipe: Recipe) => void; onBlank: () => void; sectionRef: Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} aria-labelledby="recipes-title" tabIndex={-1} className="scroll-mt-4 outline-none">
      <SectionLabel className="mb-2.5"><span id="recipes-title">Ready to go</span></SectionLabel>
      <ul className="grid grid-cols-1 gap-1.5">
        {RECIPES.map((recipe) => (
          <li key={recipe.id}>
            <button type="button" onClick={() => onPick(recipe)}
              className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[#D9D3C7] bg-white px-3 py-2 text-left hover:border-[#1D1815]">
              <Plus className="h-3.5 w-3.5 flex-shrink-0 text-[#8B857B]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-bold text-[#1D1815]">{recipe.title}</span>
                <span className="block truncate text-[11.5px] text-[#8B857B]">“{recipe.sample}” → {recipe.answer}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={onBlank} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-[12.5px] font-bold text-[#6B655B] hover:bg-white">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Blank automation
          </button>
        </li>
      </ul>
    </section>
  )
}

export function RulesPanel({ rules, isCustomized, firstCategoryId, answeredRuleId, problem, onChange, onEdit }: RulesPanelProps) {
  const galleryRef = useRef<HTMLElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = (event: DragEndEvent) => {
    const from = rules.findIndex((rule) => rule.id === event.active.id)
    const to = rules.findIndex((rule) => rule.id === event.over?.id)
    if (from >= 0 && to >= 0 && from !== to) onChange(arrayMove(rules, from, to))
  }

  return (
    <>
      <PanelHeader
        title="Auto-replies"
        description="When a customer types one of these words, the bot answers. It checks from the top and the first match wins."
        action={(
          <button type="button" onClick={() => { galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); galleryRef.current?.focus({ preventScroll: true }) }}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#1D1815] px-3 text-[12px] font-extrabold text-white hover:opacity-85">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </button>
        )}
      />
      <div className="space-y-5 px-[18px] py-4">
        {!isCustomized ? <Notice>These are the built-in automations. Change anything and save to make them yours.</Notice> : null}
        {problem ? <Notice tone="red">{problem}</Notice> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={rules.map((rule) => rule.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2" aria-label="Automations, checked from the top">
              {rules.map((rule, index) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  index={index}
                  isAnswered={answeredRuleId === rule.id}
                  onToggle={(isEnabled) => onChange(rules.map((entry) => (entry.id === rule.id ? { ...entry, isEnabled } : entry)))}
                  onEdit={() => onEdit(rule)}
                  onDelete={() => onChange(rules.filter((entry) => entry.id !== rule.id))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {rules.length === 0 ? <p className="rounded-[10px] border border-dashed border-[#D9D3C7] p-5 text-center text-[12.5px] text-[#8B857B]">No automations. The bot won’t answer anything.</p> : null}
        <RecipeGallery sectionRef={galleryRef} onPick={(recipe) => onEdit(ruleFromRecipe(recipe))} onBlank={() => onEdit(newDraftRule('keyword', 'text', firstCategoryId))} />
      </div>
    </>
  )
}
