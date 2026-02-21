/**
 * Notification utilities for admin real-time order alerts
 */

let audioContext: AudioContext | null = null

/**
 * Play a notification sound using Web Audio API.
 * Uses a pleasant two-tone chime that works cross-browser without external files.
 */
export function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    // Resume if suspended (required by browser autoplay policies)
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    const now = audioContext.currentTime

    // First tone (higher)
    const osc1 = audioContext.createOscillator()
    const gain1 = audioContext.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now) // A5
    gain1.gain.setValueAtTime(0.3, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc1.connect(gain1)
    gain1.connect(audioContext.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Second tone (lower, slightly delayed)
    const osc2 = audioContext.createOscillator()
    const gain2 = audioContext.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1174.66, now + 0.15) // D6
    gain2.gain.setValueAtTime(0.3, now + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
    osc2.connect(gain2)
    gain2.connect(audioContext.destination)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.5)
  } catch {
    // Silently fail if audio is not available
  }
}

/**
 * Request notification permission and return the status.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

/**
 * Show a browser notification for a new order.
 */
export function showOrderNotification(order: {
  id: string
  customer_name?: string
  total: number
  order_type?: string
}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const itemsText = order.order_type ? ` - ${order.order_type}` : ''
  const notification = new Notification(`New Order #${order.id.slice(0, 8).toUpperCase()}`, {
    body: `${order.customer_name || 'Customer'}${itemsText}\nTotal: PHP ${order.total.toFixed(2)}`,
    icon: '/favicon.ico',
    tag: `order-${order.id}`,
    requireInteraction: true,
  })

  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
