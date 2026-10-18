/**
 * Inline label editing in the Studio preview: double-click a label, type,
 * Enter saves (one message to the editor), Escape cancels, and React's own
 * text node is always put back.
 */

import { fireEvent, render } from '@testing-library/react'
import { useInlineLabelEdit } from '@/components/customer/use-inline-label-edit'
import { BRANDING_TEXT_EDIT_MESSAGE, labelKeyOfScope } from '@/lib/branding-inspect'
import { cleanLabelText } from '@/lib/storefront-labels'

function Harness({ isActive = true }: { isActive?: boolean }) {
    useInlineLabelEdit(isActive)
    return <h1><span data-branding-scope="label/cart.title">Your Cart</span></h1>
}

function setup(isActive = true) {
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined)
    const view = render(<Harness isActive={isActive} />)
    const label = view.getByText('Your Cart')
    const textNode = label.firstChild
    return { postMessage, label, textNode }
}

function retype(label: HTMLElement, text: string) {
    label.textContent = text
}

afterEach(() => jest.restoreAllMocks())

describe('inline label editing', () => {
    it('double-click makes the label editable', () => {
        const { label } = setup()

        fireEvent.doubleClick(label)

        expect(label).toHaveAttribute('contenteditable', 'plaintext-only')
    })

    it('Enter sends the new words once and puts React\'s text back', () => {
        const { label, textNode, postMessage } = setup()
        fireEvent.doubleClick(label)

        retype(label, '  Your   tray ')
        fireEvent.keyDown(label, { key: 'Enter' })

        expect(postMessage).toHaveBeenCalledTimes(1)
        expect(postMessage).toHaveBeenCalledWith({ type: BRANDING_TEXT_EDIT_MESSAGE, key: 'cart.title', text: 'Your tray' }, window.location.origin)
        expect(label).not.toHaveAttribute('contenteditable')
        expect(label.firstChild).toBe(textNode)
        expect(label.textContent).toBe('Your Cart')
    })

    it('Escape cancels without telling the editor', () => {
        const { label, postMessage } = setup()
        fireEvent.doubleClick(label)

        retype(label, 'Nope')
        fireEvent.keyDown(label, { key: 'Escape' })

        expect(postMessage).not.toHaveBeenCalled()
        expect(label.textContent).toBe('Your Cart')
    })

    it('an unchanged label sends nothing', () => {
        const { label, postMessage } = setup()
        fireEvent.doubleClick(label)

        fireEvent.blur(label)

        expect(postMessage).not.toHaveBeenCalled()
    })

    it('does nothing outside edit mode', () => {
        const { label } = setup(false)

        fireEvent.doubleClick(label)

        expect(label).not.toHaveAttribute('contenteditable')
    })
})

describe('label text helpers', () => {
    it('keeps one trimmed line within the label\'s length', () => {
        expect(cleanLabelText(' a \n b ', 10)).toBe('a b')
        expect(cleanLabelText('abcdef', 3)).toBe('abc')
    })

    it('reads only known label scopes', () => {
        expect(labelKeyOfScope('label/cart.title')).toBe('cart.title')
        expect(labelKeyOfScope('label/__proto__')).toBeNull()
        expect(labelKeyOfScope('cart/item')).toBeNull()
        expect(labelKeyOfScope(42)).toBeNull()
    })
})
