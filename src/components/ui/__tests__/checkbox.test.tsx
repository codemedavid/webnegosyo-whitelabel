import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, jest } from '@jest/globals'
import { Checkbox } from '../checkbox'

describe('Checkbox', () => {
  it('renders checkbox', () => {
    render(<Checkbox />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('is unchecked by default', () => {
    render(<Checkbox />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('can be checked by default', () => {
    render(<Checkbox defaultChecked />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('can be controlled with checked prop', () => {
    render(<Checkbox checked={true} onChange={jest.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    
    render(<Checkbox onChange={handleChange} />)
    
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    
    expect(handleChange).toHaveBeenCalled()
  })

  it('can be disabled', () => {
    render(<Checkbox disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('applies custom className', () => {
    const { container } = render(<Checkbox className="custom-checkbox" />)
    const checkbox = container.querySelector('[data-state]')
    expect(checkbox).toHaveClass('custom-checkbox')
  })

  it('shows check icon when checked', () => {
    render(<Checkbox checked={true} onChange={jest.fn()} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveAttribute('data-state', 'checked')
  })

  it('does not show check icon when unchecked', () => {
    render(<Checkbox />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveAttribute('data-state', 'unchecked')
  })
})
