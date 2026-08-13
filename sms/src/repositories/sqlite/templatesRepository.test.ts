import { createSqliteTemplatesRepository } from './templatesRepository';
import type { SqliteClient } from './sqliteClient';
import type { Template } from '../../domain/types';

function makeMockDb(): jest.Mocked<SqliteClient> {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };
}

const TEMPLATE: Template = {
  id: 'template-1',
  name: 'Follow-up',
  body: 'Hi {{firstName}}, checking in!',
};

describe('createSqliteTemplatesRepository', () => {
  describe('getAll', () => {
    it('maps stored rows back into Template objects', async () => {
      const db = makeMockDb();
      (db.getAllAsync as jest.Mock).mockResolvedValue([TEMPLATE]);
      const repository = createSqliteTemplatesRepository(db);

      const templates = await repository.getAll();

      expect(templates).toEqual([TEMPLATE]);
    });

    it('returns an empty array when there are no rows', async () => {
      const db = makeMockDb();
      const repository = createSqliteTemplatesRepository(db);

      const templates = await repository.getAll();

      expect(templates).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns the matching template when found', async () => {
      const db = makeMockDb();
      (db.getFirstAsync as jest.Mock).mockResolvedValue(TEMPLATE);
      const repository = createSqliteTemplatesRepository(db);

      const template = await repository.getById('template-1');

      expect(template).toEqual(TEMPLATE);
      expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ?'), ['template-1']);
    });

    it('returns null when no template matches', async () => {
      const db = makeMockDb();
      const repository = createSqliteTemplatesRepository(db);

      const template = await repository.getById('missing');

      expect(template).toBeNull();
    });
  });

  describe('insert', () => {
    it('inserts a new row', async () => {
      const db = makeMockDb();
      const repository = createSqliteTemplatesRepository(db);

      await repository.insert(TEMPLATE);

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO templates'),
        [TEMPLATE.id, TEMPLATE.name, TEMPLATE.body]
      );
    });
  });

  describe('update', () => {
    it('updates the row matching the template id', async () => {
      const db = makeMockDb();
      const repository = createSqliteTemplatesRepository(db);

      await repository.update({ ...TEMPLATE, body: 'Updated body' });

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE templates'),
        [TEMPLATE.name, 'Updated body', TEMPLATE.id]
      );
    });
  });

  describe('delete', () => {
    it('deletes the row matching the given id', async () => {
      const db = makeMockDb();
      const repository = createSqliteTemplatesRepository(db);

      await repository.delete('template-1');

      expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM templates'), ['template-1']);
    });
  });
});
