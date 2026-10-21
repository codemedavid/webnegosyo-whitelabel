'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { parsePesoInput } from '@/lib/expenses/keypad'
import { DOC_TYPES, type DocType } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_INPUT, FIELD_LABEL, FieldError } from './expense-form-fields'
import { ewtFromRate, vatFromGross, type ExpenseFormState, type FormErrors } from './expense-form-model'
import { formatPeso } from './expense-format'

export const DOC_TYPE_LABELS: Readonly<Record<DocType, string>> = {
  vat_invoice: 'VAT invoice',
  non_vat_invoice: 'Non-VAT invoice',
  acknowledgement: 'Acknowledgement receipt',
  none: 'No document',
}

const NO_DOC = '__none_chosen__'

type InvoiceState = Pick<
  ExpenseFormState,
  'docType' | 'invoiceNo' | 'supplierTin' | 'vatText' | 'ewtRateText' | 'ewtText' | 'form2307Given'
>

interface InvoiceDetailsFieldsProps {
  idPrefix: string
  value: InvoiceState
  onChange: (patch: Partial<InvoiceState>) => void
  amountCents: number | null
  errors: FormErrors
  /** Opens itself when something inside is already filled or wrong. */
  defaultOpen?: boolean
}

function centsToText(cents: number): string {
  return formatPeso(cents).replace('₱', '')
}

/**
 * "Invoice details (for your accountant)": every field optional and folded
 * away (plan §2.6). The VAT and withholding buttons work the figures out; the
 * owner can still type over them.
 */
export function InvoiceDetailsFields({ idPrefix, value, onChange, amountCents, errors, defaultOpen = false }: InvoiceDetailsFieldsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const panelId = useId()
  const docLabelId = `${idPrefix}-doc-label`
  const hasError = Boolean(errors.supplierTin || errors.vat || errors.ewt || errors.ewtRate)
  const isShown = isOpen || hasError
  const vatCents = value.vatText.trim() === '' ? null : parsePesoInput(value.vatText)
  const rate = Number(value.ewtRateText.replace('%', '').trim())

  return (
    <div className="rounded-xl ring-1 ring-wn-line">
      <button
        type="button"
        aria-expanded={isShown}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3.5 text-left outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
      >
        <span>
          <span className="block text-[14px] font-semibold text-wn-ink">Invoice details</span>
          <span className="block text-[12.5px] text-wn-stone">For your accountant. All optional.</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-wn-stone transition-transform', isShown && 'rotate-180')} aria-hidden />
      </button>
      <div id={panelId} hidden={!isShown} className="grid gap-3 border-t border-wn-line px-3.5 pb-4 pt-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span id={docLabelId} className={FIELD_LABEL}>
            Document
          </span>
          <Select
            value={value.docType ?? NO_DOC}
            onValueChange={(next) => onChange({ docType: next === NO_DOC ? null : (next as DocType) })}
          >
            <SelectTrigger aria-labelledby={docLabelId} className="min-h-11 w-full rounded-xl border-wn-line data-[size=default]:h-11">
              <SelectValue>{value.docType ? DOC_TYPE_LABELS[value.docType] : 'Not set'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DOC}>Not set</SelectItem>
              {DOC_TYPES.map((docType) => (
                <SelectItem key={docType} value={docType}>
                  {DOC_TYPE_LABELS[docType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-invoice`} className={FIELD_LABEL}>
            Invoice no.
          </label>
          <input
            id={`${idPrefix}-invoice`}
            type="text"
            maxLength={40}
            value={value.invoiceNo}
            onChange={(event) => onChange({ invoiceNo: event.target.value })}
            className={FIELD_INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${idPrefix}-tin`} className={FIELD_LABEL}>
            Supplier TIN
          </label>
          <input
            id={`${idPrefix}-tin`}
            type="text"
            inputMode="numeric"
            placeholder="123-456-789-000"
            value={value.supplierTin}
            aria-invalid={errors.supplierTin ? true : undefined}
            aria-describedby={errors.supplierTin ? `${idPrefix}-tin-error` : undefined}
            onChange={(event) => onChange({ supplierTin: event.target.value })}
            className={cn(FIELD_INPUT, 'tabular-nums')}
          />
          <FieldError id={`${idPrefix}-tin-error`} message={errors.supplierTin} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-vat`} className={FIELD_LABEL}>
            VAT included
          </label>
          <div className="flex gap-1.5">
            <input
              id={`${idPrefix}-vat`}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={value.vatText}
              aria-invalid={errors.vat ? true : undefined}
              aria-describedby={errors.vat ? `${idPrefix}-vat-error` : undefined}
              onChange={(event) => onChange({ vatText: event.target.value })}
              className={cn(FIELD_INPUT, 'tabular-nums')}
            />
            <button
              type="button"
              disabled={amountCents === null}
              onClick={() => amountCents !== null && onChange({ vatText: centsToText(vatFromGross(amountCents)) })}
              className="shrink-0 rounded-xl px-3 text-[13px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink disabled:cursor-not-allowed disabled:text-wn-stone disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              12%
              <span className="sr-only"> VAT: work it out from the amount</span>
            </button>
          </div>
          <FieldError id={`${idPrefix}-vat-error`} message={errors.vat} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Tax withheld (EWT)</span>
          <div className="flex gap-1.5">
            <label htmlFor={`${idPrefix}-ewt-rate`} className="sr-only">
              Withholding rate, percent
            </label>
            <div className="relative w-20 shrink-0">
              <input
                id={`${idPrefix}-ewt-rate`}
                type="text"
                inputMode="decimal"
                placeholder="5"
                value={value.ewtRateText}
                aria-invalid={errors.ewtRate ? true : undefined}
                onChange={(event) => {
                  const text = event.target.value
                  const nextRate = Number(text.replace('%', '').trim())
                  const canWorkOut = amountCents !== null && text.trim() !== '' && Number.isFinite(nextRate) && nextRate >= 0 && nextRate <= 100
                  onChange({
                    ewtRateText: text,
                    ...(canWorkOut ? { ewtText: centsToText(ewtFromRate(amountCents, vatCents, nextRate)) } : {}),
                  })
                }}
                className={cn(FIELD_INPUT, 'pr-7 tabular-nums')}
              />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[14px] text-wn-stone">
                %
              </span>
            </div>
            <label htmlFor={`${idPrefix}-ewt`} className="sr-only">
              Amount withheld, pesos
            </label>
            <input
              id={`${idPrefix}-ewt`}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={value.ewtText}
              aria-invalid={errors.ewt ? true : undefined}
              aria-describedby={errors.ewt ? `${idPrefix}-ewt-error` : undefined}
              onChange={(event) => onChange({ ewtText: event.target.value })}
              className={cn(FIELD_INPUT, 'tabular-nums')}
            />
          </div>
          {Number.isFinite(rate) && rate > 0 && !errors.ewt && (
            <p className="text-[12px] text-wn-stone">Worked out on the amount before VAT. You can type over it.</p>
          )}
          <FieldError id={`${idPrefix}-ewt-rate-error`} message={errors.ewtRate} />
          <FieldError id={`${idPrefix}-ewt-error`} message={errors.ewt} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-wn-ink sm:col-span-2">
          <Checkbox
            checked={value.form2307Given}
            onCheckedChange={(checked) => onChange({ form2307Given: checked === true })}
            className="size-[18px]"
          />
          Form 2307 given to the supplier
        </label>
      </div>
    </div>
  )
}
