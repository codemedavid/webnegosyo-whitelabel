/**
 * Keeps the register's offline machinery running from any tab.
 *
 * Renders nothing. Mounted once in the (main) layout next to the other
 * app-wide watchers: it keeps the connectivity belief honest while the till is
 * idle, replays queued counter sales the moment the connection is back, and
 * saves the register's menu, prices and payment methods on the device so it
 * can sell offline even if nobody opened it while online.
 */

import { useConnectivityWatch } from "../lib/offline/use-connectivity";
import { useOutboxSync } from "../lib/offline/use-outbox-sync";
import { useOfflinePackAutoSync } from "../lib/offline/use-offline-pack";

export function OfflineSalesSync() {
  useConnectivityWatch();
  useOutboxSync();
  useOfflinePackAutoSync();
  return null;
}
