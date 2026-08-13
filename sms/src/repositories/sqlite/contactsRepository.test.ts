import { createSqliteContactsRepository } from './contactsRepository';
import type { SqliteClient } from './sqliteClient';
import type { Contact } from '../../domain/types';

function makeMockDb(): jest.Mocked<SqliteClient> {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };
}

const CONTACT: Contact = {
  id: 'contact-1',
  name: 'Jane Doe',
  phone: '+15555550100',
  lastContactDate: '2026-07-01',
  nextFollowUpDate: '2026-07-08',
  followUpIntervalDays: 7,
  status: 'pending',
  consentGiven: true,
};

describe('createSqliteContactsRepository', () => {
  describe('getAll', () => {
    it('maps stored rows back into Contact objects, converting consentGiven from integer to boolean', async () => {
      const db = makeMockDb();
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        { ...CONTACT, consentGiven: 1 },
        { ...CONTACT, id: 'contact-2', consentGiven: 0 },
      ]);
      const repository = createSqliteContactsRepository(db);

      const contacts = await repository.getAll();

      expect(contacts).toEqual([
        CONTACT,
        { ...CONTACT, id: 'contact-2', consentGiven: false },
      ]);
    });

    it('returns an empty array when there are no rows', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      const contacts = await repository.getAll();

      expect(contacts).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns the matching contact when found', async () => {
      const db = makeMockDb();
      (db.getFirstAsync as jest.Mock).mockResolvedValue({ ...CONTACT, consentGiven: 1 });
      const repository = createSqliteContactsRepository(db);

      const contact = await repository.getById('contact-1');

      expect(contact).toEqual(CONTACT);
      expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ?'), ['contact-1']);
    });

    it('returns null when no contact matches', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      const contact = await repository.getById('missing');

      expect(contact).toBeNull();
    });
  });

  describe('insert', () => {
    it('inserts a new row with consentGiven stored as an integer', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      await repository.insert(CONTACT);

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO contacts'),
        [
          CONTACT.id,
          CONTACT.name,
          CONTACT.phone,
          CONTACT.lastContactDate,
          CONTACT.nextFollowUpDate,
          CONTACT.followUpIntervalDays,
          CONTACT.status,
          1,
        ]
      );
    });

    it('stores consentGiven as 0 when the contact has not consented', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      await repository.insert({ ...CONTACT, consentGiven: false });

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO contacts'),
        [
          CONTACT.id,
          CONTACT.name,
          CONTACT.phone,
          CONTACT.lastContactDate,
          CONTACT.nextFollowUpDate,
          CONTACT.followUpIntervalDays,
          CONTACT.status,
          0,
        ]
      );
    });
  });

  describe('update', () => {
    it('updates the row matching the contact id', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      await repository.update({ ...CONTACT, status: 'completed', consentGiven: false });

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE contacts'),
        [
          CONTACT.name,
          CONTACT.phone,
          CONTACT.lastContactDate,
          CONTACT.nextFollowUpDate,
          CONTACT.followUpIntervalDays,
          'completed',
          0,
          CONTACT.id,
        ]
      );
    });

    it('stores consentGiven as 1 when the contact has consented', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      await repository.update({ ...CONTACT, consentGiven: true });

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE contacts'),
        [
          CONTACT.name,
          CONTACT.phone,
          CONTACT.lastContactDate,
          CONTACT.nextFollowUpDate,
          CONTACT.followUpIntervalDays,
          CONTACT.status,
          1,
          CONTACT.id,
        ]
      );
    });
  });

  describe('delete', () => {
    it('deletes the row matching the given id', async () => {
      const db = makeMockDb();
      const repository = createSqliteContactsRepository(db);

      await repository.delete('contact-1');

      expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM contacts'), ['contact-1']);
    });
  });
});
