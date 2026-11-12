import { DEV_APPLICATION_ID, resolveApplicationId } from './tenant-identity'

describe('resolveApplicationId', () => {
  it('uses the store build’s own id', () => {
    expect(resolveApplicationId('com.webnegosyo.kapedemo')).toBe('com.webnegosyo.kapedemo')
  })

  it.each([null, undefined, '', 'host.exp.Exponent', 'host.exp.exponent'])('falls back to the dev identity for %p', (id) => {
    expect(resolveApplicationId(id)).toBe(DEV_APPLICATION_ID)
  })
})
