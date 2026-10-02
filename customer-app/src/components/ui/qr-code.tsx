import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import Svg, { Path, Rect } from 'react-native-svg'

interface QrCodeProps {
  value: string
  size: number
  color?: string
  background?: string
}

/** One SVG path for the whole matrix — cheaper to draw than a rect per module. */
export function QrCode({ value, size, color = '#000000', background = '#FFFFFF' }: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const modules = qr.getModuleCount()
    const segments: string[] = []
    for (let row = 0; row < modules; row += 1)
      for (let col = 0; col < modules; col += 1) if (qr.isDark(row, col)) segments.push(`M${col} ${row}h1v1h-1z`)
    return { path: segments.join(''), count: modules }
  }, [value])
  const quiet = 2
  const box = count + quiet * 2
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`} accessibilityLabel="Member QR code">
      <Rect x={-quiet} y={-quiet} width={box} height={box} fill={background} />
      <Path d={path} fill={color} />
    </Svg>
  )
}
