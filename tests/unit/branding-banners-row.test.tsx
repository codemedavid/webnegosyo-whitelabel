import { render, screen, fireEvent } from '@testing-library/react'
import { FieldRow, type FieldRowProps } from '@/components/admin/branding-studio/field-row'
import type { BrandingField } from '@/lib/branding-registry'
import type { PromotionBanner } from '@/types/database'

/**
 * BannersRow — the inline promotion-banner manager in the Branding Studio.
 * Merchants add/remove/reorder banners and edit each one's title/description
 * plus upload an image, all without leaving the branding editor. Every edit
 * emits a NEW array (immutable) via onChange so the live preview updates and
 * publish persists tenant.promotion_banners.
 *
 * The heavy ImageUpload widget (hits ImageKit) is mocked to a button that
 * reports a fixed URL, keeping the test on BannersRow's own behavior.
 */
jest.mock('@/components/shared/image-upload', () => ({
  ImageUpload: ({ onImageUploaded }: { onImageUploaded: (url: string) => void }) => (
    <button type="button" onClick={() => onImageUploaded('https://cdn/new.jpg')}>
      mock-upload
    </button>
  ),
}))

const field: BrandingField = { id: 'promotion_banners', label: 'Promotion banners', type: 'banners' }

function renderBanners(value: PromotionBanner[], onChange = jest.fn()) {
  const props: FieldRowProps = {
    field,
    value,
    isSet: value.length > 0,
    inheritLabel: 'Default',
    onChange,
    onClear: jest.fn(),
  }
  render(<FieldRow {...props} />)
  return onChange
}

const twoBanners: PromotionBanner[] = [
  { id: 'b1', imageUrl: 'https://cdn/1.jpg', title: 'First' },
  { id: 'b2', imageUrl: 'https://cdn/2.jpg', title: 'Second' },
]

describe('BannersRow', () => {
  it('renders one editor block per existing banner', () => {
    renderBanners(twoBanners)
    expect(screen.getByDisplayValue('First')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument()
  })

  it('appends a new empty banner when "Add banner" is clicked', () => {
    const onChange = renderBanners([])
    fireEvent.click(screen.getByRole('button', { name: /add banner/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as PromotionBanner[]
    expect(next).toHaveLength(1)
    expect(next[0].id).toBeTruthy()
  })

  it('removes the targeted banner without mutating the input array', () => {
    const original = [...twoBanners]
    const onChange = renderBanners(twoBanners)
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0])
    const next = onChange.mock.calls[0][0] as PromotionBanner[]
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('b2')
    expect(twoBanners).toEqual(original) // immutable
  })

  it('edits a banner title and emits an updated copy', () => {
    const onChange = renderBanners(twoBanners)
    fireEvent.change(screen.getByDisplayValue('First'), { target: { value: 'Updated' } })
    const next = onChange.mock.calls[0][0] as PromotionBanner[]
    expect(next[0].title).toBe('Updated')
    expect(next[1].title).toBe('Second')
    expect(twoBanners[0].title).toBe('First') // immutable
  })

  it('reorders banners when "move up" is clicked', () => {
    const onChange = renderBanners(twoBanners)
    fireEvent.click(screen.getAllByRole('button', { name: /move up/i })[1])
    const next = onChange.mock.calls[0][0] as PromotionBanner[]
    expect(next.map((b) => b.id)).toEqual(['b2', 'b1'])
  })

  it('stores an uploaded image url on the banner', () => {
    const onChange = renderBanners(twoBanners)
    fireEvent.click(screen.getAllByRole('button', { name: /mock-upload/i })[0])
    const next = onChange.mock.calls[0][0] as PromotionBanner[]
    expect(next[0].imageUrl).toBe('https://cdn/new.jpg')
  })
})
