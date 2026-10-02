import type { ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

interface ProgressRingProps {
  size: number
  strokeWidth: number
  /** 0..1 */
  progress: number
  trackColor: string
  color: string
  children?: ReactNode
}

export function ProgressRing({ size, strokeWidth, progress, trackColor, color, children }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </Svg>
      {children}
    </View>
  )
}
