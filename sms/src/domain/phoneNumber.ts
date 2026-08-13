const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;
const US_DIGIT_COUNT = 10;
const US_DIGIT_COUNT_WITH_COUNTRY_CODE = 11;

export function normalizePhoneNumber(rawValue: string): string | null {
  const hasLeadingPlus = rawValue.trim().startsWith('+');
  const digits = rawValue.replace(/\D/g, '');

  if (digits.length === 0) {
    return null;
  }

  if (hasLeadingPlus) {
    return isValidDigitCount(digits.length) ? `+${digits}` : null;
  }

  if (digits.length === US_DIGIT_COUNT) {
    return `+1${digits}`;
  }

  if (digits.length === US_DIGIT_COUNT_WITH_COUNTRY_CODE && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

function isValidDigitCount(count: number): boolean {
  return count >= MIN_E164_DIGITS && count <= MAX_E164_DIGITS;
}
