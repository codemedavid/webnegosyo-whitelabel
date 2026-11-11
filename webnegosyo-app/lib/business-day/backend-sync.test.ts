const mockPost = jest.fn();
jest.mock("../authorized-post", () => ({ postAuthorized: (...args: unknown[]) => mockPost(...args) }));

import { BUSINESS_DAY_SYNC_PATH, pushCutoffToOrderBackend } from "./backend-sync";

beforeEach(() => mockPost.mockReset());

describe("pushCutoffToOrderBackend", () => {
  it.each(["convex", "supabase"])("asks the web to push the stored schedule to a %s store's backend", async (backend) => {
    mockPost.mockResolvedValue(true);
    await expect(pushCutoffToOrderBackend("t1", backend)).resolves.toBe(true);
    expect(mockPost).toHaveBeenCalledWith(BUSINESS_DAY_SYNC_PATH, { tenantId: "t1" });
  });

  it("sends nothing for a platform store (the database numbers its orders)", async () => {
    await expect(pushCutoffToOrderBackend("t1", "platform")).resolves.toBe(true);
    await expect(pushCutoffToOrderBackend("t1", null)).resolves.toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("reports a failed push without throwing", async () => {
    mockPost.mockRejectedValue(new Error("network"));
    await expect(pushCutoffToOrderBackend("t1", "convex")).resolves.toBe(false);
  });
});
