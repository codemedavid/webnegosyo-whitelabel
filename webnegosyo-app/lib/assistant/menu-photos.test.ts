/**
 * Menu photos picked on the phone: encoded as data URLs the server accepts,
 * kept inside its size caps, and a build without the picker says so instead
 * of crashing the Owl panel.
 */

const mockPicker = {
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
};
jest.mock("expo-image-picker", () => mockPicker);

import { fitPhotos, pickMenuPhotos, toPhotoDataUrl } from "./menu-photos";

beforeEach(() => {
  jest.clearAllMocks();
  mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
});

test("a picked asset becomes a data URL; HEIC and unknown types are labelled JPEG (the picker re-encodes them)", () => {
  expect(toPhotoDataUrl({ base64: "AAAA", mimeType: "image/png" })).toBe("data:image/png;base64,AAAA");
  expect(toPhotoDataUrl({ base64: "AAAA", mimeType: "image/heic" })).toBe("data:image/jpeg;base64,AAAA");
  expect(toPhotoDataUrl({ base64: null })).toBeNull();
});

test("photos are kept until the next one would break the size cap", () => {
  const big = "x".repeat(2_500_000);

  expect(fitPhotos([], ["a", "b"])).toEqual({ photos: ["a", "b"], isTooLarge: false });
  expect(fitPhotos([big], [big])).toEqual({ photos: [], isTooLarge: true });
  expect(fitPhotos([], ["x".repeat(3_000_001)])).toEqual({ photos: [], isTooLarge: true });
});

test("asks for library access, picks up to the remaining slots, as compressed base64", async () => {
  mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ base64: "AAAA", mimeType: "image/jpeg" }] });

  const outcome = await pickMenuPhotos([], 2);

  expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: true, selectionLimit: 2, allowsMultipleSelection: true }));
  expect(outcome).toEqual({ status: "picked", photos: ["data:image/jpeg;base64,AAAA"], isTrimmed: false });
});

test("a refused permission is reported, and the picker never opens", async () => {
  mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

  expect(await pickMenuPhotos([], 3)).toEqual({ status: "permission-denied" });
  expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});

test("a build without the native picker degrades to 'unavailable'", async () => {
  mockPicker.requestMediaLibraryPermissionsAsync.mockRejectedValue(new Error("Cannot find native module 'ExponentImagePicker'"));

  expect(await pickMenuPhotos([], 3)).toEqual({ status: "unavailable" });
});
