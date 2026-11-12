import * as Notifications from 'expo-notifications'
import { router, usePathname } from 'expo-router'
import { useEffect, useRef } from 'react'
import { queryClient, queryKeys } from '@/lib/data/hooks'
import { orderIdFromPushData, routeFromPushData } from './push-data'

/**
 * A push that arrives while the app is open: the order refreshes, and the
 * banner shows unless the customer is already looking at that order.
 */
let currentPath = '/'
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const route = routeFromPushData(notification.request.content.data)
    const isLookingAtIt = route !== null && currentPath === route
    return { shouldShowBanner: !isLookingAtIt, shouldShowList: true, shouldPlaySound: !isLookingAtIt, shouldSetBadge: false }
  },
})

/** Mounted once inside the navigator: opens the order a tapped push is about (cold start included). */
export function usePushRouting(): void {
  const pathname = usePathname()
  const handled = useRef<string | null>(null)
  const lastResponse = Notifications.useLastNotificationResponse()

  useEffect(() => {
    currentPath = pathname
  }, [pathname])

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const orderId = orderIdFromPushData(notification.request.content.data)
      if (!orderId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderList })
    })
    return () => received.remove()
  }, [])

  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
    const id = lastResponse.notification.request.identifier
    if (handled.current === id) return
    handled.current = id
    const route = routeFromPushData(lastResponse.notification.request.content.data)
    if (route) router.push(route)
    Notifications.clearLastNotificationResponse()
  }, [lastResponse])
}
