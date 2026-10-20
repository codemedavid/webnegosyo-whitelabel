/**
 * The Studio colour picker offers the store's own colours first, then any
 * colour by hex or the system picker, and a way back to the default.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { ColorPicker } from '@/components/admin/branding-studio/color-picker'

const STORE_COLORS = [
    { label: 'Brand', color: '#e8b83f' },
    { label: 'Cards', color: '#1a1a1a' },
    { label: 'Text', color: '#fafafa' },
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof ColorPicker>> = {}) {
    const onChange = jest.fn()
    const onUseDefault = jest.fn()
    render(
        <ColorPicker
            label="Option background"
            value="#1a1a1a"
            storeColors={STORE_COLORS}
            onChange={onChange}
            onUseDefault={onUseDefault}
            defaultLabel="Cards"
            isSet
            {...overrides}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Option background/ }))
    return { onChange, onUseDefault }
}

describe('ColorPicker', () => {
    it('picks one of the store\'s colours', () => {
        const { onChange } = renderPicker()

        fireEvent.click(screen.getByRole('button', { name: /^Brand/ }))

        expect(onChange).toHaveBeenCalledWith('#e8b83f')
    })

    it('marks the store colour in use', () => {
        renderPicker()

        expect(screen.getByRole('button', { name: /^Cards/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('takes a typed hex code, with or without #', () => {
        const { onChange } = renderPicker()
        const input = screen.getByRole('textbox', { name: /hex code/ })

        fireEvent.change(input, { target: { value: 'ABCDEF' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(onChange).toHaveBeenCalledWith('#abcdef')
    })

    it('ignores a hex code that is not a colour', () => {
        const { onChange } = renderPicker()
        const input = screen.getByRole('textbox', { name: /hex code/ })

        fireEvent.change(input, { target: { value: 'nope' } })
        fireEvent.blur(input)

        expect(onChange).not.toHaveBeenCalled()
        expect(input).toHaveValue('#1a1a1a')
    })

    it('does not turn a followed colour into an override when the hex is left unchanged', () => {
        const { onChange } = renderPicker({ isSet: false })
        const input = screen.getByRole('textbox', { name: /hex code/ })

        fireEvent.blur(input)
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(onChange).not.toHaveBeenCalled()
    })

    it('goes back to what the field follows', () => {
        const { onUseDefault } = renderPicker()

        fireEvent.click(screen.getByRole('button', { name: 'Back to Cards' }))

        expect(onUseDefault).toHaveBeenCalled()
    })

    it('offers no way back when nothing is set', () => {
        renderPicker({ isSet: false })

        expect(screen.queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
    })
})
