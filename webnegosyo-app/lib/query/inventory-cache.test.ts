/**
 * The inventory screen's three reads share one invalidation: a movement, a
 * transfer step or a count can each re-level the shelf, and a write that
 * refreshed only the read it touched left the others showing stock the store
 * no longer had.
 */
import { QueryClient } from "@tanstack/query-core";
import {
  inventoryCountKey,
  inventoryShelfKey,
  inventoryTransfersKey,
  invalidateInventory,
} from "./inventory-cache";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
});
afterEach(() => client.clear());

describe("inventory keys", () => {
  it("tell the store pool from an unscoped shelf", () => {
    expect(inventoryShelfKey("t1", undefined)).not.toEqual(inventoryShelfKey("t1", "o1"));
    expect(inventoryCountKey("t1", null)).not.toEqual(inventoryCountKey("t1", "o1"));
  });
});

describe("invalidateInventory", () => {
  it("invalidates the shelf, the count and the transfers of one tenant only", async () => {
    client.setQueryData(inventoryShelfKey("t1", "o1"), []);
    client.setQueryData(inventoryCountKey("t1", null), null);
    client.setQueryData(inventoryTransfersKey("t1"), { transfers: [], lines: {} });
    client.setQueryData(inventoryShelfKey("t2", undefined), []);

    await invalidateInventory(client, "t1");

    expect(client.getQueryState(inventoryShelfKey("t1", "o1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(inventoryCountKey("t1", null))?.isInvalidated).toBe(true);
    expect(client.getQueryState(inventoryTransfersKey("t1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(inventoryShelfKey("t2", undefined))?.isInvalidated).toBe(false);
  });
});
