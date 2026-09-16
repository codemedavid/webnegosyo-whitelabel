/** Orders are placed and fulfilled in the product's Philippine market time. */
export const ORDER_TRACKING_TIME_ZONE = 'Asia/Manila'

export function formatOrderTrackingTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: ORDER_TRACKING_TIME_ZONE,
  })
}
