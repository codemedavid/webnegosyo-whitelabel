import type { Contact, SendLogEntry, Template } from '../domain/types';

export interface ContactsRepository {
  getAll(): Promise<Contact[]>;
  getById(id: string): Promise<Contact | null>;
  insert(contact: Contact): Promise<void>;
  update(contact: Contact): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TemplatesRepository {
  getAll(): Promise<Template[]>;
  getById(id: string): Promise<Template | null>;
  insert(template: Template): Promise<void>;
  update(template: Template): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SendLogRepository {
  getAll(): Promise<SendLogEntry[]>;
  getByContactId(contactId: string): Promise<SendLogEntry[]>;
  append(entry: SendLogEntry): Promise<void>;
}
