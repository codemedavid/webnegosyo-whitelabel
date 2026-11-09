import { fireEvent, render, screen } from '@testing-library/react'

import type { HeroBuilderApi } from '@/components/hero-builder/editor/use-hero-builder'
import { FAMILY_BANNERS, rememberTemplatePick } from '@/components/page-designer/editor/family-banner'
import { familyStorageKey, parseFamilyPick } from '@/lib/page-designer/templates-families'

const TENANT = 't-1'
const target = { tenantId: TENANT, tenantSlug: 'island' }
const stored = () => parseFamilyPick(JSON.parse(window.localStorage.getItem(familyStorageKey(TENANT)) ?? 'null'))
const makeApi = () => ({ replaceDesign: jest.fn() }) as unknown as HeroBuilderApi & { replaceDesign: jest.Mock }

describe('"use the matching look" banner', () => {
  beforeEach(() => window.localStorage.clear())

  it('offers the matching look on another page and applies it through replaceDesign (undoable)', () => {
    rememberTemplatePick(TENANT, 'checkout', 'delivery-app')
    const api = makeApi()
    const Banner = FAMILY_BANNERS.confirmation
    render(<Banner api={api} target={target} isUnchanged />)
    expect(screen.getByText('You picked the Delivery app look for checkout — use the matching thank-you look?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
    expect(api.replaceDesign).toHaveBeenCalledTimes(1)
    expect(api.replaceDesign.mock.calls[0][0].page?.parts).toBeDefined()
    expect(screen.queryByText(/use the matching/)).toBeNull()
    expect(stored()?.done).toEqual(['checkout', 'confirmation'])
  })

  it('"No thanks" never asks again on that page and leaves the design alone', () => {
    rememberTemplatePick(TENANT, 'checkout', 'chat')
    const api = makeApi()
    const Banner = FAMILY_BANNERS.tracking
    const { unmount } = render(<Banner api={api} target={target} isUnchanged />)
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))
    expect(api.replaceDesign).not.toHaveBeenCalled()
    unmount()
    render(<Banner api={api} target={target} isUnchanged />)
    expect(screen.queryByText(/use the matching/)).toBeNull()
  })

  it('stays quiet once the design was changed, on the page the look came from, and without a family pick', () => {
    rememberTemplatePick(TENANT, 'checkout', 'editorial')
    const { unmount } = render(<FAMILY_BANNERS.tracking api={makeApi()} target={target} isUnchanged={false} />)
    expect(screen.queryByText(/use the matching/)).toBeNull()
    unmount()
    const same = render(<FAMILY_BANNERS.checkout api={makeApi()} target={target} isUnchanged />)
    expect(screen.queryByText(/use the matching/)).toBeNull()
    same.unmount()
    rememberTemplatePick(TENANT, 'checkout', 'minimal')
    render(<FAMILY_BANNERS.tracking api={makeApi()} target={target} isUnchanged />)
    expect(screen.queryByText(/use the matching/)).toBeNull()
  })
})
