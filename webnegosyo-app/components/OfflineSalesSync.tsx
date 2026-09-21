/**
 * Keeps the register's offline machinery running from any tab.
 *
 * Renders nothing. Mounted once in the (main) layout next to the other
 * app-wide watchers: it keeps the connectivity belief honest while the till is
 * idle and replays queued counter sales the moment the connection is back.
 */

import { useConnectivityWatch } from "../lib/offline/use-connectivity";
import { useOutboxSync } from "../lib/offline/use-outbox-sync";

export function OfflineSalesSync() {
  useConnectivityWatch();
  useOutboxSync();
  return null;
}
