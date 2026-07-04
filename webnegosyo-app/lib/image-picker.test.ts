import { isNativeModuleMissingError, toPickedImage } from "./image-picker";

/**
 * Guards the graceful-degradation contract for the product-image picker.
 *
 * Regression: `expo-image-picker` resolves its native module
 * (`ExponentImagePicker`) at import time. A static top-level import therefore
 * throws during module evaluation when the native module isn't in the running
 * binary, taking the entire product editor screen down (crash / "Unmatched
 * Route"). The screen now lazy-loads the picker and, when the native module is
 * missing, degrades to a friendly message instead of crashing. These tests
 * lock in the two pure pieces that drive that behavior.
 */
describe("isNativeModuleMissingError", () => {
  it("detects the ExponentImagePicker missing-native-module error", () => {
    // Arrange
    const error = new Error("Cannot find native module 'ExponentImagePicker'");

    // Act / Assert
    expect(isNativeModuleMissingError(error)).toBe(true);
  });

  it("matches on the module name even with a different wording", () => {
    expect(
      isNativeModuleMissingError(new Error("ExponentImagePicker is null"))
    ).toBe(true);
  });

  it("does not misclassify an unrelated error as a missing native module", () => {
    expect(isNativeModuleMissingError(new Error("Network request failed"))).toBe(
      false
    );
  });

  it("safely returns false for non-Error values", () => {
    expect(isNativeModuleMissingError(undefined)).toBe(false);
    expect(isNativeModuleMissingError("some string")).toBe(false);
    expect(isNativeModuleMissingError(null)).toBe(false);
  });
});

describe("toPickedImage", () => {
  it("maps a full asset to a PickedImage", () => {
    // Arrange
    const asset = {
      uri: "file:///photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/png",
    };

    // Act
    const picked = toPickedImage(asset);

    // Assert
    expect(picked).toEqual({
      uri: "file:///photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/png",
    });
  });

  it("falls back to sensible defaults when fileName/mimeType are absent", () => {
    // Act
    const picked = toPickedImage({ uri: "file:///a.tmp" });

    // Assert
    expect(picked).toEqual({
      uri: "file:///a.tmp",
      fileName: "product.jpg",
      mimeType: "image/jpeg",
    });
  });
});
