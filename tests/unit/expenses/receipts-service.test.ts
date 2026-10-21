import { MAX_RECEIPT_BYTES, receiptObjectPath, sniffReceiptType } from '@/lib/expenses/receipts/rules'
import { mayAttachReceipt, uploadReceipt, type ReceiptExpense, type ReceiptStore } from '@/lib/expenses/receipts/upload-service'
import { EXPENSE_MESSAGES, expenseErrorMessage, isClientRequestConflict } from '@/lib/expenses/errors'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPENSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RECEIPT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))
const PDF = new Uint8Array([...'%PDF-1.7'].map((c) => c.charCodeAt(0)))
const TEXT = new Uint8Array([...'hello'].map((c) => c.charCodeAt(0)))

const expense: ReceiptExpense = { id: EXPENSE, tenantId: TENANT, paidFrom: 'cash', createdBy: 'owner', status: 'recorded' }

function store(overrides: Partial<ReceiptStore> = {}) {
  return {
    countReceipts: jest.fn(async () => 0),
    putObject: jest.fn(async () => undefined),
    insertReceipt: jest.fn(async () => undefined),
    removeObject: jest.fn(async () => undefined),
    ...overrides,
  }
}

describe('sniffReceiptType', () => {
  it('recognizes the four kept types by their bytes', () => {
    expect(sniffReceiptType(JPEG)).toEqual({ mime: 'image/jpeg', extension: 'jpg' })
    expect(sniffReceiptType(PNG)).toEqual({ mime: 'image/png', extension: 'png' })
    expect(sniffReceiptType(WEBP)).toEqual({ mime: 'image/webp', extension: 'webp' })
    expect(sniffReceiptType(PDF)).toEqual({ mime: 'application/pdf', extension: 'pdf' })
  })

  it('refuses anything else, however it is named', () => {
    expect(sniffReceiptType(TEXT)).toBeNull()
    expect(sniffReceiptType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })

  it('files under store/expense/id', () => {
    expect(receiptObjectPath(TENANT.toUpperCase(), EXPENSE, RECEIPT, 'jpg')).toBe(`${TENANT}/${EXPENSE}/${RECEIPT}.jpg`)
  })
})

describe('mayAttachReceipt', () => {
  it('allows an expenses holder, or the cashier on their own drawer expense', () => {
    expect(mayAttachReceipt(expense, { userId: 'x', holdsExpenses: true })).toBe(true)
    expect(mayAttachReceipt({ ...expense, paidFrom: 'drawer', createdBy: 'cashier' }, { userId: 'cashier', holdsExpenses: false })).toBe(true)
    expect(mayAttachReceipt({ ...expense, paidFrom: 'drawer', createdBy: 'other' }, { userId: 'cashier', holdsExpenses: false })).toBe(false)
    expect(mayAttachReceipt({ ...expense, createdBy: 'cashier' }, { userId: 'cashier', holdsExpenses: false })).toBe(false)
  })
})

describe('uploadReceipt', () => {
  const owner = { userId: 'owner', holdsExpenses: true }

  it('stores the object and its row under the sniffed type', async () => {
    const receipts = store()
    const outcome = await uploadReceipt(receipts, expense, owner, PDF, () => RECEIPT)
    expect(outcome).toEqual({ ok: true, id: RECEIPT })
    expect(receipts.putObject).toHaveBeenCalledWith(`${TENANT}/${EXPENSE}/${RECEIPT}.pdf`, PDF, 'application/pdf')
    expect(receipts.insertReceipt).toHaveBeenCalledWith({
      id: RECEIPT, tenant_id: TENANT, expense_id: EXPENSE, object_path: `${TENANT}/${EXPENSE}/${RECEIPT}.pdf`,
      mime: 'application/pdf', bytes: PDF.length, uploaded_by: 'owner',
    })
  })

  it.each([
    ['not allowed', expense, { userId: 'cook', holdsExpenses: false }, JPEG, 403],
    ['voided', { ...expense, status: 'void' }, owner, JPEG, 409],
    ['empty', expense, owner, new Uint8Array(), 400],
    ['too large', expense, owner, new Uint8Array(MAX_RECEIPT_BYTES + 1).fill(0xff), 413],
    ['not a photo or pdf', expense, owner, TEXT, 415],
  ] as const)('refuses %s without storing anything', async (_label, target, uploader, bytes, status) => {
    const receipts = store()
    const outcome = await uploadReceipt(receipts, target, uploader, bytes, () => RECEIPT)
    expect(outcome).toMatchObject({ ok: false, status })
    expect(receipts.putObject).not.toHaveBeenCalled()
  })

  it('refuses an eleventh receipt', async () => {
    const receipts = store({ countReceipts: jest.fn(async () => 10) })
    expect(await uploadReceipt(receipts, expense, owner, JPEG, () => RECEIPT)).toMatchObject({ ok: false, status: 409, code: 'too_many' })
  })

  it('removes the object when its row cannot be written', async () => {
    const receipts = store({ insertReceipt: jest.fn(async () => { throw new Error('insert failed') }) })
    await expect(uploadReceipt(receipts, expense, owner, JPEG, () => RECEIPT)).rejects.toThrow('insert failed')
    expect(receipts.removeObject).toHaveBeenCalledWith(`${TENANT}/${EXPENSE}/${RECEIPT}.jpg`)
  })
})

describe('expenseErrorMessage', () => {
  it.each([
    [{ code: '42501', message: 'new row violates row-level security policy' }, EXPENSE_MESSAGES.noAccess],
    [{ code: '22023', message: 'note_required' }, EXPENSE_MESSAGES.noteRequired],
    [{ code: '22023', message: 'drawer_locked', details: 'amount_cents' }, EXPENSE_MESSAGES.drawerLocked],
    [{ code: 'P0002', message: 'expense_not_found' }, EXPENSE_MESSAGES.goneOrVoided],
    [{ code: 'P0002', message: 'movement_not_found' }, EXPENSE_MESSAGES.payoutGone],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "expenses_movement_recorded_uq"' }, EXPENSE_MESSAGES.payoutAlreadySorted],
    [{ code: '22023', message: 'spent_on_in_future' }, EXPENSE_MESSAGES.spentOnFuture],
    [{ code: '23514', message: 'expenses_vat_ck' }, EXPENSE_MESSAGES.invalid],
    [{ code: 'XX000', message: 'boom' }, EXPENSE_MESSAGES.unknown],
  ])('maps %j', (error, sentence) => {
    expect(expenseErrorMessage(error)).toBe(sentence)
  })

  it('spots a repeated request id by constraint name or key detail', () => {
    expect(isClientRequestConflict({ code: '23505', message: 'violates unique constraint "expenses_client_request_uq"' })).toBe(true)
    expect(isClientRequestConflict({ code: '23505', message: 'dup', details: 'Key (tenant_id, client_request_id)=(a, b) already exists.' })).toBe(true)
    expect(isClientRequestConflict({ code: '23505', message: 'expenses_movement_recorded_uq' })).toBe(false)
  })
})
