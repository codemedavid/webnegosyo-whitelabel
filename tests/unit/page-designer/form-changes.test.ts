/**
 * The checkout form editor's engine: saved questions + the editor's draft →
 * the writes, in the order they must run (creates, updates, deletes, then
 * one reorder per order type), each checked with the order-type service's
 * own schema. New questions are temp ids until created.
 */

import {
  changedOrderTypes,
  copyQuestions,
  diffFormFields,
  formDraftFromRows,
  formSaveInput,
  formSaveInputSchema,
  isTempId,
  makeTempId,
  nameForQuestion,
  remapTempIds,
  type FormDraft,
  type FormQuestion,
} from '@/lib/page-designer/form-changes'
import { availablePresets, BLANK_QUESTIONS, QUESTION_PRESETS, questionFromPreset } from '@/lib/page-designer/form-presets'
import { CHECKOUT_FIELD_TYPES } from '@/lib/checkout-field-types'

const PICKUP = '11111111-1111-4111-8111-111111111111'
const DELIVERY = '22222222-2222-4222-8222-222222222222'

function q(id: string, overrides: Partial<FormQuestion> = {}): FormQuestion {
  return {
    id,
    field_name: id,
    field_label: `Label ${id}`,
    field_type: 'text',
    is_required: false,
    placeholder: '',
    options: [],
    validation_rules: {},
    ...overrides,
  }
}

const SAVED: FormDraft = { [PICKUP]: [q('name'), q('phone', { field_type: 'phone' })], [DELIVERY]: [q('addr', { field_type: 'textarea' })] }

describe('diffFormFields', () => {
  it('has nothing to do when the draft is the saved form', () => {
    expect(diffFormFields(SAVED, SAVED)).toEqual({ ops: [], problems: [] })
    expect(changedOrderTypes(SAVED, SAVED)).toEqual([])
    expect(formSaveInput(SAVED, SAVED)).toBeUndefined()
  })

  it('orders the writes: creates, updates, deletes, then one reorder per order type', () => {
    const tempId = makeTempId()
    const draft: FormDraft = {
      [PICKUP]: [q(tempId, { field_name: '', field_label: 'Car plate' }), q('phone', { field_type: 'phone', field_label: 'Mobile' })],
      [DELIVERY]: [],
    }
    const { ops, problems } = diffFormFields(SAVED, draft)
    expect(problems).toEqual([])
    expect(ops.map((op) => op.op)).toEqual(['create', 'update', 'delete', 'delete', 'reorder', 'reorder'])
    const create = ops[0]
    expect(create).toMatchObject({ op: 'create', orderTypeId: PICKUP, tempId, field: { field_name: 'car_plate', field_label: 'Car plate', order_index: 0 } })
    expect(ops[1]).toMatchObject({ op: 'update', fieldId: 'phone', field: { field_label: 'Mobile', order_index: 1 } })
    expect(ops.filter((op) => op.op === 'delete').map((op) => op.op === 'delete' && op.fieldId).sort()).toEqual(['addr', 'name'])
    expect(ops[4]).toEqual({ op: 'reorder', orderTypeId: PICKUP, fieldIds: [tempId, 'phone'] })
    expect(ops[5]).toEqual({ op: 'reorder', orderTypeId: DELIVERY, fieldIds: [] })
  })

  it('a pure reorder is one reorder and no updates', () => {
    const draft = { ...SAVED, [PICKUP]: [SAVED[PICKUP][1], SAVED[PICKUP][0]] }
    expect(diffFormFields(SAVED, draft).ops).toEqual([{ op: 'reorder', orderTypeId: PICKUP, fieldIds: ['phone', 'name'] }])
  })

  it('a saved question keeps its stored name, whatever the draft says', () => {
    const draft = { ...SAVED, [PICKUP]: [q('name', { field_name: 'renamed', field_label: 'Your name' }), SAVED[PICKUP][1]] }
    const [op] = diffFormFields(SAVED, draft).ops
    expect(op).toMatchObject({ op: 'update', field: { field_name: 'name', field_label: 'Your name' } })
  })

  it('refuses through the service schema: a blank label, a choice question without choices, a duplicate name', () => {
    const draft: FormDraft = {
      [PICKUP]: [
        q('name', { field_label: '   ' }),
        q(makeTempId(), { field_name: '', field_label: 'Size', field_type: 'choice', options: ['  '] }),
        q(makeTempId(), { field_name: 'phone', field_label: 'Other phone' }),
        SAVED[PICKUP][1],
      ],
    }
    const { problems } = diffFormFields(SAVED, draft, { names: { [PICKUP]: 'Pickup' } })
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Pickup · question 1: Field label is required/),
        expect.stringMatching(/^Pickup · question 2 \(Size\): add at least one choice/),
        expect.stringMatching(/two questions store their answer as "phone"/),
      ]),
    )
  })

  it('refuses more than 40 questions on one order type', () => {
    const many = Array.from({ length: 41 }, (_, i) => q(makeTempId(), { field_name: `f${i}` }))
    expect(diffFormFields(SAVED, { [PICKUP]: many }).problems[0]).toMatch(/at most 40 questions/)
  })

  it('drops choices from kinds that do not pick from them, trims the rest', () => {
    const draft = { [PICKUP]: [q('name', { options: ['x'] }), q('phone', { field_type: 'select', options: [' A ', '', 'B'] })] }
    const ops = diffFormFields(SAVED, draft).ops
    expect(ops.find((op) => op.op === 'update' && op.fieldId === 'phone')).toMatchObject({ field: { options: ['A', 'B'] } })
    expect(ops.find((op) => op.op === 'update' && op.fieldId === 'name')).toMatchObject({ field: { options: [] } })
  })
})

