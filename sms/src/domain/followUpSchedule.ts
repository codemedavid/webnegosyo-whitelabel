import type { Contact } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeNextFollowUpDate(lastContactDate: string, intervalDays: number): string {
  if (intervalDays <= 0) {
    throw new Error('intervalDays must be a positive number');
  }

  const next = new Date(parseIsoDate(lastContactDate).getTime() + intervalDays * MS_PER_DAY);
  return toIsoDate(next);
}

export function isDueToday(nextFollowUpDate: string, today: string): boolean {
  return parseIsoDate(nextFollowUpDate).getTime() <= parseIsoDate(today).getTime();
}

export function getContactsDueToday(contacts: readonly Contact[], today: string): Contact[] {
  return contacts
    .filter((contact) => contact.status === 'pending' && isDueToday(contact.nextFollowUpDate, today))
    .sort((a, b) => parseIsoDate(a.nextFollowUpDate).getTime() - parseIsoDate(b.nextFollowUpDate).getTime());
}
