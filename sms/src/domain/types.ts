export type ContactStatus = 'pending' | 'completed' | 'optedOut';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  lastContactDate: string;
  nextFollowUpDate: string;
  followUpIntervalDays: number;
  status: ContactStatus;
  consentGiven: boolean;
}

export interface Template {
  id: string;
  name: string;
  body: string;
}

export interface SendLogEntry {
  id: string;
  contactId: string;
  sentAt: string;
  messageBody: string;
  result: 'sent' | 'failed';
  errorMessage?: string;
}
