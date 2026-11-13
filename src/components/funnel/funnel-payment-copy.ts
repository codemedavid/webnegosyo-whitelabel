/** Every word of the funnel's payment step (inline + /checkout/confirmation). */
export const PAYMENT = {
  secure: 'Secure checkout',
  kicker: 'Order saved',
  titleLead: 'Isang step na lang: bayaran ang',
  subtitle:
    'Naka-save na ang order mo. I-send ang payment, i-upload ang screenshot, at ise-send namin ang setup link mo.',
  progress: ['Details', 'Payment', 'Setup'],
  reference: 'Reference number',
  referenceHint: 'Ilagay ito sa message o notes ng transfer mo.',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Hindi ma-copy. Isulat na lang muna.',
  dueToday: 'Due today',
  balance: 'Balance mamaya',
  plan: 'Plan',
  sendTo: 'I-send sa',
  accountName: 'Account name',
  accountNumber: 'Account number',
  qrAlt: (method: string) => `${method} QR code`,
  qrHint: 'Scan gamit ang GCash o kahit anong bank app na may InstaPay QR.',
  qrPhoneHint: 'Nasa phone ka? I-save ang QR, tapos sa GCash: Pay QR → Upload QR.',
  saveQr: 'I-save ang QR',
  saveQrFailed: 'Hindi ma-save ang QR. Pindutin nang matagal ang QR para i-save.',
  howTitle: 'Paano magbayad',
  howSteps: (hasQr: boolean) => [
    hasQr ? 'I-scan ang QR o i-send sa number sa itaas.' : 'I-send sa account sa itaas.',
    'I-type ang exact amount at i-screenshot ang receipt.',
    'I-upload ang screenshot dito sa baba.',
  ],
  proofTitle: 'I-upload ang screenshot ng payment',
  proofBody: 'Para ma-confirm namin agad ang bayad mo.',
  proofInputLabel: 'Upload payment screenshot',
  proofPick: 'Pumili ng screenshot',
  proofTypes: 'PNG, JPG o WEBP, hanggang 5MB',
  proofUploading: (percent: number) => `Ina-upload… ${percent}%`,
  proofReplacing: 'Pumili ng bagong screenshot. Papalitan nito ang na-upload mo kanina.',
  proofKeep: 'Huwag nang palitan',
  proofWrongType: 'PNG, JPG o WEBP lang ang pwede.',
  proofTooLarge: 'Masyadong malaki ang file. Hanggang 5MB lang.',
  proofUnavailable: 'Hindi available ang upload ngayon. I-message kami sa Messenger.',
  proofSaveFailed: 'Hindi na-save ang screenshot. Try again.',
  proofUploadFailed: 'Hindi na-upload. Check your internet then try again.',
  noMethod: 'I-message kami sa Messenger para sa payment details.',
  nextTitle: 'Ano ang susunod',
  nextSteps: [
    'I-confirm namin ang bayad mo.',
    'Ise-send namin ang private setup link mo by SMS o email.',
    'Sagutin ang ilang tanong (mga 5 minutes) at i-upload ang menu photo mo. Live ka within 48 hours, madalas same day.',
  ],
  haveReady: 'Ihanda na: picture ng menu mo, logo (kung meron), at GCash o Maya number mo.',
  help: 'May tanong?',
  helpCta: 'Chat with us on Messenger',
} as const

/**
 * The thank-you screen shown once the buyer's screenshot is saved (right after
 * the upload, and on every later visit to the same confirmation link). The page
 * is public to anyone holding the reference, so it never prints the buyer's
 * phone or email, only that we will use the ones they gave.
 */
export const THANKS = {
  kicker: 'Screenshot received',
  titleLead: 'Salamat!',
  title: 'Natanggap na namin ang screenshot mo.',
  subtitle:
    'Ire-review namin ang lahat: ang payment at ang details mo. Pag okay na, ite-text at ie-email ka namin ng private setup link mo.',
  nextTitle: 'Ano ang susunod',
  nextSteps: [
    { title: 'Ire-review namin ang payment at details mo.', note: 'Ginagawa na namin' },
    { title: 'Ite-text at ie-email namin ang private setup link mo.', note: null },
    {
      title: 'Sagutin ang ilang tanong (mga 5 minutes) at i-upload ang menu photo mo.',
      note: 'Live ka within 48 hours, madalas same day.',
    },
  ],
  contactTitle: 'Saan mo matatanggap ang setup link',
  contactSms: 'Text',
  contactSmsBody: 'Sa phone number na binigay mo.',
  contactEmail: 'Email',
  contactEmailBody: 'Sa email na binigay mo. I-check din ang Spam o Promotions.',
  reference: 'Reference number',
  referenceHint: 'Gamitin ito kung magme-message ka sa amin.',
  shotTitle: 'Ang na-upload mo',
  shotAlt: 'Ang payment screenshot na na-upload mo',
  replace: 'Mali ang na-upload? Palitan',
  closeNote: 'Pwede mo nang isara ang page na ito. Kami na ang bahala.',
} as const
