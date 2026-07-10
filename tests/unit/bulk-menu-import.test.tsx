/**
 * Behavioural spec for the reworked superadmin BulkMenuImport component
 * (AI menu parser v2 UI):
 *
 * - Two input modes: paste Text or upload menu Images (data URLs), switchable
 *   via tabs. Text mode is the default.
 * - Parse posts { menuText, images } to /api/ai/parse-menu.
 * - Image mode validates size/count client-side before adding.
 * - The parsed preview is editable: items can be removed before importing,
 *   and the import posts only the remaining items.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BulkMenuImport } from '@/components/superadmin/bulk-menu-import'

jest.mock('sonner', () => ({
    toast: { success: jest.fn(), error: jest.fn() },
}))

const parsedResponse = {
    success: true,
    data: {
        categories: [{ name: 'Milk Tea', icon: '🧋' }],
        items: [
            {
                name: 'Wintermelon',
                category: 'Milk Tea',
                price: 100,
                description: 'Silky wintermelon milk tea with a caramel finish',
                addons: [{ name: 'Pearls', price: 20 }],
            },
            { name: 'Okinawa', category: 'Milk Tea', price: 110 },
        ],
    },
}

function mockFetchOnce(body: unknown, ok = true) {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok,
        json: async () => body,
    })
}

beforeEach(() => {
    global.fetch = jest.fn()
})

describe('BulkMenuImport input modes', () => {
    test('defaults to text mode with a textarea, and can switch to image mode', () => {
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        expect(screen.getByRole('tab', { name: /paste text/i })).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/paste your menu/i)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: /upload images/i }))

        expect(screen.getByTestId('menu-image-input')).toBeInTheDocument()
    })

    test('parse button is disabled until there is input', () => {
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        const parseButton = screen.getByRole('button', { name: /parse menu/i })
        expect(parseButton).toBeDisabled()

        fireEvent.change(screen.getByPlaceholderText(/paste your menu/i), {
            target: { value: 'Burger P100' },
        })

        expect(parseButton).toBeEnabled()
    })
})

describe('BulkMenuImport parsing', () => {
    test('text mode posts menuText with an empty images array', async () => {
        mockFetchOnce(parsedResponse)
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        fireEvent.change(screen.getByPlaceholderText(/paste your menu/i), {
            target: { value: 'Wintermelon P100' },
        })
        fireEvent.click(screen.getByRole('button', { name: /parse menu/i }))

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/ai/parse-menu', expect.objectContaining({
                method: 'POST',
            }))
        })
        const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        expect(requestBody).toEqual({ menuText: 'Wintermelon P100', images: [] })
    })

    test('image mode reads the file into a data URL and posts it as images', async () => {
        mockFetchOnce(parsedResponse)
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        fireEvent.click(screen.getByRole('tab', { name: /upload images/i }))
        const file = new File(['fake-image-bytes'], 'menu.png', { type: 'image/png' })
        fireEvent.change(screen.getByTestId('menu-image-input'), { target: { files: [file] } })

        // thumbnail appears once the file is read
        await waitFor(() => {
            expect(screen.getByAltText(/menu page 1/i)).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /parse menu/i }))

        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
        expect(requestBody.images).toHaveLength(1)
        expect(requestBody.images[0]).toMatch(/^data:image\/png;base64,/)
    })

    test('renders parsed items with descriptions and add-ons in the preview', async () => {
        mockFetchOnce(parsedResponse)
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        fireEvent.change(screen.getByPlaceholderText(/paste your menu/i), {
            target: { value: 'menu' },
        })
        fireEvent.click(screen.getByRole('button', { name: /parse menu/i }))

        await waitFor(() => {
            expect(screen.getByText('Wintermelon')).toBeInTheDocument()
        })
        expect(screen.getByText(/silky wintermelon milk tea/i)).toBeInTheDocument()
        expect(screen.getByText(/pearls/i)).toBeInTheDocument()
    })
})

describe('BulkMenuImport editable preview and import', () => {
    test('removing an item excludes it from the import payload', async () => {
        mockFetchOnce(parsedResponse)
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        fireEvent.change(screen.getByPlaceholderText(/paste your menu/i), {
            target: { value: 'menu' },
        })
        fireEvent.click(screen.getByRole('button', { name: /parse menu/i }))

        await waitFor(() => expect(screen.getByText('Okinawa')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /remove okinawa/i }))
        expect(screen.queryByText('Okinawa')).not.toBeInTheDocument()

        mockFetchOnce({
            success: true,
            message: 'Import complete',
            results: { categoriesCreated: 1, categoriesSkipped: 0, itemsCreated: 1, itemsFailed: 0, errors: [] },
        })
        fireEvent.click(screen.getByRole('button', { name: /import 1 item/i }))

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
        const importCall = (global.fetch as jest.Mock).mock.calls[1]
        expect(importCall[0]).toBe('/api/tenants/t1/bulk-menu-import')
        const importBody = JSON.parse(importCall[1].body)
        expect(importBody.menuData.items).toHaveLength(1)
        expect(importBody.menuData.items[0].name).toBe('Wintermelon')
    })

    test('shows import results summary after a successful import', async () => {
        mockFetchOnce(parsedResponse)
        render(<BulkMenuImport tenantId="t1" tenantName="Test Cafe" />)

        fireEvent.change(screen.getByPlaceholderText(/paste your menu/i), {
            target: { value: 'menu' },
        })
        fireEvent.click(screen.getByRole('button', { name: /parse menu/i }))
        await waitFor(() => expect(screen.getByText('Wintermelon')).toBeInTheDocument())

        mockFetchOnce({
            success: true,
            message: 'Import complete',
            results: { categoriesCreated: 1, categoriesSkipped: 0, itemsCreated: 2, itemsFailed: 0, errors: [] },
        })
        fireEvent.click(screen.getByRole('button', { name: /import 2 items/i }))

        await waitFor(() => {
            expect(screen.getByText(/import results/i)).toBeInTheDocument()
        })
        const results = screen.getByText(/import results/i).closest('div')
        expect(within(results as HTMLElement).getByText(/categories created/i)).toBeInTheDocument()
    })
})
