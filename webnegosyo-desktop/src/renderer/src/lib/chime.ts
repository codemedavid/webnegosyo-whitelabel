let ctx: AudioContext | null = null

export function playNewOrderChime(): void {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    const tones: Array<[number, number]> = [
      [880, 0],
      [1175, 0.18],
    ]
    for (const [freq, offset] of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.4)
    }
  } catch {
    // audio is best-effort
  }
}
