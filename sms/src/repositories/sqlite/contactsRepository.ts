import type { Contact, ContactStatus } from '../../domain/types';
import type { ContactsRepository } from '../types';
import type { SqliteClient } from './sqliteClient';

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  lastContactDate: string;
  nextFollowUpDate: string;
  followUpIntervalDays: number;
  status: string;
  consentGiven: number;
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    lastContactDate: row.lastContactDate,
    nextFollowUpDate: row.nextFollowUpDate,
    followUpIntervalDays: row.followUpIntervalDays,
    status: row.status as ContactStatus,
    consentGiven: row.consentGiven === 1,
  };
}

export function createSqliteContactsRepository(db: SqliteClient): ContactsRepository {
  return {
    async getAll(): Promise<Contact[]> {
      const rows = await db.getAllAsync<ContactRow>('SELECT * FROM contacts', []);
      return rows.map(rowToContact);
    },

    async getById(id: string): Promise<Contact | null> {
      const row = await db.getFirstAsync<ContactRow>('SELECT * FROM contacts WHERE id = ?', [id]);
      return row ? rowToContact(row) : null;
    },

    async insert(contact: Contact): Promise<void> {
      await db.runAsync(
        `INSERT INTO contacts (id, name, phone, lastContactDate, nextFollowUpDate, followUpIntervalDays, status, consentGiven)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contact.id,
          contact.name,
          contact.phone,
          contact.lastContactDate,
          contact.nextFollowUpDate,
          contact.followUpIntervalDays,
          contact.status,
          contact.consentGiven ? 1 : 0,
        ]
      );
    },

    async update(contact: Contact): Promise<void> {
      await db.runAsync(
        `UPDATE contacts
         SET name = ?, phone = ?, lastContactDate = ?, nextFollowUpDate = ?, followUpIntervalDays = ?, status = ?, consentGiven = ?
         WHERE id = ?`,
        [
          contact.name,
          contact.phone,
          contact.lastContactDate,
          contact.nextFollowUpDate,
          contact.followUpIntervalDays,
          contact.status,
          contact.consentGiven ? 1 : 0,
          contact.id,
        ]
      );
    },

    async delete(id: string): Promise<void> {
      await db.runAsync('DELETE FROM contacts WHERE id = ?', [id]);
    },
  };
}
