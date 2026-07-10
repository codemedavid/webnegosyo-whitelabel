import { render, screen } from '@testing-library/react'
import { SceneErrorBoundary } from '@/components/landing/scene-error-boundary'

/**
 * Regression test for the production landing-page crash:
 *   TypeError: undefined is not an object (evaluating 'i.canvas[a]')
 *
 * The 3D WebGL hero (Three.js / react-three-fiber) can throw on the client
 * when WebGL is unavailable, the context is lost, or the renderer fails to
 * initialise. Without a boundary the throw bubbles to app/global-error.tsx and
 * blanks the entire marketing site. The decorative scene must degrade to a
 * static fallback instead of taking down the page.
 */

function Boom(): never {
  throw new Error("undefined is not an object (evaluating 'i.canvas[a]')")
}

// componentDidCatch logs to console.error; silence it for the throwing cases.
let consoleErrorSpy: jest.SpyInstance

beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('SceneErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <SceneErrorBoundary fallback={<div data-testid="fallback" />}>
        <div data-testid="scene">3D scene</div>
      </SceneErrorBoundary>
    )

    expect(screen.getByTestId('scene')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
  })

  it('renders the fallback when a child throws a WebGL/Three error', () => {
    render(
      <SceneErrorBoundary fallback={<div data-testid="fallback" />}>
        <Boom />
      </SceneErrorBoundary>
    )

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  })

  it('does not rethrow — sibling content around the boundary keeps rendering', () => {
    render(
      <div>
        <SceneErrorBoundary fallback={<div data-testid="fallback" />}>
          <Boom />
        </SceneErrorBoundary>
        <main data-testid="page-content">Landing content still visible</main>
      </div>
    )

    // The page itself must survive the scene failure.
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
  })

  it('renders nothing (not a crash) when no fallback is provided and a child throws', () => {
    const { container } = render(
      <SceneErrorBoundary>
        <Boom />
      </SceneErrorBoundary>
    )

    expect(container).toBeEmptyDOMElement()
  })
})
