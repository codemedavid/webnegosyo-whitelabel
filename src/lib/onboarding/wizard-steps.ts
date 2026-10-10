/**
 * The set-up wizard's screens, in order. Lives here (no imports) so the
 * funnel's event names can be checked server-side without pulling the form.
 */
export const WIZARD_STEPS = [
  'welcome',
  'goals', 'channels', 'daily', 'typical', 'plan',
  'store', 'brand', 'menu', 'ordering', 'payments', 'hours', 'bestsellers',
  'account',
] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]
