/** The message staff paste with a fresh sign-up link. Pure. */
export function buildSignupLinkMessage(url: string): string {
  return [
    'Hi! Salamat sa pag-avail ng SmartMenu. 🎉',
    'Here is your sign-up link — open it, type in your details, and we will build your store with you:',
    url,
    "5 minutes lang: upload your logo and a photo of your menu, and we'll set up your menu, colors, combos and a loyalty card. You can go live right after.",
    'This link works once and is just for you — please do not share it.',
  ].join('\n\n')
}
