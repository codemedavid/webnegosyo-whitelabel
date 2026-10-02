import { trackingSteps } from './steps'

const states = (steps: ReturnType<typeof trackingSteps>) => steps.map((step) => step.state)

describe('trackingSteps', () => {
  it('marks earlier steps done and the current one current', () => {
    const steps = trackingSteps('preparing', 'pickup')
    expect(steps.map((step) => step.label)).toEqual(['Order placed', 'Confirmed', 'Preparing', 'Ready for pickup', 'Picked up'])
    expect(states(steps)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
  })

  it('words delivery orders differently', () => {
    const labels = trackingSteps('ready', 'delivery').map((step) => step.label)
    expect(labels.slice(-2)).toEqual(['On the way', 'Delivered'])
  })

  it('marks everything done once completed', () => {
    expect(states(trackingSteps('delivered', 'dine_in')).every((state) => state === 'done')).toBe(true)
  })

  it('collapses to a single cancelled step', () => {
    expect(trackingSteps('cancelled', 'pickup')).toEqual([{ key: 'cancelled', label: 'Order cancelled', state: 'current' }])
  })
})
