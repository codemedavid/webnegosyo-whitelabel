import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { Owl, OWL_STATES } from '@/components/mascot/owl'

describe('<Owl>', () => {
  it('renders the requested state on the svg', () => {
    const { container } = render(<Owl state="happy" />)
    expect(container.querySelector('svg')?.getAttribute('data-state')).toBe('happy')
  })

  it('defaults to idle', () => {
    const { container } = render(<Owl />)
    expect(container.querySelector('svg')?.getAttribute('data-state')).toBe('idle')
  })

  it('is decorative unless given a label', () => {
    const { container, rerender } = render(<Owl />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    rerender(<Owl label="Owl is thinking" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Owl is thinking')
    expect(svg?.getAttribute('aria-hidden')).toBeNull()
  })

  it('keeps the art proportions for a given width', () => {
    const { container } = render(<Owl size={138} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('138')
    expect(svg?.getAttribute('height')).toBe('183')
  })

  it('gives two owls on one page no shared ids', () => {
    const { container } = render(<><Owl /><Owl /></>)
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('frames head and shoulders as a square for avatars', () => {
    const { container } = render(<Owl framing="bust" size={40} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('75 20 540 540')
    expect(svg?.getAttribute('height')).toBe('40')
  })

  it('drops the blur effects at icon size', () => {
    const { container } = render(<Owl size={48} />)
    expect(container.querySelector('[filter]')).toBeNull()
  })

  it('keeps the blur effects at full size', () => {
    const { container } = render(<Owl size={240} />)
    expect(container.querySelector('[filter]')).not.toBeNull()
  })
})

describe('owl state styles', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/mascot/owl.module.css'), 'utf8')

  it.each(OWL_STATES)('styles the %s state', (state) => {
    expect(css).toContain(`[data-state='${state}']`)
  })

  it('stops all motion for people who ask for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/)
  })
})
