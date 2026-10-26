import { rewardEstimateCentavos } from './reward'

describe('rewardEstimateCentavos', () => {
  it('estimates a free-item reward as the dearest single item in the bag', () => {
    expect(rewardEstimateCentavos([{ unitCentavos: 14500 }, { unitCentavos: 19500 }, { unitCentavos: 9500 }])).toBe(19500)
  })

  it('is zero for an empty bag', () => {
    expect(rewardEstimateCentavos([])).toBe(0)
  })
})
