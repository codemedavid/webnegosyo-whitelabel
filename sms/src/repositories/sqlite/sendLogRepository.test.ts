import { createSqliteSendLogRepository } from './sendLogRepository';
import type { SqliteClient } from './sqliteClient';
import type { SendLogEntry } from '../../domain/types';

function makeMockDb(): jest.Mocked<SqliteClient> {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };
}

const SENT_ENTRY: SendLogEntry = {
  id: 'log-1',
  contactId: 'contact-1',
  sentAt: '2026-07-08T10:00:00.000Z',
  messageBody: 'Hi Jane, checking in!',
  result: 'sent',
};

const FAILED_ENTRY: SendLogEntry = {
  id: 'log-2',
  contactId: 'contact-2',
  sentAt: '2026-07-08T10:05:00.000Z',
  messageBody: 'Hi John, checking in!',
  result: 'failed',
  errorMessage: 'SMS permission denied',
};

describe('createSqliteSendLogRepository', () => {
  describe('getAll', () => {
    it('maps rows without an errorMessage column value back to entries with no errorMessage field', async () => {
      const db = makeMockDb();
      (db.getAllAsync as jest.Mock).mockResolvedValue([{ ...SENT_ENTRY, errorMessage: null }]);
      const repository = createSqliteSendLogRepository(db);

      const entries = await repository.getAll();

      expect(entries).toEqual([SENT_ENTRY]);
    });

    it('maps rows with an errorMessage column value back to entries with that errorMessage', async () => {
      const db = makeMockDb();
      (db.getAllAsync as jest.Mock).mockResolvedValue([FAILED_ENTRY]);
      const repository = createSqliteSendLogRepository(db);

      const entries = await repository.getAll();

      expect(entries).toEqual([FAILED_ENTRY]);
    });

    it('returns an empty array when there are no rows', async () => {
      const db = makeMockDb();
      const repository = createSqliteSendLogRepository(db);

      const entries = await repository.getAll();

      expect(entries).toEqual([]);
    });
  });

  describe('getByContactId', () => {
    it('returns only entries for the given contact id', async () => {
      const db = makeMockDb();
      (db.getAllAsync as jest.Mock).mockResolvedValue([{ ...SENT_ENTRY, errorMessage: null }]);
      const repository = createSqliteSendLogRepository(db);

      const entries = await repository.getByContactId('contact-1');

      expect(entries).toEqual([SENT_ENTRY]);
      expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE contactId = ?'), ['contact-1']);
    });
  });

  describe('append', () => {
    it('inserts a sent entry with a null errorMessage', async () => {
      const db = makeMockDb();
      const repository = createSqliteSendLogRepository(db);

      await repository.append(SENT_ENTRY);

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sendLog'),
        [SENT_ENTRY.id, SENT_ENTRY.contactId, SENT_ENTRY.sentAt, SENT_ENTRY.messageBody, SENT_ENTRY.result, null]
      );
    });

    it('inserts a failed entry with its errorMessage', async () => {
      const db = makeMockDb();
      const repository = createSqliteSendLogRepository(db);

      await repository.append(FAILED_ENTRY);

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sendLog'),
        [
          FAILED_ENTRY.id,
          FAILED_ENTRY.contactId,
          FAILED_ENTRY.sentAt,
          FAILED_ENTRY.messageBody,
          FAILED_ENTRY.result,
          FAILED_ENTRY.errorMessage,
        ]
      );
    });
  });
});
