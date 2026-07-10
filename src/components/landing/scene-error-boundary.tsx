'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface SceneErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Isolates the decorative 3D WebGL hero (Three.js / react-three-fiber) so a
 * renderer failure degrades to a static fallback instead of blanking the whole
 * landing page via app/global-error.tsx.
 *
 * WebGL can fail on the client for reasons outside our control — unsupported /
 * disabled WebGL, a lost GPU context, or Three.js throwing during init (the
 * production `undefined is not an object (evaluating 'i.canvas[a]')` crash).
 * None of those should take the marketing site down.
 */
export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Landing 3D scene failed, showing static fallback:', error.message, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
