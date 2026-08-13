import { initializeSchema } from './schema';
import type { SqliteClient } from './sqliteClient';

function makeMockDb(): jest.Mocked<SqliteClient> {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

describe('initializeSchema', () => {
  it('creates the contacts table if it does not exist', async () => {
    const db = makeMockDb();

    await initializeSchema(db);

    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS contacts'));
  });

  it('creates the templates table if it does not exist', async () => {
    const db = makeMockDb();

    await initializeSchema(db);

    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS templates'));
  });

  it('creates the sendLog table if it does not exist', async () => {
    const db = makeMockDb();

    await initializeSchema(db);

    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS sendLog'));
  });
});
