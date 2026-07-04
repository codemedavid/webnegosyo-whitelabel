'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import type { MotionValue } from 'framer-motion'
import { SmartMenuScene } from './smart-menu-scene'

interface HeroCanvasProps {
  progress: MotionValue<number>
}

export default function HeroCanvas({ progress }: HeroCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 34 }}
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <SmartMenuScene progress={progress} />
      </Suspense>
    </Canvas>
  )
}
