import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_APPROVAL_THRESHOLD,
  defaultTaxProfile,
  taxProfileFromRow,
  taxProfileToRow,
  tinHeaderLine,
  type TaxProfile,
} from '@/lib/gov-discount'
import {
  OPTIONAL_GOV_KINDS,
  formValuesFromProfile,
  profileFromFormValues,
  toggleKind,
} from '@/lib/tax-settings/form-mapping'
import { taxSettingsFormSchema, type TaxSettingsFormValues } from '@/lib/tax-settings/form-schema'

const filled = (overrides: Partial<TaxSettingsFormValues> = {}): TaxSettingsFormValues => ({
  vatStatus: 'vat',
  registeredName: '  Sukad Food Corp. ',
  tin: '123-456-789',
  tinBranchCode: '00000',
  businessAddress: '12 Rizal St, Cebu City',
  isBirRegisteredPos: false,
  posMin: '',
  posSerialNo: '',
  posPtuNo: '',
  enabledKinds: ['senior', 'pwd'],
  allowSharedTable: true,
  approvalRule: 'above',
  approvalThreshold: '500',
  serviceChargeMode: 'full',
  idPhotoMode: 'off',
  onlineClaimsEnabled: false,
  ...overrides,
})

describe('formValuesFromProfile', () => {
  it('starts a store without a profile on the recommended defaults, with no VAT status picked', () => {
    const values = formValuesFromProfile(null)

    expect(values.vatStatus).toBeUndefined()
    expect(values.approvalRule).toBe('above')
    expect(values.approvalThreshold).toBe(String(DEFAULT_APPROVAL_THRESHOLD))
    expect(values.serviceChargeMode).toBe('full')
    expect(values.enabledKinds).toEqual(['senior', 'pwd'])
    expect(values.isBirRegisteredPos).toBe(false)
    expect(values.allowSharedTable).toBe(true)
  })

  it('shows a saved profile as typed text', () => {
    const profile: TaxProfile = {
      ...defaultTaxProfile('non_vat'),
      registeredName: 'Sukad',
      tin: '123456789',
      tinBranchCode: '000',
      approvalRule: 'always',
      approvalThreshold: 750.5,
    }

    expect(formValuesFromProfile(profile)).toMatchObject({
      vatStatus: 'non_vat',
      registeredName: 'Sukad',
      tin: '123-456-789',
      tinBranchCode: '000',
      approvalRule: 'always',
      approvalThreshold: '750.5',
    })
  })
})

describe('profileFromFormValues', () => {
  it('trims text and stores blanks as null', () => {
    const profile = profileFromFormValues(filled({ businessAddress: '   ', posMin: '' }))

    expect(profile.registeredName).toBe('Sukad Food Corp.')
    expect(profile.businessAddress).toBeNull()
    expect(profile.posMin).toBeNull()
  })

  it('moves a branch code typed after the TIN into its own column', () => {
    const profile = profileFromFormValues(filled({ tin: '123-456-789-00000', tinBranchCode: '' }))

    expect(profile.tin).toBe('123-456-789')
    expect(profile.tinBranchCode).toBe('00000')
    expect(tinHeaderLine(profile)).toBe('VAT REG TIN 123-456-789-00000')
  })

  it('never prints the branch twice when it is typed in both places', () => {
    const profile = profileFromFormValues(filled({ tin: '123-456-789-00000', tinBranchCode: '00000' }))

    expect(tinHeaderLine(profile)).toBe('VAT REG TIN 123-456-789-00000')
  })

  it('keeps Senior and PWD on whatever the form sends', () => {
    expect(profileFromFormValues(filled({ enabledKinds: ['athlete'] })).enabledKinds).toEqual([
      'senior',
      'pwd',
      'athlete',
    ])
  })

  it('rounds the threshold to centavos and falls back to the default when blank', () => {
    expect(profileFromFormValues(filled({ approvalThreshold: '499.999' })).approvalThreshold).toBe(500)
    expect(profileFromFormValues(filled({ approvalRule: 'never', approvalThreshold: '' })).approvalThreshold).toBe(
      DEFAULT_APPROVAL_THRESHOLD,
    )
  })

  it('round-trips through the stored row unchanged', () => {
    const profile = profileFromFormValues(filled({ enabledKinds: ['senior', 'pwd', 'medal_of_valor'] }))
    const row = { tenant_id: 't1', ...taxProfileToRow(profile) }

    expect(taxProfileFromRow(row)).toEqual(profile)
  })

  it('survives form → profile → form', () => {
    const values = filled({ tin: '123-456-789', tinBranchCode: '000', approvalThreshold: '650' })

    expect(formValuesFromProfile(profileFromFormValues(values))).toEqual({
      ...values,
      registeredName: 'Sukad Food Corp.',
    })
  })
})

