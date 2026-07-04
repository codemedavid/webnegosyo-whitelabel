'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Sparkles } from '@react-three/drei'
import type { MotionValue } from 'framer-motion'
import { createEmojiChipTexture, createMenuScreenTexture } from './menu-screen-texture'

interface PhoneKeyframe {
  at: number
  x: number
  y: number
  z: number
  rotY: number
  scale: number
}

const PHONE_KEYFRAMES: readonly PhoneKeyframe[] = [
  { at: 0.0, x: 0, y: -0.55, z: 0, rotY: -0.22, scale: 1.05 },
  { at: 0.3, x: 1.75, y: 0.05, z: 0, rotY: -0.55, scale: 1 },
  { at: 0.54, x: -1.75, y: 0.05, z: 0, rotY: 0.55, scale: 1 },
  { at: 0.78, x: 1.75, y: 0.05, z: 0, rotY: -0.45, scale: 1 },
  { at: 1.0, x: 0, y: 0.4, z: -3.2, rotY: 0, scale: 0.85 },
] as const

const DAMP_SPEED = 4

const FLOATING_CHIPS = [
  { emoji: '🍔', position: [-1.85, 1.5, 0.5], size: 0.52, speed: 1.3 },
  { emoji: '🍟', position: [1.9, 0.7, 0.7], size: 0.44, speed: 1.7 },
  { emoji: '🧋', position: [-1.6, -1.6, 0.6], size: 0.4, speed: 1.1 },
  { emoji: '🍰', position: [1.55, -1.3, 0.4], size: 0.34, speed: 1.5 },
] as const

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function samplePhoneKeyframes(p: number): PhoneKeyframe {
  const clamped = THREE.MathUtils.clamp(p, 0, 1)
  let prev = PHONE_KEYFRAMES[0]
  let next = PHONE_KEYFRAMES[PHONE_KEYFRAMES.length - 1]

  for (let i = 0; i < PHONE_KEYFRAMES.length - 1; i++) {
    if (clamped >= PHONE_KEYFRAMES[i].at && clamped <= PHONE_KEYFRAMES[i + 1].at) {
      prev = PHONE_KEYFRAMES[i]
      next = PHONE_KEYFRAMES[i + 1]
      break
    }
  }

  const span = next.at - prev.at || 1
  const t = smoothstep((clamped - prev.at) / span)

  return {
    at: clamped,
    x: THREE.MathUtils.lerp(prev.x, next.x, t),
    y: THREE.MathUtils.lerp(prev.y, next.y, t),
    z: THREE.MathUtils.lerp(prev.z, next.z, t),
    rotY: THREE.MathUtils.lerp(prev.rotY, next.rotY, t),
    scale: THREE.MathUtils.lerp(prev.scale, next.scale, t),
  }
}

function FloatingChip({
  emoji,
  position,
  size,
  speed,
}: {
  emoji: string
  position: readonly [number, number, number]
  size: number
  speed: number
}) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const texture = useMemo(() => createEmojiChipTexture(emoji), [emoji])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  useFrame((state) => {
    const sprite = spriteRef.current
    if (!sprite) return
    const t = state.clock.elapsedTime * speed
    sprite.position.y = position[1] + Math.sin(t) * 0.12
    sprite.position.x = position[0] + Math.cos(t * 0.6) * 0.05
  })

  return (
    <sprite ref={spriteRef} position={[position[0], position[1], position[2]]} scale={size}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}

