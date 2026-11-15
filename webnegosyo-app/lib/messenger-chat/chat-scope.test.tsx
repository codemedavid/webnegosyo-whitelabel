/**
 * A chat put on the register by "Make order" is dropped when the store in
 * scope changes (sign-out, a superadmin moving stores), and only then.
 */
import { act, renderHook } from "@testing-library/react-native";
import { hasTenantScopeChanged, useRegisterChatScope } from "./chat-scope";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";

const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";

beforeEach(() => {
  usePosCartStore.getState().reset();
  useAuthStore.setState({ tenantId: "t1", impersonatedTenantId: null });
});

describe("hasTenantScopeChanged", () => {
  it("is a move only after a tenant was seen", () => {
    expect(hasTenantScopeChanged(undefined, "t1")).toBe(false);
    expect(hasTenantScopeChanged("t1", "t1")).toBe(false);
    expect(hasTenantScopeChanged("t1", null)).toBe(true);
    expect(hasTenantScopeChanged("t1", "t2")).toBe(true);
  });
});

describe("useRegisterChatScope", () => {
  it("keeps the chat while the store stays the same", () => {
    usePosCartStore.getState().setChat({ sessionId: SESSION, name: "Ana C." });
    const { rerender } = renderHook(() => useRegisterChatScope());
    rerender({});
    expect(usePosCartStore.getState().chat?.sessionId).toBe(SESSION);
  });

  it("drops it on sign-out, and on a move to another store", () => {
    renderHook(() => useRegisterChatScope());
    usePosCartStore.getState().setChat({ sessionId: SESSION, name: "Ana C." });
    act(() => useAuthStore.setState({ impersonatedTenantId: "t2" }));
    expect(usePosCartStore.getState().chat).toBeNull();

    usePosCartStore.getState().setChat({ sessionId: SESSION, name: "Ana C." });
    act(() => useAuthStore.setState({ tenantId: null, impersonatedTenantId: null }));
    expect(usePosCartStore.getState().chat).toBeNull();
  });
});
