import { render, screen, fireEvent } from '@testing-library/react'
import { FieldRow, type FieldRowProps } from '@/components/admin/branding-studio/field-row'
import type { BrandingField } from '@/lib/branding-registry'

/**
 * ImageRow — the Branding Studio 'image' field (used by the page background).
 * Merchants either upload a file (ImageKit) or paste a URL, and can clear it.
 * The heavy ImageUpload widget is mocked so the test stays on ImageRow.
 */
jest.mock('@/components/shared/image-upload', () => ({
  ImageUpload: ({ onImageUploaded }: { onImageUploaded: (url: string) => void }) => (
    <button type="button" onClick={() => onImageUploaded('https://cdn/uploaded.jpg')}>
      mock-upload
    </button>
  ),
}))

const field: BrandingField = {
  id: 'background_image_url',
  label: 'Background image',
  type: 'image',
  default: '',
  placeholder: 'https://…/photo.jpg',
}

function renderImageRow(value: string, onChange = jest.fn()) {
  const props: FieldRowProps = {
    field,
    value,
    isSet: value !== '',
    inheritLabel: 'None',
    onChange,
    onClear: jest.fn(),
  }
  render(<FieldRow {...props} />)
  return onChange
}

describe('FieldRow — image', () => {
  it('emits the uploaded URL', () => {
    const onChange = renderImageRow('')

    fireEvent.click(screen.getByText('mock-upload'))

    expect(onChange).toHaveBeenCalledWith('https://cdn/uploaded.jpg')
  })

  it('emits a pasted URL', () => {
    const onChange = renderImageRow('')

    fireEvent.change(screen.getByLabelText('Background image URL'), {
      target: { value: 'https://cdn/pasted.jpg' },
    })

    expect(onChange).toHaveBeenCalledWith('https://cdn/pasted.jpg')
  })

  it('clears the value when removed', () => {
    const onChange = renderImageRow('https://cdn/current.jpg')

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('hides the remove control when no image is set', () => {
    renderImageRow('')

    expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument()
  })
})
