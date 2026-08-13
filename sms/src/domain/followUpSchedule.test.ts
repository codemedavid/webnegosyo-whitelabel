import { computeNextFollowUpDate, getContactsDueToday, isDueToday } from './followUpSchedule';
import type { Contact } from './types';

function buildContact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c1',
    name: 'Jane Doe',
    phone: '+15555550100',
    lastContactDate: '2026-07-01',
    nextFollowUpDate: '2026-07-08',
    followUpIntervalDays: 7,
    status: 'pending',
    consentGiven: true,
    ...overrides,
  };
}

describe('computeNextFollowUpDate', () => {
  it('adds intervalDays to the last contact date', () => {
    expect(computeNextFollowUpDate('2026-07-01', 7)).toBe('2026-07-08');
  });

  it('rolls over correctly across a month boundary', () => {
    expect(computeNextFollowUpDate('2026-07-28', 5)).toBe('2026-08-02');
  });

  it('rolls over correctly across a year boundary', () => {
    expect(computeNextFollowUpDate('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('throws for a non-positive interval', () => {
    expect(() => computeNextFollowUpDate('2026-07-01', 0)).toThrow();
  });
});

describe('isDueToday', () => {
  it('returns true when the follow-up date is today', () => {
    expect(isDueToday('2026-07-08', '2026-07-08')).toBe(true);
  });

  it('returns true when the follow-up date is in the past', () => {
    expect(isDueToday('2026-07-01', '2026-07-08')).toBe(true);
  });

  it('returns false when the follow-up date is in the future', () => {
    expect(isDueToday('2026-07-09', '2026-07-08')).toBe(false);
  });
});

describe('getContactsDueToday', () => {
  it('returns only pending contacts due today or earlier', () => {
    const contacts = [
      buildContact({ id: 'due', nextFollowUpDate: '2026-07-08' }),
      buildContact({ id: 'overdue', nextFollowUpDate: '2026-07-01' }),
      buildContact({ id: 'future', nextFollowUpDate: '2026-07-09' }),
    ];

    const due = getContactsDueToday(contacts, '2026-07-08');

    expect(due.map((c) => c.id)).toEqual(['overdue', 'due']);
  });

  it('excludes completed and opted-out contacts even if due', () => {
    const contacts = [
      buildContact({ id: 'completed', status: 'completed', nextFollowUpDate: '2026-07-01' }),
      buildContact({ id: 'optedOut', status: 'optedOut', nextFollowUpDate: '2026-07-01' }),
    ];

    expect(getContactsDueToday(contacts, '2026-07-08')).toEqual([]);
  });

  it('sorts overdue contacts oldest-first', () => {
    const contacts = [
      buildContact({ id: 'a', nextFollowUpDate: '2026-07-05' }),
      buildContact({ id: 'b', nextFollowUpDate: '2026-07-01' }),
      buildContact({ id: 'c', nextFollowUpDate: '2026-07-03' }),
    ];

    expect(getContactsDueToday(contacts, '2026-07-08').map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns an empty array when nothing is due', () => {
    const contacts = [buildContact({ nextFollowUpDate: '2026-08-01' })];

    expect(getContactsDueToday(contacts, '2026-07-08')).toEqual([]);
  });
});
