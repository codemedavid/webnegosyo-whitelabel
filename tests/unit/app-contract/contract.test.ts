/**
 * The customer app's wire contract. The app renders whatever these schemas
 * admit, so every rejection here is a crash or a wrong price that cannot reach
 * a phone.
 */
import {
  VALID_CATALOG,
  VALID_CONFIG,
  VALID_LOYALTY,
  VALID_ORDER_DETAIL,
} from '../../fixtures/app-contract'

async function loadContract() {
  return import('@/lib/app-contract')
}

describe('app contract — config', () => {
  it('accepts a complete published config', async () => {
    const { appConfigSchema } = await loadContract()
    expect(appConfigSchema.safeParse(VALID_CONFIG).success).toBe(true)
  })

  it('rejects a colour that is not a six-digit hex', async () => {
    const { appConfigSchema } = await loadContract()
    const config = {
      ...VALID_CONFIG,
      theme: { ...VALID_CONFIG.theme, colors: { ...VALID_CONFIG.theme.colors, primary: 'red' } },
    }
    expect(appConfigSchema.safeParse(config).success).toBe(false)
  })

  it('rejects an unknown home block type', async () => {
    const { appConfigSchema } = await loadContract()
    const config = {
      ...VALID_CONFIG,
      home: { blocks: [{ id: 'x', type: 'marquee', visibleWhen: 'always' }] },
    }
    expect(appConfigSchema.safeParse(config).success).toBe(false)
  })

  it('rejects a banner url action that is not https', async () => {
    const { appBannerSchema } = await loadContract()
    const banner = {
      id: 'b1',
      imageUrl: 'https://cdn.example.com/a.jpg',
      action: { type: 'url', url: 'javascript:alert(1)' },
    }
    expect(appBannerSchema.safeParse(banner).success).toBe(false)
  })

  it('rejects duplicate home block ids', async () => {
    const { appConfigSchema } = await loadContract()
    const block = VALID_CONFIG.home.blocks[0]
    const config = { ...VALID_CONFIG, home: { blocks: [block, block] } }
    expect(appConfigSchema.safeParse(config).success).toBe(false)
  })
})

describe('app contract — catalog', () => {
  it('accepts a catalog with modifier groups, outlets and pairings', async () => {
    const { appCatalogSchema } = await loadContract()
    expect(appCatalogSchema.safeParse(VALID_CATALOG).success).toBe(true)
  })

  it('rejects a negative price', async () => {
    const { appCatalogSchema } = await loadContract()
    const [first, ...rest] = VALID_CATALOG.items
    const catalog = { ...VALID_CATALOG, items: [{ ...first, price: -1 }, ...rest] }
    expect(appCatalogSchema.safeParse(catalog).success).toBe(false)
  })

  it('rejects a modifier group whose max is below its min', async () => {
    const { appModifierGroupSchema } = await loadContract()
    const group = {
      id: 'g',
      name: 'Size',
      selectionMode: 'choice',
      minSelect: 2,
      maxSelect: 1,
      options: [],
    }
    expect(appModifierGroupSchema.safeParse(group).success).toBe(false)
  })
})

describe('app contract — loyalty and orders', () => {
  it('accepts a member wallet', async () => {
    const { appLoyaltySchema } = await loadContract()
    expect(appLoyaltySchema.safeParse(VALID_LOYALTY).success).toBe(true)
  })

  it('accepts an order detail', async () => {
    const { appOrderDetailSchema } = await loadContract()
    expect(appOrderDetailSchema.safeParse(VALID_ORDER_DETAIL).success).toBe(true)
  })

  it('rejects an order status outside the platform set', async () => {
    const { appOrderDetailSchema } = await loadContract()
    const order = { ...VALID_ORDER_DETAIL, status: 'lost' }
    expect(appOrderDetailSchema.safeParse(order).success).toBe(false)
  })
})

describe('app contract — envelope', () => {
  it('wraps success and failure distinctly', async () => {
    const { appEnvelopeSchema, appLoyaltySchema } = await loadContract()
    const schema = appEnvelopeSchema(appLoyaltySchema)
    expect(schema.safeParse({ success: true, data: VALID_LOYALTY, error: null }).success).toBe(true)
    expect(
      schema.safeParse({
        success: false,
        data: null,
        error: { code: 'rate_limited', message: 'Try again soon.' },
      }).success,
    ).toBe(true)
    expect(schema.safeParse({ success: true, data: null, error: null }).success).toBe(false)
  })
})
