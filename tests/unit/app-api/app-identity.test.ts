describe('readApplicationId', () => {
  const load = async () => (await import('@/lib/app-api/app-identity')).readApplicationId

  const headers = (value: string | null) => ({ get: (name: string) => (name.toLowerCase() === 'x-app-id' ? value : null) })

  it('accepts an iOS bundle id or an Android package', async () => {
    const readApplicationId = await load()
    expect(readApplicationId(headers('com.webnegosyo.kapedemo'))).toBe('com.webnegosyo.kapedemo')
    expect(readApplicationId(headers('com.webnegosyo.kape_demo'))).toBe('com.webnegosyo.kape_demo')
    expect(readApplicationId(headers('com.webnegosyo.Kape-Demo'))).toBe('com.webnegosyo.Kape-Demo')
  })

  it('trims surrounding whitespace', async () => {
    const readApplicationId = await load()
    expect(readApplicationId(headers('  com.webnegosyo.kapedemo '))).toBe('com.webnegosyo.kapedemo')
  })

  it.each([null, '', 'kapedemo', '.com.x', 'com..x', 'com.x.', '1com.x', 'com.x/../y', `com.${'a'.repeat(200)}`])(
    'refuses %p',
    async (value) => {
      const readApplicationId = await load()
      expect(readApplicationId(headers(value))).toBeNull()
    },
  )
})
