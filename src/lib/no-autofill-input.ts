/**
 * Spread onto a password-type input that holds an API credential, not a login
 * password. Chrome ignores `autoComplete="off"` on password fields and fills a
 * saved login password into the first one it finds — which is how "admin123"
 * became eight stores' Lalamove API key. `new-password` stops the browser's
 * fill; the data attributes stop 1Password, LastPass, Bitwarden and Dashlane.
 */
export const NO_AUTOFILL_INPUT_PROPS = {
  autoComplete: 'new-password',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const
