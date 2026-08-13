import { parseCsvContacts } from './csvImport';
import type { CsvColumnMapping } from './csvImport';

const MAPPING: CsvColumnMapping = {
  name: 'Name',
  phone: 'Phone',
  lastContactDate: 'Last Contact',
  followUpIntervalDays: 'Interval',
};

function makeIdGenerator(): () => string {
  let counter = 0;
  return () => `contact-${++counter}`;
}

describe('parseCsvContacts', () => {
  it('parses valid rows into contacts with computed next follow-up dates', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,(555) 555-0100,2026-07-01,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.errors).toEqual([]);
    expect(result.contacts).toEqual([
      {
        id: 'contact-1',
        name: 'Jane Doe',
        phone: '+15555550100',
        lastContactDate: '2026-07-01',
        nextFollowUpDate: '2026-07-08',
        followUpIntervalDays: 7,
        status: 'pending',
        consentGiven: true,
      },
    ]);
  });

  it('returns an empty result for a header-only CSV', () => {
    const result = parseCsvContacts({
      csvText: 'Name,Phone,Last Contact,Interval',
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result).toEqual({ contacts: [], errors: [] });
  });

  it('reports an error and skips the row when name is blank', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', ',555-555-0100,2026-07-01,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: 'Missing name' }]);
  });

  it('reports an error and skips the row when the phone number is invalid', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,12345,2026-07-01,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: 'Invalid phone number: "12345"' }]);
  });

  it('reports an error and skips the row when the last contact date is invalid', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,555-555-0100,not-a-date,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: 'Invalid last contact date: "not-a-date"' }]);
  });

  it('reports an error and skips the row when the last contact date is in the future', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,555-555-0100,2026-07-09,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: 'Last contact date is in the future: "2026-07-09"' }]);
  });

  it('reports an error and skips the row when the follow-up interval is not a positive integer', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,555-555-0100,2026-07-01,0'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: 'Invalid follow-up interval: "0"' }]);
  });

  it('dedupes rows sharing the same normalized phone number, keeping the first', () => {
    const csvText = [
      'Name,Phone,Last Contact,Interval',
      'Jane Doe,555-555-0100,2026-07-01,7',
      'J. Doe,(555) 555-0100,2026-07-02,3',
    ].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Jane Doe');
    expect(result.errors).toEqual([{ row: 3, message: 'Duplicate phone number, skipped: +15555550100' }]);
  });

  it('parses a mapped consent column', () => {
    const mappingWithConsent: CsvColumnMapping = { ...MAPPING, consentGiven: 'Consent' };
    const csvText = [
      'Name,Phone,Last Contact,Interval,Consent',
      'Jane Doe,555-555-0100,2026-07-01,7,yes',
      'John Roe,555-555-0200,2026-07-01,7,no',
    ].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: mappingWithConsent,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts.map((c) => c.consentGiven)).toEqual([true, false]);
  });

  it('defaults consentGiven to true when no consent column is mapped', () => {
    const csvText = ['Name,Phone,Last Contact,Interval', 'Jane Doe,555-555-0100,2026-07-01,7'].join('\n');

    const result = parseCsvContacts({
      csvText,
      columnMapping: MAPPING,
      today: '2026-07-08',
      generateId: makeIdGenerator(),
    });

    expect(result.contacts[0].consentGiven).toBe(true);
  });
});
