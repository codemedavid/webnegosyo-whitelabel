import { parseSafeText } from "./safe-text"

describe('parseSafeText', () => {
  test('splits paragraphs and keeps bold runs', () => {
    expect(parseSafeText('Sales are **up 20%**.\n\nNice week.')).toEqual([
      { type: 'paragraph', runs: [{ text: 'Sales are ', isBold: false }, { text: 'up 20%', isBold: true }, { text: '.', isBold: false }] },
      { type: 'paragraph', runs: [{ text: 'Nice week.', isBold: false }] },
    ])
  })

  test('groups consecutive bullets and numbered items', () => {
    const blocks = parseSafeText('Try:\n- a combo\n- an SMS\n1. first\n2. second')

    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'bullets', 'numbered'])
    expect(blocks[1]).toEqual({ type: 'bullets', items: [[{ text: 'a combo', isBold: false }], [{ text: 'an SMS', isBold: false }]] })
  })

  test('markup and links stay inert text', () => {
    const blocks = parseSafeText('<img src=x onerror=alert(1)> [click](https://evil.example)')

    expect(blocks).toEqual([
      { type: 'paragraph', runs: [{ text: '<img src=x onerror=alert(1)> [click](https://evil.example)', isBold: false }] },
    ])
  })

  test('heading and quote markers are dropped, the words kept', () => {
    expect(parseSafeText('## Summary\n> note')).toEqual([
      { type: 'paragraph', runs: [{ text: 'Summary note', isBold: false }] },
    ])
  })
})
