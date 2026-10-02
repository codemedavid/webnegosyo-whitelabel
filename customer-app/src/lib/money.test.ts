import { formatPeso, fromCentavos, toCentavos } from './money'

describe('money', () => {
  it('converts pesos to integer centavos without float drift', () => {
    expect(toCentavos(0.1 + 0.2)).toBe(30)
    expect(toCentavos(145)).toBe(14500)
    expect(toCentavos(19.995)).toBe(2000)
  })

  it('converts back to pesos', () => {
    expect(fromCentavos(14550)).toBe(145.5)
  })

  it('formats whole pesos without decimals and fractional pesos with two', () => {
    expect(formatPeso(14500)).toBe('₱145')
    expect(formatPeso(14550)).toBe('₱145.50')
    expect(formatPeso(123456700)).toBe('₱1,234,567')
  })
})
