import { fireEvent, render, screen } from '@testing-library/react'
import { ContrastSummary } from '@/components/admin/branding-studio/contrast-summary'

const ISSUES = [
    { fieldId: 'card_price_color', label: 'Price color', ratio: 1.1, minRatio: 3, fix: '#ffffff' },
    { fieldId: 'header_font_color', label: 'Title color', ratio: 1.2, minRatio: 4.5, fix: '#ffffff' },
]

describe('ContrastSummary', () => {
    it('counts what is hard to read and fixes one', () => {
        const onFix = jest.fn()
        render(<ContrastSummary issues={ISSUES} onFix={onFix} onFixAll={jest.fn()} />)

        expect(screen.getByText('2 things are hard to read')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Fix Price color' }))
        expect(onFix).toHaveBeenCalledWith('card_price_color', '#ffffff')
    })

    it('fixes everything at once', () => {
        const onFixAll = jest.fn()
        render(<ContrastSummary issues={ISSUES} onFix={jest.fn()} onFixAll={onFixAll} />)

        fireEvent.click(screen.getByRole('button', { name: 'Fix all' }))

        expect(onFixAll).toHaveBeenCalled()
    })

    it('says so when everything reads', () => {
        render(<ContrastSummary issues={[]} onFix={jest.fn()} onFixAll={jest.fn()} />)

        expect(screen.getByText(/easy to read/)).toBeInTheDocument()
    })
})
