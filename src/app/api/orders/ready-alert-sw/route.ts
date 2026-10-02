/**
 * Service worker for the tracking page's "your order is ready" notification.
 *
 * Android Chrome only shows notifications through a worker registration. It
 * is served from `/api/` because tenant hosts rewrite every other path into
 * the storefront, and its scope (`/api/orders/`) controls no page — it only
 * shows notifications and brings the tracking page back when one is tapped.
 */

const WORKER_SOURCE = `
self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()) })

function sameOriginUrl(value) {
  if (typeof value !== 'string') return null
  try {
    var url = new URL(value, self.location.origin)
    return url.origin === self.location.origin ? url.href : null
  } catch (error) {
    return null
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var data = event.notification.data || {}
  var target = sameOriginUrl(data.url)
  if (!target) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        if (windows[i].url === target && 'focus' in windows[i]) return windows[i].focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
`

export function GET(): Response {
  return new Response(WORKER_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
