/**
 * The modules of a QR code, as a plain grid the artwork draws itself.
 *
 * Same library as the merchant app's table codes (`qrcode-generator`), so a
 * code printed from the web and one shown on the phone encode alike. The
 * quiet zone is NOT included — the artwork owns the white space around it.
 */

import qrcode from 'qrcode-generator'

export type QrErrorCorrection = 'M' | 'H'

export interface QrMatrix {
  /** Edge length in modules. */
  size: number
  /** dark[row][col] */
  dark: boolean[][]
  errorCorrection: QrErrorCorrection
}

export interface QrMatrixOptions {
  /**
   * A logo covers the centre. Level H recovers up to 30% damaged codewords,
   * which is what keeps a code with a hole in it scannable.
   */
  hasLogo: boolean
}

/** Null when the text cannot fit any QR version. */
export function buildQrMatrix(text: string, options: QrMatrixOptions): QrMatrix | null {
  const errorCorrection: QrErrorCorrection = options.hasLogo ? 'H' : 'M'
  try {
    const qr = qrcode(0, errorCorrection) // type 0 = smallest version that fits
    qr.addData(text)
    qr.make()
    const size = qr.getModuleCount()
    const dark = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => qr.isDark(row, col))
    )
    return { size, dark, errorCorrection }
  } catch {
    return null
  }
}

/** Fraction of the code's width the logo hole spans. ~5–6% of its area. */
const LOGO_HOLE_FRACTION = 0.24

/**
 * The logo hole's edge in modules: odd, so it centres on the middle module,
 * and small enough that level H still reads the code with it missing.
 */
export function logoHoleSize(matrixSize: number): number {
  const raw = Math.floor(matrixSize * LOGO_HOLE_FRACTION)
  return raw % 2 === 1 ? raw : raw - 1
}
