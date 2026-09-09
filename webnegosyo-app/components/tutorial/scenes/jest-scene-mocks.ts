/**
 * Shared mocks for rendered-scene tests. Scenes reuse the real ScreenHeader,
 * whose view switcher reaches expo-router and the branch-audience hooks;
 * neither can load under Jest, and neither matters to what the tests pin.
 */
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock("../../../lib/use-portfolio-audience", () => ({
  usePortfolioAudience: () => ({ accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false }),
}));
jest.mock("../../../lib/use-advance-ordering", () => ({ useAdvanceOrdering: () => false }));

export {};
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
