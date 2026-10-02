/**
 * Signs and zips an Apple Wallet `.pkpass` for one member's card.
 *
 * `passkit-generator` does the manifest + PKCS#7 signature with the pass type
 * certificate; this module only decides WHAT goes in (`apple-pass-json.ts`)
 * and supplies the images.
 */

import 'server-only'
import { PKPass } from 'passkit-generator'
import type { AppleWalletConfig } from './config'
import type { WalletPassContent } from './content'
import { buildApplePassJson } from './apple-pass-json'
import { deriveAppleAuthToken } from './auth-token'
import { loadPassImages } from './pass-images'

export const PKPASS_CONTENT_TYPE = 'application/vnd.apple.pkpass'

export async function buildSignedPkpass(
  content: WalletPassContent,
  config: AppleWalletConfig,
  fallbackLogoUrl: string,
): Promise<Buffer> {
  const passJson = buildApplePassJson(content, {
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    webServiceURL: config.webServiceURL,
    authenticationToken: deriveAppleAuthToken(config.authSecret, content.serial),
  })
  const images = await loadPassImages(content, fallbackLogoUrl)

  const pass = new PKPass(
    { 'pass.json': Buffer.from(JSON.stringify(passJson)), ...images },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
  )
  return pass.getAsBuffer()
}
