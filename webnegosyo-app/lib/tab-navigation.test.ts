// Reproducer for the merchant app's "Cannot read property 'stale' of undefined"
// crash, which force-closes the whole (main) tab tree into its ErrorBoundary.
//
// The mechanism, verified end to end against the installed libraries:
//
//   1. `router.replace(href)` dispatches a REPLACE action (expo-router
//      global-state/routing.js -> linkTo(..., { event: 'REPLACE' })).
//   2. When that action lands INSIDE the tab navigator, expo-router's
//      `tabRouterOverride` rewrites the navigator's own state key to
//      `${key}-replace` (layouts/TabRouter.js).
//   3. A changed state key remounts the navigator, so on the next render
//      `currentState` is undefined while the nested params are already marked
//      consumed. That combination skips the initialization guard in
//      @react-navigation/core useNavigationBuilder and falls through to
//      `router.getRehydratedState(undefined, ...)`.
//   4. TabRouter.getRehydratedState reads `state.stale` on undefined and throws.
//
// So the rule this file locks down is: never `router.replace()` to a route that
// lives inside the same tab navigator. `router.navigate()` expresses the same
// intent (go there, don't stack a screen) without renaming the navigator.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { goTo, isTabNavigatorHref, navigationVerbFor } from "./tab-navigation";

/**
 * The slice of a navigation state this file asserts on. The library's own
 * generics model a partial (not-yet-rehydrated) state too, which would force
 * unrelated narrowing noise into every assertion below.
 */
interface NavState {
  key: string;
  index: number;
  routes: { name: string }[];
  history?: unknown[];
}

/** Only the router surface these tests drive. */
interface RouterLike {
  getInitialState: (options: RouterOptions) => NavState;
  getStateForAction: (
    state: NavState,
    action: { type: string; payload?: { name: string } },
    options: RouterOptions,
  ) => NavState | null;
}

interface RouterOptions {
  routeNames: string[];
  routeParamList: Record<string, undefined>;
  routeGetIdList: Record<string, undefined>;
}

// Untyped deep import: expo-router ships no type declarations for this path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tabRouterOverride } = require("expo-router/build/layouts/TabRouter.js") as {
  tabRouterOverride: (original: RouterLike) => RouterLike;
};

// The (main) tab navigator's route names, in the order app/(main)/_layout.tsx
// declares them. Order matters: the crash only triggers when the target route
// is not already at index 0.
const TAB_ROUTE_NAMES = [
  "dashboard",
  "orders",
  "pos",
  "pos-sales",
  "analytics",
  "growth",
  "trends",
  "product-analytics",
  "product-management",
  "inventory",
  "product/[productId]",
  "scan",
  "order/[orderId]",
  "pos-tender",
  "printer-settings",
  "account",
];

/**
 * Stand-in for @react-navigation/routers' TabRouter, which ships ESM-only and
 * so cannot be loaded under this package's node-environment Jest config.
 *
 * Only the base router's *contract* is faked here: "resolve the target route
 * and focus it". The behaviour actually under test — rewriting the navigator's
 * state key on REPLACE — lives in expo-router's own `tabRouterOverride`, which
 * is the real, unmodified module loaded below.
 */
function fakeBaseRouter(): RouterLike {
  const routes = TAB_ROUTE_NAMES.map((name) => ({ name }));
  return {
    getInitialState: () => ({ key: "tab-TEST-KEY", index: 0, routes }),
    getStateForAction: (state, action) => {
      const index = TAB_ROUTE_NAMES.indexOf(action.payload?.name ?? "");
      if (index === -1) return null;
      // The override reads `index` and `history` off the base router's result.
      return {
        ...state,
        index,
        history: [{ type: "route", key: `${action.payload?.name}-key` }],
      } as NavState;
    },
  };
}

function buildNavigator() {
  const options: RouterOptions = {
    routeNames: TAB_ROUTE_NAMES,
    routeParamList: {},
    routeGetIdList: {},
  };
  const base = fakeBaseRouter();
  return { base, wrapped: tabRouterOverride(base), options };
}

/** State focused on `routeName`, as if the merchant had tapped that tab. */
function stateFocusedOn(routeName: string): NavState {
  const { base, options } = buildNavigator();
  const initial = base.getInitialState(options);
  return (
    base.getStateForAction(
      initial,
      { type: "JUMP_TO", payload: { name: routeName } },
      options,
    ) ?? initial
  );
}

