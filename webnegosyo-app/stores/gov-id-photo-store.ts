/**
 * The optional ID photos of the sale on the register, by claimant id.
 *
 * Kept beside the cart rather than inside the Senior/PWD session: a photo is
 * not an input to the money, and the session is compared and rebuilt in many
 * places that should not have to carry a file path. At tender the sale takes
 * the photos of its claimants (`photosFor`) and the store is cleared; the
 * upload queue owns the files from then on. Anything abandoned is deleted by
 * the queue's orphan sweep.
 */

import { create } from "zustand";
import type { CapturedIdPhoto, SaleIdPhoto } from "../lib/gov-id-photos/types";

interface GovIdPhotoState {
  photos: Readonly<Record<string, CapturedIdPhoto>>;
  setPhoto: (claimantId: string, photo: CapturedIdPhoto | null) => void;
  photosFor: (claimantIds: readonly string[]) => SaleIdPhoto[];
  clear: () => void;
}

export const useGovIdPhotoStore = create<GovIdPhotoState>((set, get) => ({
  photos: {},
  setPhoto: (claimantId, photo) =>
    set((state) => {
      const rest = Object.fromEntries(Object.entries(state.photos).filter(([id]) => id !== claimantId));
      return { photos: photo ? { ...rest, [claimantId]: photo } : rest };
    }),
  photosFor: (claimantIds) =>
    claimantIds.flatMap((claimantRef) => {
      const photo = get().photos[claimantRef];
      return photo ? [{ ...photo, claimantRef }] : [];
    }),
  clear: () => set({ photos: {} }),
}));