function SmartMenuPhone({ progress }: { progress: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null)
  const screenTexture = useMemo(() => createMenuScreenTexture(), [])

  useEffect(() => {
    return () => screenTexture.dispose()
  }, [screenTexture])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const frame = samplePhoneKeyframes(progress.get())
    const t = state.clock.elapsedTime
    const floatY = Math.sin(t * 1.1) * 0.07
    const floatRotZ = Math.sin(t * 0.7) * 0.03

    // On narrow screens the phone sits behind the copy — push it back so the
    // headline stays legible instead of fighting the bright menu screen.
    const isNarrow = state.size.width < 768
    const targetY = frame.y + floatY + (isNarrow ? -0.5 : 0)
    const targetZ = frame.z + (isNarrow ? -2.2 : 0)
    const targetScale = frame.scale * (isNarrow ? 0.9 : 1)

    group.position.x = THREE.MathUtils.damp(group.position.x, frame.x, DAMP_SPEED, delta)
    group.position.y = THREE.MathUtils.damp(group.position.y, targetY, DAMP_SPEED, delta)
    group.position.z = THREE.MathUtils.damp(group.position.z, targetZ, DAMP_SPEED, delta)
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, frame.rotY, DAMP_SPEED, delta)
    group.rotation.z = THREE.MathUtils.damp(group.rotation.z, floatRotZ, DAMP_SPEED, delta)

    const scale = THREE.MathUtils.damp(group.scale.x, targetScale, DAMP_SPEED, delta)
    group.scale.setScalar(scale)
  })

  return (
    <group ref={groupRef}>
      {/* Body */}
      <RoundedBox args={[2.24, 4.64, 0.22]} radius={0.13} smoothness={6}>
        <meshStandardMaterial color="#12100e" metalness={0.65} roughness={0.35} />
      </RoundedBox>
      {/* Brushed metal frame */}
      <RoundedBox args={[2.3, 4.7, 0.18]} radius={0.14} smoothness={6} position={[0, 0, -0.01]}>
        <meshStandardMaterial color="#c2703a" metalness={0.95} roughness={0.28} />
      </RoundedBox>
      {/* Side buttons */}
      <mesh position={[1.16, 0.9, 0]}>
        <boxGeometry args={[0.03, 0.42, 0.08]} />
        <meshStandardMaterial color="#8a5227" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[1.16, 0.3, 0]}>
        <boxGeometry args={[0.03, 0.26, 0.08]} />
        <meshStandardMaterial color="#8a5227" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Screen — texture carries its own rounded corners via alpha */}
      <mesh position={[0, 0, 0.115]}>
        <planeGeometry args={[2.04, 4.44]} />
        <meshBasicMaterial map={screenTexture} transparent toneMapped={false} />
      </mesh>
      {/* Floating food chips travel with the phone */}
      {FLOATING_CHIPS.map((chip) => (
        <FloatingChip
          key={chip.emoji}
          emoji={chip.emoji}
          position={chip.position}
          size={chip.size}
          speed={chip.speed}
        />
      ))}
    </group>
  )
}

function OrbitingAccents() {
  const ringRef = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.12
      ringRef.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.3) * 0.08
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.08
      ring2Ref.current.rotation.x = Math.PI / 2.1 + Math.cos(t * 0.25) * 0.06
    }
  })

  return (
    <>
      <mesh ref={ringRef} position={[0, -0.2, -1.6]}>
        <torusGeometry args={[3.4, 0.014, 12, 128]} />
        <meshBasicMaterial color="#ea580c" transparent opacity={0.35} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 0.3, -2.4]}>
        <torusGeometry args={[4.4, 0.01, 12, 128]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.18} />
      </mesh>
    </>
  )
}

function CameraRig() {
  useFrame((state, delta) => {
    const targetX = state.pointer.x * 0.45
    const targetY = state.pointer.y * 0.3
    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, targetX, 2.5, delta)
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetY, 2.5, delta)
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

export function SmartMenuScene({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 6]} intensity={1.5} color="#fff7ed" />
      {/* Warm key + rim lights */}
      <pointLight position={[-4, -2, 4]} intensity={40} color="#ea580c" />
      <pointLight position={[4, 3, -2]} intensity={25} color="#f59e0b" />
      <directionalLight position={[-6, 2, -4]} intensity={0.8} color="#fdba74" />

      <SmartMenuPhone progress={progress} />
      <OrbitingAccents />
      <Sparkles count={90} scale={[10, 8, 5]} size={2.2} speed={0.3} opacity={0.4} color="#fdba74" />
      <CameraRig />
    </>
  )
}
