import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, jest } from '@jest/globals'
import { Button } from '../button'

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('applies default variant styles', () => {
    const { container } = render(<Button>Default Button</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('bg-primary')
  })

  it('applies destructive variant', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('bg-destructive')
  })

  it('applies outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('border')
  })

  it('applies size variations', () => {
    const { container: smContainer } = render(<Button size="sm">Small</Button>)
    const { container: lgContainer } = render(<Button size="lg">Large</Button>)
    
    expect(smContainer.querySelector('button')).toHaveClass('h-8')
    expect(lgContainer.querySelector('button')).toHaveClass('h-10')
  })

  it('applies icon size', () => {
    const { container } = render(<Button size="icon">Icon</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('size-9')
  })

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleClick = jest.fn()
    
    render(<Button onClick={handleClick}>Click me</Button>)
    await user.click(screen.getByRole('button'))
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('accepts custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('custom-class')
  })

  it('renders as child component when asChild is true', () => {
    const { container } = render(
      <Button asChild>
        <a href="#" data-testid="link">Link Button</a>
      </Button>
    )
    expect(container.querySelector('a')).toBeInTheDocument()
  })
})
