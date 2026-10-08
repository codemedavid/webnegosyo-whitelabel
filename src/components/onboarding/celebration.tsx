'use client'

/**
 * A one-shot confetti fall behind the "ready" headline. Pure CSS, decorative
 * (aria-hidden), and switched off for people who ask for reduced motion.
 */

/** The owner's brand leads; ink and a warm gold keep it from reading as a toy. */
const COLORS = ['var(--ob-accent, #17130F)', 'var(--ob-accent, #17130F)', '#17130F', '#E8B23A', '#D3CCC4']
const PIECE_COUNT = 28

const PIECES = Array.from({ length: PIECE_COUNT }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 53) % 900) / 1000,
  duration: 1.6 + ((index * 29) % 120) / 100,
  rotate: (index * 47) % 360,
  color: COLORS[index % COLORS.length],
  isRound: index % 3 === 0,
}))

const KEYFRAMES = `
@keyframes ob-confetti-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translateY(260px) rotate(540deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .ob-confetti { display: none; } }
`

export function Celebration() {
  return (
    <div className="ob-confetti pointer-events-none absolute inset-x-0 -top-6 h-64 overflow-hidden" aria-hidden>
      <style>{KEYFRAMES}</style>
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className={`absolute top-0 block h-2.5 w-1.5 ${piece.isRound ? 'rounded-full' : 'rounded-[2px]'}`}
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotate}deg)`,
            opacity: 0,
            animation: `ob-confetti-fall ${piece.duration}s ease-in ${piece.delay}s 1 forwards`,
          }}
        />
      ))}
    </div>
  )
}
