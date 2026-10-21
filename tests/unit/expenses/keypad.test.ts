import {
  EMPTY_KEYPAD,
  MAX_AMOUNT_CENTS,
  formatPeso,
  keypadCents,
  keypadDisplay,
  keypadFromCents,
  parsePesoInput,
  pressKey,
  pressKeys,
  type KeypadKey,
} from '@/lib/expenses/keypad'

function type(keys: readonly KeypadKey[]) {
  return pressKeys(EMPTY_KEYPAD, keys)
}

describe('keypad: whole pesos', () => {
  it('starts empty at ₱0', () => {
    expect(keypadCents(EMPTY_KEYPAD)).toBe(0)
    expect(keypadDisplay(EMPTY_KEYPAD)).toBe('₱0')
  })

  it('types digits and 00 as whole pesos with separators', () => {
    const state = type(['1', '2', '5', '0'])
    expect(keypadCents(state)).toBe(125_000)
    expect(keypadDisplay(state)).toBe('₱1,250')
    const hundreds = type(['8', '00'])
    expect(keypadCents(hundreds)).toBe(80_000)
    expect(keypadDisplay(hundreds)).toBe('₱800')
  })

  it('ignores leading zeros', () => {
    expect(type(['0', '00', '0']).whole).toBe('')
    expect(keypadDisplay(type(['0', '7']))).toBe('₱7')
  })

  it('backspace removes the last digit and is harmless on empty', () => {
    expect(keypadDisplay(type(['1', '2', '5', 'backspace']))).toBe('₱12')
    expect(type(['backspace'])).toEqual(EMPTY_KEYPAD)
  })

  it('refuses a key that would pass ₱10,000,000, keeping the state', () => {
    const max = type(['1', '00', '00', '00', '0'])
    expect(keypadCents(max)).toBe(MAX_AMOUNT_CENTS)
    expect(pressKey(max, '1')).toBe(max)
    expect(pressKey(max, '00')).toBe(max)
    const almost = type(['9', '9', '9', '9', '9', '9', '9'])
    expect(keypadCents(pressKey(almost, '00'))).toBe(keypadCents(almost))
  })

  it('refuses 00 outright when only one more zero would fit', () => {
    const state = type(['1', '00', '00', '00']) // ₱1,000,000
    expect(pressKey(state, '00')).toBe(state)
    expect(keypadCents(pressKey(state, '0'))).toBe(MAX_AMOUNT_CENTS)
  })

  it('clear empties everything', () => {
    expect(pressKey(type(['5', 'decimal', '5']), 'clear')).toEqual(EMPTY_KEYPAD)
  })
})

describe('keypad: centavos mode', () => {
  it('long-press 00 (decimal) switches to centavos; digits fill two places', () => {
    const entered = type(['1', '2', 'decimal'])
    expect(keypadDisplay(entered)).toBe('₱12.')
    const one = pressKey(entered, '5')
    expect(keypadCents(one)).toBe(1_250)
    expect(keypadDisplay(one)).toBe('₱12.5')
    const two = pressKey(one, '0')
    expect(keypadDisplay(two)).toBe('₱12.50')
    expect(pressKey(two, '9')).toBe(two)
  })

  it('00 in centavos mode fills what is left', () => {
    expect(keypadDisplay(type(['3', 'decimal', '00']))).toBe('₱3.00')
    expect(keypadDisplay(type(['3', 'decimal', '5', '00']))).toBe('₱3.50')
    const full = type(['3', 'decimal', '5', '5'])
    expect(pressKey(full, '00')).toBe(full)
  })

  it('decimal on an empty amount starts at ₱0. and a second decimal is ignored', () => {
    const state = type(['decimal', '7', '5'])
    expect(keypadCents(state)).toBe(75)
    expect(keypadDisplay(state)).toBe('₱0.75')
    expect(pressKey(state, 'decimal')).toBe(state)
  })

  it('backspace walks back through centavos and out of the mode', () => {
    const state = type(['4', 'decimal', '2', '5'])
    const steps = [
      pressKey(state, 'backspace'),
      pressKeys(state, ['backspace', 'backspace']),
      pressKeys(state, ['backspace', 'backspace', 'backspace']),
    ]
    expect(steps.map(keypadDisplay)).toEqual(['₱4.2', '₱4.', '₱4'])
  })

  it('cannot pass the cap with centavos', () => {
    const max = type(['1', '00', '00', '00', '0', 'decimal'])
    expect(pressKey(max, '1')).toBe(max)
    expect(keypadCents(pressKey(max, '0'))).toBe(MAX_AMOUNT_CENTS)
  })
})

describe('keypadFromCents', () => {
  it('round-trips whole and fractional amounts (repeat chips fill the keypad)', () => {
    expect(keypadDisplay(keypadFromCents(125_000))).toBe('₱1,250')
    expect(keypadDisplay(keypadFromCents(125_050))).toBe('₱1,250.50')
    expect(keypadCents(keypadFromCents(125_050))).toBe(125_050)
    expect(keypadFromCents(0)).toEqual(EMPTY_KEYPAD)
  })

  it('refuses amounts the keypad could never hold', () => {
    expect(keypadFromCents(-1)).toEqual(EMPTY_KEYPAD)
    expect(keypadFromCents(1.5)).toEqual(EMPTY_KEYPAD)
    expect(keypadFromCents(MAX_AMOUNT_CENTS + 1)).toEqual(EMPTY_KEYPAD)
  })
})

describe('formatPeso', () => {
  it('shows decimals only when they are not zero by default', () => {
    expect(formatPeso(125_000)).toBe('₱1,250')
    expect(formatPeso(125_050)).toBe('₱1,250.50')
    expect(formatPeso(5)).toBe('₱0.05')
    expect(formatPeso(0)).toBe('₱0')
  })

  it('always shows two decimals when asked (detail, export)', () => {
    expect(formatPeso(125_000, { decimals: 'always' })).toBe('₱1,250.00')
    expect(formatPeso(100_000_000_000, { decimals: 'always' })).toBe('₱1,000,000,000.00')
  })

  it('writes a loss with a real minus sign, never -0', () => {
    expect(formatPeso(-320_000)).toBe('−₱3,200')
    expect(formatPeso(-0)).toBe('₱0')
  })

  it('rounds stray fractions of a centavo', () => {
    expect(formatPeso(1_250.4)).toBe('₱12.50')
    expect(formatPeso(Number.NaN)).toBe('₱0')
  })
})

describe('parsePesoInput', () => {
  it.each([
    ['1,250.50', 125_050],
    ['₱80', 8_000],
    ['  ₱ 1,250 ', 125_000],
    ['1250.5', 125_050],
    ['.75', 75],
    ['12.', 1_200],
    ['0', 0],
    ['P80', 8_000],
    ['PHP 1,000,000', 100_000_000],
    ['10000000', MAX_AMOUNT_CENTS],
  ])('reads %p as %p centavos', (input, cents) => {
    expect(parsePesoInput(input)).toBe(cents)
  })

  it.each(['', '   ', '₱', '-80', '1.234', '12,34', '1,2345', 'abc', '1e3', '10000000.01', '1..2', '.'])(
    'refuses %p',
    (input) => {
      expect(parsePesoInput(input)).toBeNull()
    },
  )
})
