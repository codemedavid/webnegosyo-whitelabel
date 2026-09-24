/**
 * The merchant app's calls to the web app's order-deletion routes.
 *
 * Every call carries the owner's own access token — the routes re-check that
 * the account owns the store — and a refusal reaches the owner in the server's
 * words, never as a silent success.
 */
import { createOrderDeletionClient } from "./client";

const TENANT = "576ae2fe-1d26-4759-8c5e-03525b206f43";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup(response: Response, token: string | null = "owner-token") {
  const fetchImpl = jest.fn(async () => response);
  const client = createOrderDeletionClient({
    baseUrl: "https://www.webnegosyo.com",
    getToken: async () => token,
    fetchImpl,
  });
  return { client, fetchImpl };
}

describe("createOrderDeletionClient", () => {
  test("previews with the owner's token and the store id", async () => {
    const { client, fetchImpl } = setup(
      jsonResponse({ preview: { orderCount: 3, orderTotal: 300, activeCount: 0, earliest: null, latest: null } })
    );

    const result = await client.preview(TENANT, { scope: { kind: "all" }, includeActive: false });

    expect(result.preview.orderCount).toBe(3);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.webnegosyo.com/api/order-deletion/preview");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer owner-token");
    expect(JSON.parse(String(init.body))).toEqual({
      tenantId: TENANT,
      scope: { kind: "all" },
      includeActive: false,
      listOrders: false,
    });
  });

  test("reads the export's ticket and file details from the response headers", async () => {
    const { client } = setup(
      new Response("﻿Order #\r\n1", {
        status: 200,
        headers: {
          "X-Order-Deletion-Id": "deletion-1",
          "X-Export-File-Name": "sukad-orders-backup-2026-09-24.csv",
          "X-Order-Count": "1",
          "X-Order-Total": "100",
          "X-Export-Expires-At": "2026-09-24T03:00:00.000Z",
        },
      })
    );

    const exported = await client.exportOrders(TENANT, { scope: { kind: "all" }, includeActive: false });

    expect(exported).toEqual({
      deletionId: "deletion-1",
      csv: "﻿Order #\r\n1",
      fileName: "sukad-orders-backup-2026-09-24.csv",
      orderCount: 1,
      orderTotal: 100,
      expiresAt: "2026-09-24T03:00:00.000Z",
    });
  });

  test("refuses an export response that carries no ticket", async () => {
    const { client } = setup(new Response("csv", { status: 200 }));
    await expect(client.exportOrders(TENANT, { scope: { kind: "all" }, includeActive: false })).rejects.toThrow(
      /ticket/
    );
  });

  test("surfaces the server's refusal in its own words", async () => {
    const { client } = setup(jsonResponse({ error: "That password is not correct.", code: "wrong_password" }, 403));
    await expect(
      client.confirm(TENANT, { deletionId: "deletion-1", password: "x", confirmation: "Súkad" })
    ).rejects.toThrow("That password is not correct.");
  });

  test("asks the owner to sign in again when there is no session", async () => {
    const { client, fetchImpl } = setup(jsonResponse({}), null);
    await expect(client.history(TENANT)).rejects.toThrow(/sign in/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("returns the restore result", async () => {
    const { client } = setup(jsonResponse({ result: { restored: 4 } }));
    await expect(client.restore(TENANT, "deletion-1")).resolves.toEqual({ restored: 4 });
  });
});
