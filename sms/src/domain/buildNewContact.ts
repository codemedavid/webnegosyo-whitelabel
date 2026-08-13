import { normalizePhoneNumber } from './phoneNumber';
import type { Contact } from './types';

const DEFAULT_FOLLOW_UP_INTERVAL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface NewContactInput {
  name: string;
  phone: string;
  consentGiven: boolean;
}

export class InvalidPhoneNumberError extends Error {
  constructor(rawPhone: string) {
    super(`Invalid phone number: "${rawPhone}". Enter it in international format, e.g. +15555550100.`);
    this.name = 'InvalidPhoneNumberError';
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildNewContact(input: NewContactInput, generateId: () => string, today: string): Contact {
  const phone = normalizePhoneNumber(input.phone);
  if (!phone) {
    throw new InvalidPhoneNumberError(input.phone);
  }

  const lastContactDate = toIsoDate(new Date(new Date(`${today}T00:00:00Z`).getTime() - MS_PER_DAY));

  return {
    id: generateId(),
    name: input.name,
    phone,
    lastContactDate,
    nextFollowUpDate: today,
    followUpIntervalDays: DEFAULT_FOLLOW_UP_INTERVAL_DAYS,
    status: 'pending',
    consentGiven: input.consentGiven,
  };
}
