/**
 * Whether the SMS follow-up campaign surface exists on this platform.
 *
 * Android sends through the OS with SEND_SMS, declared by an Android-only
 * config plugin. iOS has no equivalent API — an app cannot send a text without
 * the user driving the system composer — and Apple treats a surface that
 * claims otherwise as grounds for rejection.
 *
 * So on iOS the feature is ABSENT, not disabled: no campaign list, no editor,
 * no entry point, and no Supabase round trip to load campaigns that could
 * never send. A disabled-with-an-explanation surface was the previous
 * behaviour and is the thing this replaces.
 *
 * Takes the platform as a string rather than reading `Platform.OS` itself, so
 * the rule is testable without a react-native runtime — this jest project runs
 * pure-logic roots only.
 */
export function isSmsCampaignsAvailable(platform: string): boolean {
  // Allowlist, not a denylist: a platform nobody has thought about yet has no
  // send path either, and defaulting to "available" would surface a send
  // button with nothing behind it.
  return platform === "android";
}
