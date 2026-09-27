import { act, renderHook } from '@testing-library/react'
import { useDeliveryQuote, type UseDeliveryQuoteInput } from '@/hooks/checkout/use-delivery-quote'
import { createQuotationAction } from '@/app/actions/lalamove'

jest.mock('@/app/actions/lalamove', () => ({ createQuotationAction: jest.fn() }))
jest.mock('@/app/actions/delivery', () => ({ calculateDistanceDeliveryFeeAction: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const input: UseDeliveryQuoteInput = {
  tenant: { id: 'tenant-1', lalamove_enabled: true, distance_delivery_enabled: false, restaurant_address: 'Store', restaurant_latitude: 14.6, restaurant_longitude: 121 },
  isDeliveryOrder: true,
  deliveryAddress: 'Manila',
  deliveryLat: '14.7',
  deliveryLng: '121.1',
}

const quotation = () => ({
  success: true,
  data: { quotationId: 'quote-1', price: 80, currency: 'PHP', distance: '10', duration: '30', expiresAt: new Date(Date.now() + 300_000).toISOString(), quoteSignature: 'signed-quote' },
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

it('removes an expired delivery fee before the customer can pay the old total', async () => {
  jest.mocked(createQuotationAction).mockResolvedValueOnce(quotation())
  const { result } = renderHook(() => useDeliveryQuote(input))
  await act(async () => {})
  expect(result.current.deliveryFee).toBe(80)

  act(() => jest.advanceTimersByTime(300_000))

  expect(result.current.deliveryFee).toBeNull()
  expect(result.current.quotationId).toBeNull()
  expect(result.current.deliveryFeeError).toMatch(/expired/i)
})

it('lets the customer retry a failed quote for the same address', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.mocked(createQuotationAction)
    .mockResolvedValueOnce({ success: false, error: 'Delivery unavailable' })
    .mockResolvedValueOnce(quotation())
  const { result } = renderHook(() => useDeliveryQuote(input))
  await act(async () => {})
  expect(result.current.deliveryFeeError).toBe('Delivery unavailable')

  await act(async () => result.current.retryDeliveryQuote())

  expect(createQuotationAction).toHaveBeenCalledTimes(2)
  expect(result.current.deliveryFee).toBe(80)
  expect(result.current.deliveryFeeError).toBeNull()
  jest.restoreAllMocks()
})

it('never exposes the old fee when the pin changes under the same address label', async () => {
  jest.mocked(createQuotationAction)
    .mockResolvedValueOnce(quotation())
    .mockImplementationOnce(() => new Promise(() => {}))
  const renderedFees: (number | null)[] = []
  const { rerender } = renderHook((props: UseDeliveryQuoteInput) => {
    const quote = useDeliveryQuote(props)
    renderedFees.push(quote.deliveryFee)
    return quote
  }, { initialProps: input })
  await act(async () => {})
  expect(renderedFees.at(-1)).toBe(80)
  renderedFees.length = 0

  rerender({ ...input, deliveryLat: '14.9' })

  expect(renderedFees.every(fee => fee === null)).toBe(true)
})

it('treats an unsigned quotation as a retryable failure instead of showing a payable fee', async () => {
  const response = quotation()
  jest.mocked(createQuotationAction).mockResolvedValueOnce({ ...response, data: { ...response.data, quoteSignature: '' } })
  const { result } = renderHook(() => useDeliveryQuote(input))
  await act(async () => {})

  expect(result.current.deliveryFee).toBeNull()
  expect(result.current.deliveryFeeError).toMatch(/valid delivery quote/i)
})

it('ignores a slower quotation for a previous delivery pin', async () => {
  let finishOlder!: (value: ReturnType<typeof quotation>) => void
  const newer = quotation()
  newer.data.quotationId = 'quote-newer'
  jest.mocked(createQuotationAction)
    .mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve }))
    .mockResolvedValueOnce(newer)
  const { result, rerender } = renderHook((props: UseDeliveryQuoteInput) => useDeliveryQuote(props), { initialProps: input })

  rerender({ ...input, deliveryLat: '14.9' })
  await act(async () => {})
  expect(result.current.quotationId).toBe('quote-newer')
  await act(async () => finishOlder(quotation()))

  expect(result.current.quotationId).toBe('quote-newer')
  expect(result.current.getDeliveryQuoteError()).toBeNull()
})
