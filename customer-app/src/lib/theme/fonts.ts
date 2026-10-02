import type { AppFontKey } from '@/lib/contract'

/** Loaded family names per weight (as registered by the @expo-google-fonts packages). */
export interface FontFamilySet {
  regular: string
  medium: string
  semibold: string
  bold: string
  heavy: string
}

const set = (prefix: string, heavy = '800ExtraBold'): FontFamilySet => ({
  regular: `${prefix}_400Regular`,
  medium: `${prefix}_500Medium`,
  semibold: `${prefix}_600SemiBold`,
  bold: `${prefix}_700Bold`,
  heavy: `${prefix}_${heavy}`,
})

const JAKARTA = set('PlusJakartaSans')
const INTER = set('Inter')
const POPPINS = set('Poppins')
const NUNITO = set('Nunito')
const FRAUNCES = set('Fraunces')

/** Heading and body family per tenant font key. Fraunces pairs a serif display with Inter text. */
export const FONT_PAIRS: Record<AppFontKey, { heading: FontFamilySet; body: FontFamilySet }> = {
  jakarta: { heading: JAKARTA, body: JAKARTA },
  inter: { heading: INTER, body: INTER },
  poppins: { heading: POPPINS, body: POPPINS },
  nunito: { heading: NUNITO, body: NUNITO },
  fraunces: { heading: FRAUNCES, body: INTER },
}
