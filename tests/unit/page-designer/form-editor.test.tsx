/**
 * The checkout customer block's form editor: tabs for the enabled order
 * types, a clear warning that these are the store's real questions, add a
 * ready-made or blank question, edit it, move it, delete it (asked in place,
 * never window.confirm), copy another type's questions, and the unsaved
 * state (publish / save now / undo). A save keeps edits made while it was
 * on its way, and the draft survives a reload.
 */

import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'

import { CustomerFormPanel } from '@/components/page-designer/editor/form-editor/customer-form-panel'
import { CheckoutFormProvider, useCheckoutFormPreview } from '@/components/page-designer/editor/form-editor/form-context'
import { useCheckoutForm, type CheckoutFormEditor } from '@/components/page-designer/editor/form-editor/use-checkout-form'
import type { CheckoutFormSource, FormQuestion } from '@/lib/page-designer/form-changes'
import type { Widget } from '@/lib/hero-builder/types'

const PICKUP = '11111111-1111-4111-8111-111111111111'
const DELIVERY = '22222222-2222-4222-8222-222222222222'
const DINE_IN = '33333333-3333-4333-8333-333333333333'

const ask = (id: string, overrides: Partial<FormQuestion> = {}): FormQuestion => ({
  id,
  field_name: id,
  field_label: id,
  field_type: 'text',
  is_required: false,
  placeholder: '',
  options: [],
  validation_rules: {},
  ...overrides,
})

const SOURCE: CheckoutFormSource = {
  orderTypes: [
    { id: PICKUP, name: 'Pickup', type: 'pickup', description: null, isEnabled: true, advanceOrderEnabled: false },
    { id: DELIVERY, name: 'Delivery', type: 'delivery', description: null, isEnabled: true, advanceOrderEnabled: false },
    { id: DINE_IN, name: 'Dine in', type: 'dine_in', description: null, isEnabled: false, advanceOrderEnabled: false },
  ],
  saved: {
    [PICKUP]: [ask('f-name', { field_name: 'customer_name', field_label: 'Name' }), ask('f-notes', { field_name: 'notes', field_label: 'Notes', field_type: 'textarea' })],
    [DELIVERY]: [ask('f-addr', { field_name: 'delivery_address', field_label: 'Address', field_type: 'textarea' })],
    [DINE_IN]: [],
  },
}

const WIDGET = { id: 'w1', kind: 'page-block' } as unknown as Widget
const onSaveNow = jest.fn()
let current: CheckoutFormEditor

function Harness({ source = SOURCE }: { source?: CheckoutFormSource }) {
  const form = useCheckoutForm('t1', source)
  current = form
  return (
    <CheckoutFormProvider value={{ form, onSaveNow, isSaving: false }}>
      <CustomerFormPanel widget={WIDGET} />
    </CheckoutFormProvider>
  )
}

const questionList = () => screen.getByRole('list', { name: 'Questions' })
const labels = () => within(questionList()).getAllByRole('listitem').map((li) => li.querySelector('button[aria-expanded] span')?.textContent?.replace('*', ''))

beforeEach(() => {
  window.localStorage.clear()
  onSaveNow.mockReset()
})

it('warns that these are the store’s real questions and tabs only the enabled order types', () => {
  render(<Harness />)
  expect(screen.getByText(/also show on your standard checkout and the POS/)).toBeInTheDocument()
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Pickup', 'Delivery'])
  expect(labels()).toEqual(['Name', 'Notes'])
  fireEvent.click(screen.getByRole('tab', { name: 'Delivery' }))
  expect(labels()).toEqual(['Address'])
})

it('adds a ready-made question, opened for editing, and the form is unsaved', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Add a question' }))
  const menu = screen.getByRole('menu', { name: 'Add a question' })
  // Name is already asked: not offered again.
  expect(within(menu).queryByRole('menuitem', { name: /^Name$/ })).toBeNull()
  fireEvent.click(within(menu).getByRole('menuitem', { name: /Car plate number/ }))
  expect(labels()).toEqual(['Name', 'Notes', 'Car plate number'])
  expect(screen.getByLabelText('Question')).toHaveValue('Car plate number')
  expect(screen.getByText(/They save with Publish/)).toBeInTheDocument()
  expect(current.hasChanges).toBe(true)
  expect(current.input?.orderTypes[PICKUP].draft[2]).toMatchObject({ field_name: 'plate_number', validation_rules: { pattern: 'plate' } })
})

