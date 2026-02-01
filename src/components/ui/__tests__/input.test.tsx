import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, jest } from '@jest/globals'
import { Input } from '../input'

describe('Input', () => {
  it('renders input with default props', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders input with placeholder', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText(/enter text/i)).toBeInTheDocument()
  })

  it('renders input with value', () => {
    render(<Input defaultValue="test value" />)
    expect(screen.getByDisplayValue(/test value/i)).toBeInTheDocument()
  })

  it('handles user input', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Type here" />)
    
    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello, World!')
    
    expect(input).toHaveValue('Hello, World!')
  })

  it('accepts different input types', () => {
    const { container } = render(<Input type="email" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'email')
  })

  it('can be disabled', () => {
    render(<Input disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies custom className', () => {
    const { container } = render(<Input className="custom-input" />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('custom-input')
  })

  it('applies required attribute', () => {
    const { container } = render(<Input required />)
    const input = container.querySelector('input')
    expect(input).toBeRequired()
  })

  it('handles onChange events', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    
    render(<Input onChange={handleChange} placeholder="Type here" />)
    
    const input = screen.getByRole('textbox')
    await user.type(input, 'a')
    
    expect(handleChange).toHaveBeenCalled()
  })
})
