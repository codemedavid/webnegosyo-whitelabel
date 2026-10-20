/**
 * Phone layout of the Studio: the settings sheet steps peek → half → full,
 * and the screen picker marks the screen being edited.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SettingsSheet, SurfaceRail, nextSheetSize, previewInsetFor, type SheetSize } from '@/components/admin/branding-studio/studio-shell'
import { BRANDING_SURFACES } from '@/lib/branding-registry'

function Sheet() {
    const [size, setSize] = useState<SheetSize>('peek')
    return <SettingsSheet size={size} onSizeChange={setSize} title="Cart"><p>Fields</p></SettingsSheet>
}

describe('settings sheet', () => {
    it('steps peek → half → full → peek', () => {
        expect([nextSheetSize('peek'), nextSheetSize('half'), nextSheetSize('full')]).toEqual(['half', 'full', 'peek'])
    })

    it('names the screen while it only peeks, and opens on tap', () => {
        render(<Sheet />)
        expect(screen.getByText('Cart settings')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Show more settings' }))

        expect(screen.getByRole('complementary', { name: 'Settings' })).toHaveAttribute('data-sheet', 'half')
        expect(screen.queryByText('Cart settings')).not.toBeInTheDocument()
    })

    it('keeps the preview clear of the sheet', () => {
        expect(previewInsetFor('peek')).toContain('pb-[64px]')
        expect(previewInsetFor('half')).toContain('pb-[48dvh]')
    })
})

describe('screen picker', () => {
    it('marks the screen being edited and switches screens', () => {
        const onPick = jest.fn()
        render(<SurfaceRail surfaces={BRANDING_SURFACES} activeId="cart" onPick={onPick} />)

        expect(screen.getByRole('button', { name: /Cart$/ })).toHaveAttribute('aria-current', 'page')
        fireEvent.click(screen.getByRole('button', { name: /Checkout/ }))

        expect(onPick).toHaveBeenCalledWith('checkout')
    })
})
