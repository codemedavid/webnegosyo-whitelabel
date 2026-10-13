/**
 * The static Owl, for the few "all good" states it may appear on (design spec
 * §6: all-clear, clean day, nothing waiting — never beside a flag, an error or
 * someone's numbers). One module so the asset `require` lives in one place,
 * the same way the assistant components load it.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const OWL_IMAGE = require("../../assets/assistant/owl.png");
