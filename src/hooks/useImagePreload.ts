import { useEffect, useRef } from 'react'

/**
 * Preloads images using `<link rel="preload">` for browser-native prioritisation.
 * Falls back to `new Image()` for browsers that don't support preload links for images.
 * Cleans up preload links when URLs change or the component unmounts.
 */
export function useImagePreload(urls: string[], count = 6) {
  const linksRef = useRef<HTMLLinkElement[]>([])

  useEffect(() => {
    if (urls.length === 0) return

    const toPreload = urls.slice(0, count)
    const links: HTMLLinkElement[] = []

    for (const url of toPreload) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = url
      document.head.appendChild(link)
      links.push(link)
    }

    linksRef.current = links

    return () => {
      for (const link of links) {
        link.remove()
      }
      linksRef.current = []
    }
  }, [urls, count])
}
