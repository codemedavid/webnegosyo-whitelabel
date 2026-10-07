import { buildFirstWeekPlan, listAppDownloads, resolvePlatformOrigin } from '@/lib/onboarding/first-week'

const PUBLISHED = new Map([
  ['downloading-the-app', 'Downloading the App'],
  ['connecting-sa-printer', 'Connecting Sa Printer'],
])

describe('buildFirstWeekPlan', () => {
  test('links only published lessons, on the platform host', () => {
    // Act
    const plan = buildFirstWeekPlan({ platformOrigin: 'https://www.webnegosyo.com', tenantSlug: 'brew-lab', lessons: PUBLISHED })

    // Assert
    const app = plan.steps.find((step) => step.id === 'app')
    expect(app?.lessons).toEqual([
      { title: 'Downloading the App', href: 'https://www.webnegosyo.com/university/getting-started/downloading-the-app' },
    ])
    expect(plan.steps.find((step) => step.id === 'photos')?.lessons).toEqual([])
    expect(plan.courseHref).toBe('https://www.webnegosyo.com/university/getting-started')
    expect(plan.courseLessonCount).toBe(2)
  })

  test('dashboard actions point at the store admin', () => {
    const plan = buildFirstWeekPlan({ platformOrigin: '', tenantSlug: 'brew-lab', lessons: PUBLISHED })
    expect(plan.steps.find((step) => step.id === 'photos')?.action).toEqual({ label: 'Open my menu', href: '/brew-lab/admin/menu' })
    expect(plan.steps.find((step) => step.id === 'app')?.action).toBeNull()
  })

  test('an unreadable course drops lesson links and falls back to the University home', () => {
    // Act
    const plan = buildFirstWeekPlan({ platformOrigin: '', tenantSlug: 'brew-lab', lessons: null })

    // Assert
    expect(plan.steps.every((step) => step.lessons.length === 0)).toBe(true)
    expect(plan.courseHref).toBe('/university')
    expect(plan.courseLessonCount).toBeNull()
  })

  test('the app comes first and the first order last', () => {
    const ids = buildFirstWeekPlan({ platformOrigin: '', tenantSlug: 's', lessons: null }).steps.map((step) => step.id)
    expect(ids[0]).toBe('app')
    expect(ids[ids.length - 1]).toBe('first_order')
  })
})

describe('listAppDownloads', () => {
  test('offers only hosted builds and explains the APK', () => {
    const downloads = listAppDownloads()
    expect(downloads.length).toBeGreaterThan(0)
    expect(downloads.every((download) => download.href.startsWith('https://'))).toBe(true)
    const android = downloads.find((download) => download.platform === 'android')
    if (android) expect(android.note).toMatch(/allow installs/i)
  })
})

describe('resolvePlatformOrigin', () => {
  test('prefers the app URL and trims trailing slashes', () => {
    expect(resolvePlatformOrigin({ NEXT_PUBLIC_APP_URL: 'https://www.webnegosyo.com/' })).toBe('https://www.webnegosyo.com')
  })

  test('falls back to the root domain, then to same-host', () => {
    expect(resolvePlatformOrigin({ PLATFORM_ROOT_DOMAIN: 'webnegosyo.com' })).toBe('https://webnegosyo.com')
    expect(resolvePlatformOrigin({})).toBe('')
  })
})
