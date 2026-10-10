import { pickMustWatch } from '@/lib/university/learn-picks'

const PUBLISHED = new Set([
  'welcome-to-smartmenu', 'downloading-the-app', 'first-order-sa-smartmenu', 'connecting-sa-printer',
  'introduction-sa-pos-walk-in-orders', 'adding-images-ng-items-managing-your-products', 'payment-methods-management',
])

describe('pickMustWatch', () => {
  it('puts the current step\'s lessons first, then the goal lessons, then the basics', () => {
    const picks = pickMustWatch({ goals: ['faster_counter'], currentStepLessons: ['downloading-the-app'], published: PUBLISHED, watched: new Set() })
    expect(picks.map((pick) => pick.slug)).toEqual([
      'downloading-the-app', 'introduction-sa-pos-walk-in-orders', 'connecting-sa-printer', 'welcome-to-smartmenu',
    ])
  })

  it('moves watched lessons behind the ones still to watch', () => {
    const picks = pickMustWatch({ goals: [], currentStepLessons: [], published: PUBLISHED, watched: new Set(['welcome-to-smartmenu']) })
    expect(picks).toEqual([
      { slug: 'downloading-the-app', isWatched: false },
      { slug: 'first-order-sa-smartmenu', isWatched: false },
      { slug: 'welcome-to-smartmenu', isWatched: true },
    ])
  })

  it('never offers a lesson that is not published', () => {
    const picks = pickMustWatch({ goals: ['ordering'], currentStepLessons: ['gone-lesson'], published: new Set(['welcome-to-smartmenu']), watched: new Set() })
    expect(picks.map((pick) => pick.slug)).toEqual(['welcome-to-smartmenu'])
  })
})
