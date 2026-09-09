/**
 * A Convex client is closed when its URL is replaced.
 *
 * Every impersonation switch built a new `ConvexReactClient` for the viewed
 * store and dropped the previous one on the floor with its socket open. The
 * placeholder client (the tree-shape keeper, see the provider) is never the
 * one being replaced, so it is never closed.
 */
interface FakeClient {
  url: string;
  close: jest.Mock;
}
const mockInstances: FakeClient[] = [];

jest.mock("convex/react", () => ({
  __esModule: true,
  ConvexReactClient: jest.fn().mockImplementation((url: string) => {
    const instance: FakeClient = { url, close: jest.fn(async () => {}) };
    mockInstances.push(instance);
    return instance;
  }),
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import React from "react";
import { Text } from "react-native";
import { render, act } from "@testing-library/react-native";
import { ConvexAuthProvider } from "./convex-provider";
import { useAuthStore } from "../stores/auth-store";
import { DEMO_STORE } from "./demo";

const STORE_A = "https://store-a.convex.cloud";
const STORE_B = "https://store-b.convex.cloud";

const byUrl = (url: string) => mockInstances.filter((i) => i.url === url);

beforeEach(() => {
  mockInstances.length = 0;
  useAuthStore.setState({ convexUrl: null });
});

describe("ConvexAuthProvider client lifecycle", () => {
  it("closes the previous client once when the URL changes, never the placeholder", () => {
    useAuthStore.setState({ convexUrl: STORE_A });
    const { unmount } = render(
      <ConvexAuthProvider>
        <Text>child</Text>
      </ConvexAuthProvider>
    );
    expect(byUrl(STORE_A)).toHaveLength(1);

    act(() => useAuthStore.setState({ convexUrl: STORE_B }));
    expect(byUrl(STORE_A)[0].close).toHaveBeenCalledTimes(1);
    expect(byUrl(STORE_B)[0].close).not.toHaveBeenCalled();

    // Leaving the tenant: the store's client closes; the placeholder takes over.
    act(() => useAuthStore.setState({ convexUrl: null }));
    expect(byUrl(STORE_B)[0].close).toHaveBeenCalledTimes(1);
    expect(byUrl(STORE_A)[0].close).toHaveBeenCalledTimes(1);

    unmount();
    byUrl(DEMO_STORE.convexUrl).forEach((placeholder) => {
      expect(placeholder.close).not.toHaveBeenCalled();
    });
  });

  it("does not close a client on a re-render with the same URL", () => {
    useAuthStore.setState({ convexUrl: STORE_A });
    render(
      <ConvexAuthProvider>
        <Text>child</Text>
      </ConvexAuthProvider>
    );

    act(() => useAuthStore.setState({ tenantName: "renamed" }));

    expect(byUrl(STORE_A)).toHaveLength(1);
    expect(byUrl(STORE_A)[0].close).not.toHaveBeenCalled();
  });
});
