'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

interface NavigationProgressProps {
  color?: string
}

/**
 * Top-of-page progress bar that shows during Next.js App Router navigations.
 * Works with both <Link> clicks and programmatic router.push() calls
 * by patching history.pushState/replaceState and monitoring pathname changes.
 */
export function NavigationProgress({ color = '#111111' }: NavigationProgressProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPathRef = useRef(pathname + searchParams.toString())

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (trickleRef.current) clearInterval(trickleRef.current)
    timerRef.current = null
    trickleRef.current = null
  }, [])

  const start = useCallback(() => {
    cleanup()
    setProgress(15)
    setVisible(true)
    // Trickle: slowly increase progress to give perception of loading
    trickleRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        // Slow down as we approach 90%
        const increment = prev < 50 ? 5 : prev < 80 ? 2 : 0.5
        return Math.min(prev + increment, 90)
      })
    }, 200)
  }, [cleanup])

  const finish = useCallback(() => {
    cleanup()
    setProgress(100)
    timerRef.current = setTimeout(() => {
      setVisible(false)
      // Reset after fade-out
      timerRef.current = setTimeout(() => setProgress(0), 200)
    }, 300)
  }, [cleanup])

  // Detect navigation completion via pathname/searchParams change
  useEffect(() => {
    const current = pathname + searchParams.toString()
    if (prevPathRef.current !== current) {
      prevPathRef.current = current
      finish()
    }
  }, [pathname, searchParams, finish])

  // Patch history.pushState and replaceState to detect navigation start
  useEffect(() => {
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)

    // Defer start() to avoid calling setState inside useInsertionEffect
    // (React 19 / Next.js 15.5+ syncs router state via useInsertionEffect which calls pushState/replaceState)
    const deferredStart = () => setTimeout(start, 0)

    history.pushState = function (...args) {
      deferredStart()
      return originalPushState(...args)
    }

    history.replaceState = function (...args) {
      // Only trigger for actual navigations (different URL), not React state updates
      const newUrl = args[2]
      if (newUrl && newUrl !== window.location.href && newUrl !== window.location.pathname + window.location.search) {
        deferredStart()
      }
      return originalReplaceState(...args)
    }

    // Also detect back/forward navigation
    const handlePopState = () => deferredStart()
    window.addEventListener('popstate', handlePopState)

    // Intercept <a> clicks for Link components
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (
        !anchor ||
        !anchor.href ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      ) return

      // Only intercept same-origin navigation
      try {
        const url = new URL(anchor.href)
        if (url.origin !== window.location.origin) return
        if (url.pathname + url.search === window.location.pathname + window.location.search) return
        deferredStart()
      } catch {
        // Ignore invalid URLs
      }
    }
    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('click', handleClick, { capture: true })
      cleanup()
    }
  }, [start, cleanup])

  if (!visible && progress === 0) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: 3,
          background: color,
          width: `${progress}%`,
          transition: progress === 0
            ? 'none'
            : progress === 100
              ? 'width 200ms ease-out, opacity 300ms ease-out 200ms'
              : 'width 300ms ease',
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  )
}