it('edits a question: words, required, kind, choices, width, checks', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Your name' } })
  fireEvent.change(screen.getByLabelText('Help under the box'), { target: { value: 'As on your ID' } })
  fireEvent.click(screen.getByRole('switch', { name: 'Required' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Half' }))
  fireEvent.change(screen.getByLabelText('Fewest characters'), { target: { value: '2' } })
  const edited = current.draft[PICKUP][0]
  expect(edited).toMatchObject({ field_label: 'Your name', is_required: true, validation_rules: { help: 'As on your ID', width: 'half', minLength: 2 } })

  fireEvent.change(screen.getByDisplayValue('Short answer'), { target: { value: 'choice' } })
  expect(current.draft[PICKUP][0].options).toEqual(['Option 1', 'Option 2'])
  fireEvent.change(screen.getByLabelText('Choice 2'), { target: { value: 'Large' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add a choice' }))
  expect(current.draft[PICKUP][0].options).toEqual(['Option 1', 'Large', ''])
  // A blank choice is simply dropped when saving.
  expect(current.problems.join()).toBe('')
})

it('moves questions up and down', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Move "Notes" up' }))
  expect(labels()).toEqual(['Notes', 'Name'])
  expect(screen.getByRole('button', { name: 'Move "Notes" up' })).toBeDisabled()
  expect(current.input?.orderTypes[PICKUP].draft.map((q) => q.id)).toEqual(['f-notes', 'f-name'])
})

it('deletes only after confirming in place (no window.confirm), and "Keep it" keeps it', () => {
  const confirm = jest.spyOn(window, 'confirm')
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /^Notes/ }))
  fireEvent.click(screen.getByRole('button', { name: /Delete question/ }))
  const ask = screen.getByRole('group', { name: 'Delete this question?' })
  fireEvent.click(within(ask).getByRole('button', { name: 'Keep it' }))
  expect(labels()).toEqual(['Name', 'Notes'])
  fireEvent.click(screen.getByRole('button', { name: /Delete question/ }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Delete this question?' })).getByRole('button', { name: 'Delete' }))
  expect(labels()).toEqual(['Name'])
  expect(confirm).not.toHaveBeenCalled()
})

it('copies another order type’s questions after confirming', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('tab', { name: 'Delivery' }))
  fireEvent.change(screen.getByLabelText('Copy questions from'), { target: { value: PICKUP } })
  const confirm = screen.getByRole('group', { name: 'Copy questions?' })
  expect(confirm).toHaveTextContent('Replace Delivery\'s questions with Pickup\'s (2)?')
  fireEvent.click(within(confirm).getByRole('button', { name: 'Copy' }))
  expect(labels()).toEqual(['Name', 'Notes'])
  expect(current.draft[PICKUP]).toBe(SOURCE.saved[PICKUP])
})

it('Save form now and Undo changes; a question that can’t be saved holds the save', () => {
  render(<Harness />)
  expect(screen.queryByRole('button', { name: /Save form now/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: '' } })
  expect(screen.getByRole('list', { name: 'Fix before saving' })).toHaveTextContent(/Pickup · question 1: Field label is required/)
  expect(screen.getByRole('button', { name: /Save form now/ })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Full name' } })
  fireEvent.click(screen.getByRole('button', { name: /Save form now/ }))
  expect(onSaveNow).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Undo changes' }))
  expect(current.hasChanges).toBe(false)
})

it('keeps an unsent draft across a reload', () => {
  const first = render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Move "Notes" up' }))
  expect(JSON.parse(window.localStorage.getItem('pd-form:t1') ?? '{}')[PICKUP].draft.map((q: FormQuestion) => q.id)).toEqual(['f-notes', 'f-name'])
  first.unmount()
  render(<Harness />)
  expect(labels()).toEqual(['Notes', 'Name'])
})

it('drops a stored draft whose questions changed elsewhere since (never undoes that change)', () => {
  const stale = { [PICKUP]: { base: [ask('f-gone', { field_label: 'Old' })], draft: [ask('f-gone', { field_label: 'Older' })] } }
  window.localStorage.setItem('pd-form:t1', JSON.stringify(stale))
  render(<Harness />)
  expect(labels()).toEqual(['Name', 'Notes'])
})

it('a part-way save keeps the stored rows as saved and every unsaved edit in the draft', () => {
  const { result } = renderHook(() => useCheckoutForm('t3', SOURCE))
  act(() => result.current.edit(PICKUP, (list) => [...list, ask('new-a', { field_name: '', field_label: 'Car plate' }), ask('new-b', { field_name: '', field_label: 'Landmark' })]))
  const sent = result.current.input!
  // Only "Car plate" got a row before the failure.
  const stored = [...SOURCE.saved[PICKUP], ask('row-a', { field_name: 'car_plate', field_label: 'Car plate' })]
  act(() => result.current.markSaved(sent, { fields: { [PICKUP]: stored }, created: { 'new-a': 'row-a' }, isPartial: true }))
  expect(result.current.saved[PICKUP]).toEqual(stored)
  expect(result.current.draft[PICKUP].map((q) => q.id)).toEqual([...SOURCE.saved[PICKUP].map((q) => q.id), 'row-a', 'new-b'])
  // The retry only creates Landmark.
  const ops = result.current.input!.orderTypes[PICKUP]
  expect(ops.draft.filter((q) => q.id.startsWith('new-')).map((q) => q.field_label)).toEqual(['Landmark'])
})

describe('useCheckoutForm.markSaved', () => {
  it('takes the stored copy for what was sent, and keeps edits made while the save was on its way', () => {
    const { result } = renderHook(() => useCheckoutForm('t2', SOURCE))
    act(() => result.current.edit(PICKUP, (list) => [...list, ask('new-1', { field_name: '', field_label: 'Car plate' })]))
    act(() => result.current.edit(DELIVERY, () => []))
    const sent = result.current.input!
    // While saving, the owner renames the new question on Pickup.
    act(() => result.current.edit(PICKUP, (list) => list.map((q) => (q.id === 'new-1' ? { ...q, field_label: 'Plate number' } : q))))
    const storedPickup = [...SOURCE.saved[PICKUP], ask('row-9', { field_name: 'car_plate', field_label: 'Car plate' })]
    act(() => result.current.markSaved(sent, { fields: { [PICKUP]: storedPickup, [DELIVERY]: [] }, created: { 'new-1': 'row-9' } }))
    expect(result.current.saved[PICKUP]).toEqual(storedPickup)
    // Delivery was untouched since sending → it is the stored copy, nothing left to save there.
    expect(result.current.draft[DELIVERY]).toEqual([])
    // Pickup's rename survives, now on the created row.
    expect(result.current.draft[PICKUP][2]).toMatchObject({ id: 'row-9', field_label: 'Plate number' })
    expect(Object.keys(result.current.input!.orderTypes)).toEqual([PICKUP])
  })
})

describe('canvas preview', () => {
  it('hands the sample the store’s order types and the open tab’s draft questions', () => {
    function Preview() {
      const form = useCheckoutForm('t3', SOURCE)
      return (
        <CheckoutFormProvider value={{ form, onSaveNow, isSaving: false }}>
          <PreviewProbe />
          <button type="button" onClick={() => form.setActiveId(DELIVERY)}>open delivery</button>
        </CheckoutFormProvider>
      )
    }
    let preview: ReturnType<typeof useCheckoutFormPreview> = null
    function PreviewProbe() {
      preview = useCheckoutFormPreview()
      return null
    }
    render(<Preview />)
    expect(preview!.orderTypeId).toBe(PICKUP)
    expect(preview!.orderTypes.map((t) => t.name)).toEqual(['Pickup', 'Delivery'])
    expect(preview!.fields.map((f) => f.field_label)).toEqual(['Name', 'Notes'])
    fireEvent.click(screen.getByRole('button', { name: 'open delivery' }))
    expect(preview!.fields.map((f) => f.field_name)).toEqual(['delivery_address'])
  })
})
