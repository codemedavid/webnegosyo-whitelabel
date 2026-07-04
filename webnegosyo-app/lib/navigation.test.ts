import { productHref, NEW_PRODUCT_ID } from "./navigation";

/**
 * Regression guard for the "Unmatched Route" crash when opening a product from
 * Product Management. The bug: navigation used the object href form with the
 * `(main)` group baked into `pathname` plus a `[productId]` template, which
 * expo-router v6 + typedRoutes failed to resolve, dropping the user on the
 * built-in not-found screen. The proven-working pattern (used by order detail)
 * is a fully-substituted string href. These tests lock that contract in.
 */
describe("productHref", () => {
  it("builds a fully-substituted string path for an existing product", () => {
    // Arrange
    const productId = "abc-123";

    // Act
    const href = productHref(productId);

    // Assert
    expect(href).toBe("/(main)/product/abc-123");
  });

  it("never leaks the unsubstituted [productId] template", () => {
    // Act
    const href = productHref("xyz-789");

    // Assert — a leaked template is exactly what triggers Unmatched Route
    expect(href).not.toContain("[productId]");
  });

  it("routes to the editor in create mode via the sentinel id", () => {
    // Act
    const href = productHref(NEW_PRODUCT_ID);

    // Assert
    expect(href).toBe("/(main)/product/new");
  });

  it("encodes ids that contain URL-unsafe characters", () => {
    // Act
    const href = productHref("a b/c");

    // Assert
    expect(href).toBe("/(main)/product/a%20b%2Fc");
  });
});