describe('names, temp ids and copies', () => {
  it('names a new question from its label, unique on its order type', () => {
    expect(nameForQuestion('Car plate #', new Set())).toBe('car_plate')
    expect(nameForQuestion('Car plate', new Set(['car_plate', 'car_plate_2']))).toBe('car_plate_3')
    expect(nameForQuestion('!!!', new Set())).toBe('question')
  })

  it('temp ids are recognisable and remap to the created rows', () => {
    const id = makeTempId()
    expect(isTempId(id)).toBe(true)
    expect(isTempId('5f2c…')).toBe(false)
    const draft = remapTempIds({ [PICKUP]: [q(id), q('name')] }, { [id]: 'row-9' })
    expect(draft[PICKUP].map((x) => x.id)).toEqual(['row-9', 'name'])
  })

  it('copy replaces the target’s questions, keeping the row of a question it already asks under the same name', () => {
    const draft = copyQuestions(SAVED, PICKUP, DELIVERY)
    expect(draft[DELIVERY].map((x) => x.field_name)).toEqual(['name', 'phone'])
    expect(draft[DELIVERY].every((x) => isTempId(x.id))).toBe(true)
    const kept = copyQuestions({ ...SAVED, [DELIVERY]: [q('d-name', { field_name: 'name' })] }, PICKUP, DELIVERY)
    expect(kept[DELIVERY][0].id).toBe('d-name')
    // The source is untouched.
    expect(draft[PICKUP]).toBe(SAVED[PICKUP])
  })

  it('reads stored rows sorted by order_index, nulls as empty', () => {
    const draft = formDraftFromRows([PICKUP, DELIVERY], [
      { id: 'b', order_type_id: PICKUP, field_name: 'b', field_label: 'B', field_type: 'text', is_required: null, placeholder: null, options: null, validation_rules: null, order_index: 1 },
      { id: 'a', order_type_id: PICKUP, field_name: 'a', field_label: 'A', field_type: 'mystery', is_required: true, order_index: 0 },
    ])
    expect(draft[PICKUP].map((x) => x.id)).toEqual(['a', 'b'])
    expect(draft[PICKUP][0].field_type).toBe('text')
    expect(draft[PICKUP][1]).toMatchObject({ is_required: false, placeholder: '', options: [], validation_rules: {} })
    expect(draft[DELIVERY]).toEqual([])
  })

  it('the save input carries only changed order types and passes its own schema', () => {
    const draft = { ...SAVED, [DELIVERY]: [] }
    const input = formSaveInput(SAVED, draft)
    expect(Object.keys(input!.orderTypes)).toEqual([DELIVERY])
    expect(formSaveInputSchema.safeParse(input).success).toBe(true)
    expect(formSaveInputSchema.safeParse({ orderTypes: { 'not-a-uuid': input!.orderTypes[DELIVERY] } }).success).toBe(false)
  })
})

describe('presets', () => {
  it('every ready-made and blank question saves as it is', () => {
    for (const preset of [...QUESTION_PRESETS, ...BLANK_QUESTIONS]) {
      const { problems } = diffFormFields({ [PICKUP]: [] }, { [PICKUP]: [questionFromPreset(preset)] })
      expect({ preset: preset.id, problems }).toEqual({ preset: preset.id, problems: [] })
    }
  })

  it('offers a blank question of every kind, and each ready-made one only once per order type', () => {
    expect(BLANK_QUESTIONS.map((p) => p.question.field_type).sort()).toEqual([...CHECKOUT_FIELD_TYPES].sort())
    const asked = [questionFromPreset(QUESTION_PRESETS[0])]
    expect(availablePresets(asked).map((p) => p.id)).not.toContain(QUESTION_PRESETS[0].id)
  })
})
