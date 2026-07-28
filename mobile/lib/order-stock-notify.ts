import Constants from 'expo-constants'

function getWebAppUrl(): string {
  return (
    (Constants.expoConfig?.extra?.webAppUrl as string | undefined) ||
    process.env.EXPO_PUBLIC_WEB_APP_URL ||
    'https://webnegosyo.com'
  )
}

/**
 * Fire-and-forget: ask the platform to spend a customer order's ingredients.
 *
 * This app writes its orders straight to the platform `orders` table, so it
 * never passes through the web app's `createOrderAction` where depletion is
 * wired. Without this call, an order placed in a merchant's own branded app
 * moves no stock at all — while the same order placed on their website depletes
 * ingredients, raises low-stock alerts and can take a sold-out dish off the
 * menu.
 *
 * Sends no lines. The platform reads the order's own saved items back, which is
 * what lets that route be reached without a customer account: there is nothing
 * in this payload to steer.
 *
 * Never throws. By the time this runs the order is saved and the customer is on
 * their way to the confirmation screen — a stock write must not be able to make
 * a placed order look failed. A short ledger is reconciled by a stocktake; a
 * customer who thinks their order did not go through is not.
 */
export async function notifyCustomerOrderStock(
  tenantId: string,
  orderId: string,
): Promise<void> {
  try {
    await fetch(`${getWebAppUrl()}/api/inventory/customer-order-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, orderId }),
    })
  } catch {
    // Best-effort — the order already succeeded.
  }
}
