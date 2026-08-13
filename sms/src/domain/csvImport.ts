import Papa from 'papaparse';
import { computeNextFollowUpDate } from './followUpSchedule';
import { normalizePhoneNumber } from './phoneNumber';
import type { Contact } from './types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TRUTHY_CONSENT_VALUES = new Set(['yes', 'true', '1', 'y']);
const HEADER_ROW_OFFSET = 2;

export interface CsvColumnMapping {
  name: string;
  phone: string;
  lastContactDate: string;
  followUpIntervalDays: string;
  consentGiven?: string;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  contacts: Contact[];
  errors: CsvRowError[];
}

export interface CsvImportOptions {
  csvText: string;
  columnMapping: CsvColumnMapping;
  today: string;
  generateId: () => string;
}

export function parseCsvContacts(options: CsvImportOptions): CsvImportResult {
  const { csvText, columnMapping, today, generateId } = options;
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const contacts: Contact[] = [];
  const errors: CsvRowError[] = [];
  const seenPhones = new Set<string>();

  const context: RowParseContext = { mapping: columnMapping, today, generateId, seenPhones, errors };

  parsed.data.forEach((row, index) => {
    const rowNumber = index + HEADER_ROW_OFFSET;
    const contact = parseRow(row, rowNumber, context);

    if (contact) {
      contacts.push(contact);
      seenPhones.add(contact.phone);
    }
  });

  return { contacts, errors };
}

interface RowParseContext {
  mapping: CsvColumnMapping;
  today: string;
  generateId: () => string;
  seenPhones: ReadonlySet<string>;
  errors: CsvRowError[];
}

function parseRow(row: Record<string, string>, rowNumber: number, context: RowParseContext): Contact | null {
  const { mapping, today, generateId, seenPhones, errors } = context;

  const name = (row[mapping.name] ?? '').trim();
  if (!name) {
    errors.push({ row: rowNumber, message: 'Missing name' });
    return null;
  }

  const rawPhone = row[mapping.phone] ?? '';
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone) {
    errors.push({ row: rowNumber, message: `Invalid phone number: "${rawPhone}"` });
    return null;
  }

  if (seenPhones.has(phone)) {
    errors.push({ row: rowNumber, message: `Duplicate phone number, skipped: ${phone}` });
    return null;
  }

  const lastContactDate = (row[mapping.lastContactDate] ?? '').trim();
  if (!ISO_DATE_PATTERN.test(lastContactDate) || Number.isNaN(Date.parse(lastContactDate))) {
    errors.push({ row: rowNumber, message: `Invalid last contact date: "${lastContactDate}"` });
    return null;
  }

  if (lastContactDate > today) {
    errors.push({ row: rowNumber, message: `Last contact date is in the future: "${lastContactDate}"` });
    return null;
  }

  const rawInterval = (row[mapping.followUpIntervalDays] ?? '').trim();
  const followUpIntervalDays = Number(rawInterval);
  if (!Number.isInteger(followUpIntervalDays) || followUpIntervalDays <= 0) {
    errors.push({ row: rowNumber, message: `Invalid follow-up interval: "${rawInterval}"` });
    return null;
  }

  const consentGiven = mapping.consentGiven
    ? TRUTHY_CONSENT_VALUES.has((row[mapping.consentGiven] ?? '').trim().toLowerCase())
    : true;

  return {
    id: generateId(),
    name,
    phone,
    lastContactDate,
    nextFollowUpDate: computeNextFollowUpDate(lastContactDate, followUpIntervalDays),
    followUpIntervalDays,
    status: 'pending',
    consentGiven,
  };
}
