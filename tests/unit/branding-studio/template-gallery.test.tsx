import { fireEvent, render, screen } from '@testing-library/react'
import { CardTemplateGallery, PageLayoutGallery } from '@/components/admin/branding-studio/template-gallery'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import { PAGE_LAYOUTS } from '@/lib/page-layouts'
import { DEFAULT_BRANDING } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

const SAMPLE = {
  id: 'sample', name: 'Halo-halo', description: 'Shaved ice', price: 150, image_url: '',
  is_available: true, variations: [], addons: [],
} as unknown as MenuItem

describe('CardTemplateGallery', () => {
  it('offers every card template as a tile, flexible designs first', () => {
    render(<CardTemplateGallery value="classic" onChange={jest.fn()} label="Card template" context={{ sampleItem: SAMPLE, branding: DEFAULT_BRANDING }} />)

    const tiles = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
    expect(tiles).toHaveLength(CARD_TEMPLATES.length)
    expect(screen.getByText('Flexible')).toBeInTheDocument()
  })

  it('marks the current template and reports a new choice', () => {
    const onChange = jest.fn()
    render(<CardTemplateGallery value="classic" onChange={onChange} label="Card template" context={{ sampleItem: SAMPLE, branding: DEFAULT_BRANDING }} />)

    expect(screen.getByRole('button', { name: /^Classic/, pressed: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Kiosk/ }))

    expect(onChange).toHaveBeenCalledWith('kiosk')
  })
})

describe('PageLayoutGallery', () => {
  it('draws a wireframe tile for every page layout and reports a choice', () => {
    const onChange = jest.fn()
    render(<PageLayoutGallery value="default" onChange={onChange} label="Page layout" brand="#b91c1c" />)

    expect(screen.getAllByRole('button')).toHaveLength(PAGE_LAYOUTS.length)
    fireEvent.click(screen.getByRole('button', { name: /^Lookbook/ }))
    expect(onChange).toHaveBeenCalledWith('lookbook')
  })
})
