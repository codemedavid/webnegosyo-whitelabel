import { EMPTY_JOIN, JOIN_QUESTIONS, firstOpenQuestion, joinFieldError, previewStoreLink } from '@/components/onboarding/join-steps'

describe('join-steps', () => {
  test('asks the store name first, so the link preview has something to show', () => {
    expect(JOIN_QUESTIONS.map((question) => question.key)).toEqual(['business_name', 'name', 'email', 'phone'])
  })

  test('accepts PH mobile numbers in every common spelling', () => {
    expect(joinFieldError('phone', '0917 123 4567')).toBeNull()
    expect(joinFieldError('phone', '+63 917-123-4567')).toBeNull()
    expect(joinFieldError('phone', '1234')).not.toBeNull()
    expect(joinFieldError('phone', '08171234567')).not.toBeNull()
  })

  test('refuses an email without a domain and a one-letter name', () => {
    expect(joinFieldError('email', 'juan@')).not.toBeNull()
    expect(joinFieldError('email', ' juan@example.com ')).toBeNull()
    expect(joinFieldError('name', 'J')).not.toBeNull()
    expect(joinFieldError('business_name', 'Kape')).toBeNull()
  })

  test('resumes at the first unanswered question, and stays on the last when all are done', () => {
    expect(firstOpenQuestion(EMPTY_JOIN)).toBe(0)
    expect(firstOpenQuestion({ ...EMPTY_JOIN, business_name: 'Kape', name: 'Juan' })).toBe(2)
    expect(firstOpenQuestion({ business_name: 'Kape', name: 'Juan', email: 'j@x.co', phone: '09171234567' })).toBe(3)
  })

  test('previews the link with the build slug rule', () => {
    expect(previewStoreLink("Kape't Tinapay Café!", 'webnegosyo.com')).toBe('kapet-tinapay-cafe.webnegosyo.com')
    expect(previewStoreLink('  ', 'webnegosyo.com')).toBe('your-store.webnegosyo.com')
    expect(previewStoreLink('Kape', '')).toBe('kape')
  })
})
