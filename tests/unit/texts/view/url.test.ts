import { DEFAULT_URL_STATE, opensSheet, parseTextsParams, serializeTextsParams, patchTextsParams } from '@/lib/texts/view/url'

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

describe('texts URL state', () => {
  test('defaults', () => {
    expect(parseTextsParams(new URLSearchParams())).toEqual(DEFAULT_URL_STATE)
    expect(serializeTextsParams(DEFAULT_URL_STATE)).toBe('')
  })

  test('unknown values fall back', () => {
    const state = parseTextsParams(new URLSearchParams('tab=nope&filter=x&show=weird&focus=evil'))
    expect(state.tab).toBe('campaigns')
    expect(state.filter).toBe('all')
    expect(state.show).toBe('all')
    expect(state.focus).toBeNull()
  })

  test('campaign sheets', () => {
    expect(parseTextsParams(new URLSearchParams('campaign=new&preset=weekend_promo'))).toMatchObject({ campaign: 'new', preset: 'weekend_promo' })
    expect(parseTextsParams(new URLSearchParams(`campaign=${UUID}&edit=1`))).toMatchObject({ campaign: UUID, edit: true })
    expect(parseTextsParams(new URLSearchParams('campaign=../../etc')).campaign).toBeNull()
    expect(parseTextsParams(new URLSearchParams('campaign=new&preset=nope')).preset).toBeNull()
    expect(parseTextsParams(new URLSearchParams('campaign=new&preset=blank')).preset).toBe('blank')
  })

  test('automatic implies its tab, and only real recipes', () => {
    expect(parseTextsParams(new URLSearchParams('automatic=win_back'))).toMatchObject({ tab: 'automatic', automatic: 'win_back' })
    expect(parseTextsParams(new URLSearchParams('automatic=hack')).automatic).toBeNull()
  })

  test('phones sheet and a phone to highlight', () => {
    expect(parseTextsParams(new URLSearchParams(`phones=1&phone=${UUID}`))).toMatchObject({ phones: true, phone: UUID })
  })

  test('activity filters', () => {
    const state = parseTextsParams(new URLSearchParams(`tab=activity&show=waiting&from=campaign:${UUID}`))
    expect(state).toMatchObject({ tab: 'activity', show: 'waiting', from: `campaign:${UUID}` })
    expect(parseTextsParams(new URLSearchParams('from=auto:win_back')).from).toBe('auto:win_back')
    expect(parseTextsParams(new URLSearchParams('from=bad')).from).toBeNull()
  })

  test('serialize keeps only what differs, in a stable order', () => {
    const state = { ...DEFAULT_URL_STATE, tab: 'rules' as const, focus: 'review_link' as const }
    expect(serializeTextsParams(state)).toBe('tab=rules&focus=review_link')
    expect(parseTextsParams(new URLSearchParams(serializeTextsParams(state)))).toEqual(state)
  })

  test('patch merges and closing a sheet drops its companions', () => {
    const open = { ...DEFAULT_URL_STATE, campaign: 'new', preset: 'weekend_promo' }
    expect(patchTextsParams(open, { campaign: null })).toEqual(DEFAULT_URL_STATE)
    expect(patchTextsParams({ ...DEFAULT_URL_STATE, phones: true, phone: UUID }, { phones: false }).phone).toBeNull()
  })

  test('view=report opens the report', () => {
    const state = parseTextsParams(new URLSearchParams(`campaign=${UUID}&view=report`))
    expect(state.isReport).toBe(true)
    expect(serializeTextsParams(state)).toBe(`campaign=${UUID}&view=report`)
  })

  test('opening a sheet pushes, everything else replaces', () => {
    expect(opensSheet(DEFAULT_URL_STATE, { ...DEFAULT_URL_STATE, campaign: 'new' })).toBe(true)
    expect(opensSheet(DEFAULT_URL_STATE, { ...DEFAULT_URL_STATE, phones: true })).toBe(true)
    expect(opensSheet(DEFAULT_URL_STATE, { ...DEFAULT_URL_STATE, automatic: 'win_back' })).toBe(true)
    expect(opensSheet(DEFAULT_URL_STATE, { ...DEFAULT_URL_STATE, tab: 'rules' })).toBe(false)
    const open = { ...DEFAULT_URL_STATE, campaign: 'new' }
    expect(opensSheet(open, { ...open, preset: 'blank' })).toBe(false)
  })
})