describe('toggleKind', () => {
  it('offers only the kinds the law lets an owner choose', () => {
    expect(OPTIONAL_GOV_KINDS).toEqual(['athlete', 'medal_of_valor'])
  })

  it('switches an optional kind on and off in the register order', () => {
    const on = toggleKind(['senior', 'pwd'], 'medal_of_valor', true)
    expect(on).toEqual(['senior', 'pwd', 'medal_of_valor'])
    expect(toggleKind([...on, 'athlete'], 'medal_of_valor', false)).toEqual(['senior', 'pwd', 'athlete'])
  })

  it('cannot switch Senior or PWD off', () => {
    expect(toggleKind(['senior', 'pwd'], 'senior', false)).toEqual(['senior', 'pwd'])
  })
})

describe('taxSettingsFormSchema', () => {
  const issuesOf = (values: unknown) => {
    const parsed = taxSettingsFormSchema.safeParse(values)
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }

  it('accepts a complete form', () => {
    expect(issuesOf(filled())).toEqual([])
  })

  it('accepts a store that has only picked its VAT status', () => {
    expect(
      issuesOf(filled({ registeredName: '', tin: '', tinBranchCode: '', businessAddress: '' })),
    ).toEqual([])
  })

  it('asks for the VAT status when none was picked', () => {
    expect(issuesOf({ ...filled(), vatStatus: undefined })).toEqual([
      'vatStatus: Choose VAT-registered or Non-VAT',
    ])
  })

  it.each(['12345678', '123-456-7890', 'abc-def-ghi'])('refuses the TIN %p', (tin) => {
    expect(issuesOf(filled({ tin }))).toEqual(['tin: Enter your TIN like 123-456-789 or 123-456-789-00000'])
  })

  it('refuses a branch code that is not 3 to 5 digits', () => {
    expect(issuesOf(filled({ tinBranchCode: '12' }))).toEqual([
      'tinBranchCode: The branch code is 3 to 5 digits, like 000 or 00000',
    ])
  })

  it('refuses two different branch codes', () => {
    expect(issuesOf(filled({ tin: '123-456-789-001', tinBranchCode: '000' }))).toEqual([
      'tinBranchCode: Your TIN already ends in branch 001. Clear one of them.',
    ])
  })

  it('asks for the MIN and PTU number once the POS is BIR-registered', () => {
    expect(issuesOf(filled({ isBirRegisteredPos: true }))).toEqual([
      'posMin: Enter the MIN from your Permit To Use',
      'posPtuNo: Enter your PTU number',
    ])
    expect(issuesOf(filled({ isBirRegisteredPos: true, posMin: '1234', posPtuNo: 'FP012024' }))).toEqual([])
  })

  it.each(['', '0', '-5', 'abc', '500.123', '1000001'])('refuses the threshold %p under "Above"', (amount) => {
    expect(issuesOf(filled({ approvalThreshold: amount }))).toEqual([
      'approvalThreshold: Enter an amount in pesos, like 500',
    ])
  })

  it('ignores the threshold under "Never" and "Always"', () => {
    expect(issuesOf(filled({ approvalRule: 'never', approvalThreshold: '' }))).toEqual([])
    expect(issuesOf(filled({ approvalRule: 'always', approvalThreshold: 'x' }))).toEqual([])
  })

  it('refuses text longer than the database allows', () => {
    expect(issuesOf(filled({ registeredName: 'x'.repeat(161) }))).toEqual([
      'registeredName: Business name must be 160 characters or fewer',
    ])
  })

  it('refuses a kind the store cannot offer', () => {
    expect(issuesOf(filled({ enabledKinds: ['students' as never] }))).toHaveLength(1)
  })
})
