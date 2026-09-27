import { getMobileDeliveryCheckoutError } from '../../mobile/lib/lalamove-checkout'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('customer app delivery quotation requirement', () => {
  it('blocks unsupported checkout before showing payment instructions', () => {
    const source = readFileSync(join(process.cwd(), 'mobile/app/(main)/checkout.tsx'), 'utf8')
    const next = source.slice(source.indexOf('const handleNextToPayment'), source.indexOf('const handlePickProof'))
    expect(next).toContain('getMobileDeliveryCheckoutError')
    expect(next.indexOf('getMobileDeliveryCheckoutError')).toBeLessThan(next.indexOf('setStep(2)'))
    expect(source).not.toContain('onPress={() => setStep(2)}')
  })
  it('requires the store website for Lalamove delivery, including a custom delivery name', () => {
    expect(getMobileDeliveryCheckoutError(
      { lalamove_enabled: true }, { type: 'delivery', name: 'Door to door' },
    )).toMatch(/website.*Lalamove.*quote/i)
  })

  it('keeps pickup and non-Lalamove delivery available', () => {
    expect(getMobileDeliveryCheckoutError(
      { lalamove_enabled: true }, { type: 'pickup', name: 'Collect here' },
    )).toBeNull()
    expect(getMobileDeliveryCheckoutError(
      { lalamove_enabled: false }, { type: 'delivery', name: 'Local delivery' },
    )).toBeNull()
  })

  it('routes all checkout through the website for Convex stores with Lalamove', () => {
    expect(getMobileDeliveryCheckoutError(
      { lalamove_enabled: true, convex_deployment_url: 'https://store.convex.cloud' },
      { type: 'pickup', name: 'Collect here' },
    )).toMatch(/website/i)
  })
})
