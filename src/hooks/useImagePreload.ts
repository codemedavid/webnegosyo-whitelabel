import { useEffect } from 'react'

export function useImagePreload(urls: string[], count = 6) {
  useEffect(() => {
    if (urls.length === 0) return

    const toPreload = urls.slice(0, count)
    toPreload.forEach((url) => {
      const img = document.createElement('img')
      img.src = url
    })
  }, [urls, count])
}
