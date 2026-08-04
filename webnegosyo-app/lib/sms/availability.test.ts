/**
 * Whether the SMS follow-up surface exists at all on a given platform.
 *
 * This is a one-line predicate with a test file of its own because the answer
 * is not "should the send button be disabled" — it is "does this feature
 * exist". Apple does not allow an app to send SMS without the user driving the
 * system composer, so on iOS the campaign surface is a review liability and a
 * dead end. Getting this wrong in the permissive direction ships a rejected
 * binary.
 */
import { isSmsCampaignsAvailable } from "./availability";

describe("isSmsCampaignsAvailable", () => {
  it("is available on Android, which has the send path", () => {
    expect(isSmsCampaignsAvailable("android")).toBe(true);
  });

  it("is absent on iOS", () => {
    expect(isSmsCampaignsAvailable("ios")).toBe(false);
  });

  it("fails closed for any platform it does not know", () => {
    // Reached by Expo Go on web and by any future platform. Defaulting to
    // "available" would surface a send button with nothing behind it.
    expect(isSmsCampaignsAvailable("web")).toBe(false);
    expect(isSmsCampaignsAvailable("windows")).toBe(false);
    expect(isSmsCampaignsAvailable("")).toBe(false);
  });
});