describe("expo-router tab navigator: why replace() crashes", () => {
  // Arrange/Act/Assert against the real library, so this stays honest if a
  // future expo-router release changes the behaviour we are working around.
  it("renames the navigator's state key on a REPLACE into the same navigator", () => {
    // Arrange — the cashier is on the register, mid-sale.
    const { wrapped, options } = buildNavigator();
    const state = stateFocusedOn("pos");

    // Act — pos-tender.tsx used to finish the sale with router.replace().
    const next = wrapped.getStateForAction(
      state,
      { type: "REPLACE", payload: { name: "pos-sales" } },
      options,
    );

    // Assert — the navigator no longer owns the state it is handed. This is
    // step 2 of the crash: the remount that follows leaves currentState
    // undefined and getRehydratedState(undefined) throws on `.stale`.
    expect(next?.key).not.toBe(state.key);
    expect(next?.key).toBe(`${state.key}-replace`);
  });

  it("keeps the navigator's state key on a NAVIGATE into the same navigator", () => {
    // Arrange
    const { wrapped, options } = buildNavigator();
    const state = stateFocusedOn("pos");

    // Act
    const next = wrapped.getStateForAction(
      state,
      { type: "NAVIGATE", payload: { name: "pos-sales" } },
      options,
    );

    // Assert — same destination, navigator identity intact, no remount.
    expect(next?.key).toBe(state.key);
    expect(next?.routes[next.index].name).toBe("pos-sales");
  });
});

describe("navigationVerbFor", () => {
  it("routes an in-navigator href through navigate", () => {
    expect(navigationVerbFor("/(main)/pos-sales")).toBe("navigate");
  });

  it("routes a cross-group href through replace", () => {
    // Leaving the merchant tree entirely targets the root stack, where replace
    // is both correct and safe — it must keep dropping the screen behind it.
    expect(navigationVerbFor("/(auth)/login")).toBe("replace");
    expect(navigationVerbFor("/(superadmin)/tenants")).toBe("replace");
  });

  it("treats a dynamic in-navigator route as in-navigator", () => {
    expect(navigationVerbFor("/(main)/product/abc-123")).toBe("navigate");
  });
});

describe("isTabNavigatorHref", () => {
  it("recognises the merchant tab group", () => {
    expect(isTabNavigatorHref("/(main)/orders")).toBe(true);
  });

  it("rejects other groups and lookalike prefixes", () => {
    expect(isTabNavigatorHref("/(auth)/login")).toBe(false);
    expect(isTabNavigatorHref("/(superadmin)/tenants")).toBe(false);
    // Guard against a naive `includes("(main)")` implementation.
    expect(isTabNavigatorHref("/(mainframe)/x")).toBe(false);
  });
});

describe("goTo", () => {
  it("navigates rather than replaces within the tab navigator", () => {
    // Arrange
    const navigate = jest.fn();
    const replace = jest.fn();

    // Act
    goTo({ navigate, replace }, "/(main)/pos-sales");

    // Assert
    expect(navigate).toHaveBeenCalledWith("/(main)/pos-sales");
    expect(replace).not.toHaveBeenCalled();
  });

  it("still replaces when leaving the tab navigator", () => {
    // Arrange
    const navigate = jest.fn();
    const replace = jest.fn();

    // Act
    goTo({ navigate, replace }, "/(auth)/login");

    // Assert
    expect(replace).toHaveBeenCalledWith("/(auth)/login");
    expect(navigate).not.toHaveBeenCalled();
  });
});

// Regression lock. The unit tests above prove the rule; this proves the app
// actually obeys it. Jest only runs pure-logic roots (lib/, theme/), so this
// asserts on the screen sources — the same approach as the other mount
// guardrails in this directory.
describe("no screen replaces into the merchant tab navigator", () => {
  const APP_DIR = join(__dirname, "..", "app");
  const COMPONENTS_DIR = join(__dirname, "..", "components");

  /** Every .tsx under a directory, recursively. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".tsx") ? [path] : [];
    });
  }

  const files = [
    ...sourceFiles(join(APP_DIR, "(main)")),
    // Rendered inside (main) screens, so its navigations land in the tab
    // navigator just the same.
    join(COMPONENTS_DIR, "WorkspaceSwitcher.tsx"),
  ];

  it.each(files.map((f) => [f.slice(f.indexOf("webnegosyo-app")), f]))(
    "%s does not call router.replace into /(main)",
    (_label, path) => {
      const source = readFileSync(path, "utf8");
      // Matches router.replace("/(main)/...") and the productHref() helper,
      // which builds a /(main)/product/... href.
      const offenders = source.match(
        /router\.replace\(\s*(`\/\(main\)|"\/\(main\)|'\/\(main\)|productHref\()/g,
      );
      expect(offenders).toBeNull();
    },
  );
});
