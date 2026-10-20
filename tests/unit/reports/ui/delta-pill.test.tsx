import { render, screen } from '@testing-library/react'
import { DeltaPill, describeDelta } from '@/components/admin/reports/delta-pill'

describe('describeDelta', () => {
  it('returns null when the previous value is unknown', () => {
    expect(describeDelta({ current: 100, previous: null, polarity: 'higher_is_better', kind: 'count' })).toBeNull()
    expect(describeDelta({ current: null, previous: 100, polarity: 'higher_is_better', kind: 'count' })).toBeNull()
  })

  it('shows a signed percent for a large base, coloured good when higher is better', () => {
    const delta = describeDelta({ current: 11_200_000, previous: 10_000_000, polarity: 'higher_is_better', kind: 'money' })
    expect(delta).toMatchObject({ direction: 'up', tone: 'good', text: '+12%' })
    expect(delta?.spoken).toBe('Up 12% on the previous period')
  })

  it('flips the colour for lower-is-better metrics but keeps the arrow direction', () => {
    const delta = describeDelta({ current: 1_200_000, previous: 1_000_000, polarity: 'lower_is_better', kind: 'money' })
    expect(delta).toMatchObject({ direction: 'up', tone: 'bad', text: '+20%' })
    const down = describeDelta({ current: 800_000, previous: 1_000_000, polarity: 'lower_is_better', kind: 'money' })
    expect(down).toMatchObject({ direction: 'down', tone: 'good', text: '−20%' })
  })

  it('a neutral metric is grey whichever way it moves', () => {
    expect(describeDelta({ current: 50, previous: 100, polarity: 'neutral', kind: 'count' })).toMatchObject({
      direction: 'down',
      tone: 'neutral',
      text: '−50%',
    })
  })

  it('shows the absolute difference on a small count base, never "+300%"', () => {
    expect(describeDelta({ current: 4, previous: 1, polarity: 'higher_is_better', kind: 'count' })).toMatchObject({
      text: '+3',
      tone: 'good',
    })
    expect(describeDelta({ current: 3, previous: 0, polarity: 'higher_is_better', kind: 'count' })?.text).toBe('+3')
  })

  it('shows peso differences on a small money base (≤ ₱1,000 by default)', () => {
    expect(describeDelta({ current: 95_000, previous: 50_000, polarity: 'higher_is_better', kind: 'money' })?.text).toBe(
      '+₱450',
    )
    expect(describeDelta({ current: 5_000, previous: 50_000, polarity: 'higher_is_better', kind: 'money' })).toMatchObject({
      text: '−₱450',
      tone: 'bad',
    })
  })

  it('honours a custom small base', () => {
    expect(
      describeDelta({ current: 60, previous: 40, polarity: 'higher_is_better', kind: 'count', smallBase: 50 })?.text,
    ).toBe('+20')
  })

  it('reads "No change" in grey under half a percent', () => {
    expect(
      describeDelta({ current: 10_040_000, previous: 10_000_000, polarity: 'higher_is_better', kind: 'money' }),
    ).toMatchObject({ direction: 'flat', tone: 'neutral', text: 'No change' })
    expect(describeDelta({ current: 5, previous: 5, polarity: 'higher_is_better', kind: 'count' })?.text).toBe('No change')
  })

  it('shows ratios in percentage points', () => {
    expect(describeDelta({ current: 0.34, previous: 0.31, polarity: 'lower_is_better', kind: 'ratio' })).toMatchObject({
      text: '+3 pts',
      tone: 'bad',
    })
  })
})

describe('DeltaPill', () => {
  it('renders nothing when there is no previous value', () => {
    const { container } = render(
      <DeltaPill current={10} previous={null} polarity="higher_is_better" kind="count" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('carries an arrow, a sign, a tone and a spoken sentence with the compare label', () => {
    const { container } = render(
      <DeltaPill
        current={11_200_000}
        previous={10_000_000}
        polarity="higher_is_better"
        kind="money"
        compareLabel="on last week"
      />,
    )
    const pill = container.firstElementChild as HTMLElement
    expect(pill).toHaveAttribute('data-tone', 'good')
    expect(pill).toHaveAttribute('data-direction', 'up')
    expect(pill.className).toContain('emerald')
    expect(pill.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText('+12%')).toHaveAttribute('aria-hidden')
    expect(screen.getByText('Up 12% on last week')).toHaveClass('sr-only')
  })

  it('uses red for a bad move and grey for no change', () => {
    const { container, rerender } = render(
      <DeltaPill current={5} previous={100} polarity="higher_is_better" kind="count" />,
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('red')
    rerender(<DeltaPill current={100} previous={100} polarity="higher_is_better" kind="count" />)
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'neutral')
    expect(screen.getByText('No change')).toBeInTheDocument()
  })
})
