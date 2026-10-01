/**
 * The superadmin tenant form writes Lalamove keys through `tenantSchema`.
 * Its key inputs are password fields, so a browser can fill a saved login
 * password into them; the schema refuses anything that is not a Lalamove key.
 */
import { tenantSchema } from '@/lib/tenants-service'

const baseTenant = {
  name: 'Cafe X',
  slug: 'cafe-x',
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123456',
}

describe('tenantSchema — Lalamove keys', () => {
  test('blank keys keep the stored ones and pass', () => {
    // Arrange / Act
    const result = tenantSchema.safeParse({
      ...baseTenant,
      lalamove_enabled: true,
      lalamove_api_key: '',
      lalamove_secret_key: '',
    })

    // Assert
    expect(result.success).toBe(true)
  })

  test('accepts production keys on a production store', () => {
    // Arrange / Act
    const result = tenantSchema.safeParse({
      ...baseTenant,
      lalamove_enabled: true,
      lalamove_sandbox: false,
      lalamove_api_key: 'pk_prod_abc',
      lalamove_secret_key: 'sk_prod_def',
    })

    // Assert
    expect(result.success).toBe(true)
  })

  test('refuses an autofilled password as the API key', () => {
    // Arrange / Act
    const result = tenantSchema.safeParse({
      ...baseTenant,
      lalamove_enabled: true,
      lalamove_sandbox: false,
      lalamove_api_key: 'admin123',
    })

    // Assert
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['lalamove_api_key'],
      message: expect.stringContaining('should start with pk_prod_'),
    })
  })

  test('refuses an autofilled password as the secret key', () => {
    // Arrange / Act
    const result = tenantSchema.safeParse({
      ...baseTenant,
      lalamove_sandbox: false,
      lalamove_secret_key: 'admin123',
    })

    // Assert
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['lalamove_secret_key'])
  })

  test('refuses production keys while the sandbox switch is on', () => {
    // The form defaults new tenants to sandbox; production keys there are
    // refused by Lalamove as bad credentials.
    // Arrange / Act
    const result = tenantSchema.safeParse({
      ...baseTenant,
      lalamove_enabled: true,
      lalamove_sandbox: true,
      lalamove_api_key: 'pk_prod_abc',
      lalamove_secret_key: 'sk_prod_def',
    })

    // Assert
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/sandbox/i)
  })
})
