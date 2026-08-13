import type { SendLogEntry } from '../../domain/types';
import type { SendLogRepository } from '../types';
import type { SqliteClient } from './sqliteClient';

interface SendLogRow {
  id: string;
  contactId: string;
  sentAt: string;
  messageBody: string;
  result: 'sent' | 'failed';
  errorMessage: string | null;
}

function rowToEntry(row: SendLogRow): SendLogEntry {
  return {
    id: row.id,
    contactId: row.contactId,
    sentAt: row.sentAt,
    messageBody: row.messageBody,
    result: row.result,
    ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
  };
}

export function createSqliteSendLogRepository(db: SqliteClient): SendLogRepository {
  return {
    async getAll(): Promise<SendLogEntry[]> {
      const rows = await db.getAllAsync<SendLogRow>('SELECT * FROM sendLog', []);
      return rows.map(rowToEntry);
    },

    async getByContactId(contactId: string): Promise<SendLogEntry[]> {
      const rows = await db.getAllAsync<SendLogRow>('SELECT * FROM sendLog WHERE contactId = ?', [contactId]);
      return rows.map(rowToEntry);
    },

    async append(entry: SendLogEntry): Promise<void> {
      await db.runAsync(
        'INSERT INTO sendLog (id, contactId, sentAt, messageBody, result, errorMessage) VALUES (?, ?, ?, ?, ?, ?)',
        [entry.id, entry.contactId, entry.sentAt, entry.messageBody, entry.result, entry.errorMessage ?? null]
      );
    },
  };
}
