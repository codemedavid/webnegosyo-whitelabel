/**
 * The set-up wizard's menu photos: an owner can pick several pages in ONE
 * file dialog. Pages upload one after another (each server reply carries every
 * photo so far), extra pages beyond the cap are skipped with a note, and one
 * failed page never stops the rest.
 */

import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/components/onboarding/shrink-photo', () => ({
  shrinkPhoto: (file: File) => Promise.resolve(file),
}))

const MAX = 3

function photo(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

async function renderGrid(options: { initial?: string[]; failOn?: string } = {}) {
  // Imported lazily: next/jest leaves static imports ahead of jest.mock.
  const { MenuPhotoGrid } = await import('@/components/onboarding/menu-photo-grid')
  const uploaded: string[] = []

  function Harness() {
    const [urls, setUrls] = useState<string[]>(options.initial ?? [])
    return (
      <MenuPhotoGrid
        urls={urls}
        max={MAX}
        onUpload={async (file) => {
          if (file.name === options.failOn) return 'We could not upload that photo. Please try again.'
          uploaded.push(file.name)
          setUrls((current) => [...current, `https://img.test/${file.name}`])
          return null
        }}
        onRemove={async (index) => {
          setUrls((current) => current.filter((_, at) => at !== index))
          return null
        }}
      />
    )
  }

  render(<Harness />)
  return { uploaded }
}

function picker(): HTMLInputElement {
  return screen.getByLabelText(/choose menu photos/i) as HTMLInputElement
}

describe('MenuPhotoGrid', () => {
  it('lets the owner pick several photos in one dialog', async () => {
    await renderGrid()

    expect(picker()).toHaveAttribute('multiple')
  })

  it('uploads every picked photo, in the order picked', async () => {
    const user = userEvent.setup()
    const { uploaded } = await renderGrid()

    await user.upload(picker(), [photo('page-1.jpg'), photo('page-2.jpg'), photo('page-3.jpg')])

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3))
    expect(uploaded).toEqual(['page-1.jpg', 'page-2.jpg', 'page-3.jpg'])
  })

  it('adds only what fits under the cap and says how many were left out', async () => {
    const user = userEvent.setup()
    const { uploaded } = await renderGrid({ initial: ['https://img.test/existing.jpg'] })

    await user.upload(picker(), [photo('a.jpg'), photo('b.jpg'), photo('c.jpg'), photo('d.jpg')])

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(MAX))
    expect(uploaded).toEqual(['a.jpg', 'b.jpg'])
    expect(screen.getByRole('alert')).toHaveTextContent(/2 photos were not added/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 3/i)
  })

  it('keeps uploading the rest when one photo fails, and shows the error', async () => {
    const user = userEvent.setup()
    const { uploaded } = await renderGrid({ failOn: 'b.jpg' })

    await user.upload(picker(), [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])

    await waitFor(() => expect(uploaded).toEqual(['a.jpg', 'c.jpg']))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not upload/i)
  })

  it('hides the add tile once the menu is full', async () => {
    await renderGrid({ initial: ['https://img.test/1.jpg', 'https://img.test/2.jpg', 'https://img.test/3.jpg'] })

    expect(screen.queryByLabelText(/choose menu photos/i)).not.toBeInTheDocument()
  })

  it('removes a photo', async () => {
    const user = userEvent.setup()
    await renderGrid({ initial: ['https://img.test/1.jpg', 'https://img.test/2.jpg'] })

    await user.click(screen.getAllByRole('button', { name: /remove/i })[0])

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
  })
})
