import { render, screen, fireEvent } from '@testing-library/react'
import { OptimizedImage } from '@/components/shared/optimized-image'

/**
 * OptimizedImage should support a `fallbackSrc` used when the primary `src`
 * is empty OR when the primary image fails to load. This powers the tenant
 * logo fallback for menu item images.
 *
 * Non-CDN hosts are used so the component takes the standard Next.js Image
 * path (no Cloudinary/ImageKit URL rewriting), keeping assertions stable.
 */

function imgSrc(): string {
  return decodeURIComponent(screen.getByRole('img').getAttribute('src') || '')
}

describe('OptimizedImage — fallbackSrc', () => {
  it('renders nothing when both src and fallbackSrc are empty', () => {
    const { container } = render(
      <OptimizedImage src={null} alt="Empty" width={100} height={100} />
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the fallback image when src is empty but fallbackSrc is set', () => {
    render(
      <OptimizedImage
        src={null}
        fallbackSrc="https://cdn.test/logo.png"
        alt="Logo fallback"
        width={100}
        height={100}
      />
    )
    expect(imgSrc()).toContain('cdn.test/logo.png')
  })

  it('renders the primary image when src is present, ignoring the fallback', () => {
    render(
      <OptimizedImage
        src="https://cdn.test/photo.png"
        fallbackSrc="https://cdn.test/logo.png"
        alt="Photo"
        width={100}
        height={100}
      />
    )
    const src = imgSrc()
    expect(src).toContain('cdn.test/photo.png')
    expect(src).not.toContain('logo.png')
  })

  it('swaps to the fallback image when the primary image fails to load', () => {
    render(
      <OptimizedImage
        src="https://cdn.test/photo.png"
        fallbackSrc="https://cdn.test/logo.png"
        alt="Photo"
        width={100}
        height={100}
      />
    )
    expect(imgSrc()).toContain('cdn.test/photo.png')

    fireEvent.error(screen.getByRole('img'))

    expect(imgSrc()).toContain('cdn.test/logo.png')
  })

  it('renders nothing when src is empty and no fallback is provided', () => {
    const { container } = render(
      <OptimizedImage src="" alt="Empty" width={100} height={100} />
    )
    expect(container.querySelector('img')).toBeNull()
  })
})
