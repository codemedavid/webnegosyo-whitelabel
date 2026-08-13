import { normalizePhoneNumber } from './phoneNumber';

describe('normalizePhoneNumber', () => {
  it('normalizes a formatted US number to E.164', () => {
    expect(normalizePhoneNumber('(555) 555-0100')).toBe('+15555550100');
  });

  it('normalizes a dashed US number to E.164', () => {
    expect(normalizePhoneNumber('555-555-0100')).toBe('+15555550100');
  });

  it('leaves an already-E.164 number unchanged', () => {
    expect(normalizePhoneNumber('+15555550100')).toBe('+15555550100');
  });

  it('adds the + prefix to an 11-digit number starting with 1', () => {
    expect(normalizePhoneNumber('15555550100')).toBe('+15555550100');
  });

  it('preserves a non-US E.164 number', () => {
    expect(normalizePhoneNumber('+442071838750')).toBe('+442071838750');
  });

  it('returns null for a number that is too short', () => {
    expect(normalizePhoneNumber('12345')).toBeNull();
  });

  it('returns null for a number that is too long', () => {
    expect(normalizePhoneNumber('+1234567890123456')).toBeNull();
  });

  it('returns null for a value with no digits', () => {
    expect(normalizePhoneNumber('not-a-phone')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normalizePhoneNumber('')).toBeNull();
  });

  it('returns null for a bare local number without a country code instead of guessing one', () => {
    expect(normalizePhoneNumber('09668820122')).toBeNull();
  });
});
