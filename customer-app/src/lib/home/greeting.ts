const MORNING_START = 5
const AFTERNOON_START = 12
const EVENING_START = 18

/** Device-local time of day: the member is where the phone is. */
export function greetingFor(now: Date, firstName: string | null): string {
  const hour = now.getHours()
  const part =
    hour >= MORNING_START && hour < AFTERNOON_START
      ? 'Good morning'
      : hour >= AFTERNOON_START && hour < EVENING_START
        ? 'Good afternoon'
        : 'Good evening'
  return firstName ? `${part}, ${firstName}` : part
}
