/**
 * Colour rows tell the owner where an unset colour comes from and warn, with a
 * one-tap fix, when a colour they chose is hard to read.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { FieldRow } from '@/components/admin/branding-studio/field-row'
import type { BrandingField } from '@/lib/branding-registry'

const optionText: BrandingField = { id: 'variation_option_text_color', label: 'Option text', type: 'color', default: '#374151' }

describe('colour rows', () => {
    it('says where an unset colour comes from', () => {
        render(<FieldRow field={optionText} value="#fafafa" isSet={false} inheritLabel="Brand" onChange={jest.fn()} onClear={jest.fn()} />)

        expect(screen.getByText(/Follows your store's brand/)).toBeInTheDocument()
    })

    it('warns about a hard-to-read colour and fixes it in one tap', () => {
        const onChange = jest.fn()
        render(
            <FieldRow
                field={optionText}
                value="#fefefe"
                isSet
                inheritLabel="Brand"
                onChange={onChange}
                onClear={jest.fn()}
                contrastIssue={{ ratio: 1.01, minRatio: 4.5, fix: '#111111' }}
            />,
        )

        expect(screen.getByText(/Hard to read/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Fix/ }))
        expect(onChange).toHaveBeenCalledWith('#111111')
    })

    it('shows no warning without an issue', () => {
        render(<FieldRow field={optionText} value="#111111" isSet inheritLabel="Brand" onChange={jest.fn()} onClear={jest.fn()} />)

        expect(screen.queryByText(/Hard to read/)).not.toBeInTheDocument()
    })
})
