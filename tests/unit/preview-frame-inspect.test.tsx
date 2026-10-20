import { render, act } from '@testing-library/react'
import { PreviewFrame } from '@/components/admin/branding-studio/preview-frame'
import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
  BRANDING_TEXT_EDIT_MESSAGE,
} from '@/lib/branding-inspect'

/**
 * Editor side of the click-to-inspect bridge: the PreviewFrame forwards the
 * Studio's inspect-mode toggle into the iframe and surfaces the iframe's
 * scope-selection messages back to the Studio.
 */

const DRAFT_DEBOUNCE_FLUSH_MS = 100

function renderFrame(props: Partial<React.ComponentProps<typeof PreviewFrame>> = {}) {
  return render(
    <PreviewFrame
      tenantSlug="demo"
      surfaceId="storefront"
      draft={{}}
      device="desktop"
      inspectMode={false}
      onScopeSelected={jest.fn()}
      {...props}
    />
  )
}

function getFramePostMessageSpy(container: HTMLElement): jest.SpyInstance {
  const iframe = container.querySelector('iframe')
  expect(iframe).not.toBeNull()
  return jest.spyOn(iframe!.contentWindow!, 'postMessage').mockImplementation(() => {})
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('PreviewFrame inspect bridge', () => {
  it('posts inspect-mode enable to the iframe when the toggle turns on', () => {
    const { container, rerender } = renderFrame()
    const spy = getFramePostMessageSpy(container)

    rerender(
      <PreviewFrame
        tenantSlug="demo"
        surfaceId="storefront"
        draft={{}}
        device="desktop"
        inspectMode={true}
        onScopeSelected={jest.fn()}
      />
    )
    act(() => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_FLUSH_MS)
    })

    expect(spy).toHaveBeenCalledWith(
      { type: BRANDING_INSPECT_MODE_MESSAGE, enabled: true },
      window.location.origin
    )
  })

  it('forwards same-origin scope selections to onScopeSelected', () => {
    const onScopeSelected = jest.fn()
    renderFrame({ onScopeSelected })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: BRANDING_SCOPE_SELECTED_MESSAGE, scope: 'storefront/header' },
          origin: window.location.origin,
        })
      )
    })

    expect(onScopeSelected).toHaveBeenCalledWith('storefront/header')
  })

  it('ignores scope selections from other origins', () => {
    const onScopeSelected = jest.fn()
    renderFrame({ onScopeSelected })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: BRANDING_SCOPE_SELECTED_MESSAGE, scope: 'storefront/header' },
          origin: 'https://evil.example',
        })
      )
    })

    expect(onScopeSelected).not.toHaveBeenCalled()
  })

  it('ignores selection payloads without a string scope', () => {
    const onScopeSelected = jest.fn()
    renderFrame({ onScopeSelected })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: BRANDING_SCOPE_SELECTED_MESSAGE, scope: 42 },
          origin: window.location.origin,
        })
      )
    })

    expect(onScopeSelected).not.toHaveBeenCalled()
  })
})

describe('PreviewFrame inline text edits', () => {
  function send(data: unknown, origin = window.location.origin) {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin }))
    })
  }

  it('hands a retyped label to the editor, cleaned and within length', () => {
    const onLabelEdited = jest.fn()
    renderFrame({ onLabelEdited })

    send({ type: BRANDING_TEXT_EDIT_MESSAGE, key: 'menu.add', text: '  Add   it to my order please now  ' })

    expect(onLabelEdited).toHaveBeenCalledWith('menu.add', 'Add it to my order pleas')
  })

  it('ignores unknown labels, other origins and non-text', () => {
    const onLabelEdited = jest.fn()
    renderFrame({ onLabelEdited })

    send({ type: BRANDING_TEXT_EDIT_MESSAGE, key: '__proto__', text: 'x' })
    send({ type: BRANDING_TEXT_EDIT_MESSAGE, key: 'cart.title', text: 'x' }, 'https://evil.example')
    send({ type: BRANDING_TEXT_EDIT_MESSAGE, key: 'cart.title', text: 42 })

    expect(onLabelEdited).not.toHaveBeenCalled()
  })
})
