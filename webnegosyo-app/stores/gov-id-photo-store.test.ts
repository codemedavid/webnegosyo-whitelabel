import { useGovIdPhotoStore } from "./gov-id-photo-store";
import { draftFromClaimant, newClaimantDraft } from "../lib/pos-gov-draft";

const photo = (name: string) => ({ fileUri: `file:///doc/gov-id-photos/${name}-1760414000000.jpg`, capturedAt: "2026-10-14T03:59:00.000Z" });

describe("the register's ID photos", () => {
  beforeEach(() => useGovIdPhotoStore.getState().clear());

  it("hands a sale only the photos of its own claimants", () => {
    const store = useGovIdPhotoStore.getState();
    store.setPhoto("c1", photo("c1"));
    store.setPhoto("c2", photo("c2"));
    expect(useGovIdPhotoStore.getState().photosFor(["c2", "c3"])).toEqual([{ ...photo("c2"), claimantRef: "c2" }]);
  });

  it("forgets a removed claimant's photo, and everything once the sale is done", () => {
    const store = useGovIdPhotoStore.getState();
    store.setPhoto("c1", photo("c1"));
    store.setPhoto("c2", photo("c2"));
    store.setPhoto("c1", null);
    expect(Object.keys(useGovIdPhotoStore.getState().photos)).toEqual(["c2"]);
    useGovIdPhotoStore.getState().clear();
    expect(useGovIdPhotoStore.getState().photos).toEqual({});
  });

  it("a new claimant starts with no photo; editing one carries theirs", () => {
    expect(newClaimantDraft("c1", "senior").idPhoto).toBeNull();
    const claimant = { id: "c1", kind: "senior" as const, name: "Juan", idNumber: "123", allocation: { mode: "shared" as const } };
    expect(draftFromClaimant(claimant).idPhoto).toBeNull();
    expect(draftFromClaimant(claimant, photo("c1")).idPhoto).toEqual(photo("c1"));
  });
});
