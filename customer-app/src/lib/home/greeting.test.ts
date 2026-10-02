import { greetingFor } from './greeting'

const at = (hour: number) => new Date(2026, 8, 30, hour, 15)

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(at(6), null)).toBe('Good morning')
    expect(greetingFor(at(13), null)).toBe('Good afternoon')
    expect(greetingFor(at(20), null)).toBe('Good evening')
    expect(greetingFor(at(2), null)).toBe('Good evening')
  })

  it('addresses a member by first name', () => {
    expect(greetingFor(at(9), 'Angelo')).toBe('Good morning, Angelo')
  })
})
