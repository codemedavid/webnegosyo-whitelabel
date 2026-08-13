const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { openAppRepositories } from './database';
import * as SQLite from 'expo-sqlite';

describe('openAppRepositories', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('opens the app database and initializes the schema', async () => {
    await openAppRepositories();

    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(expect.any(String));
    expect(mockDb.execAsync).toHaveBeenCalled();
  });

  it('returns repositories backed by the opened database connection', async () => {
    const repositories = await openAppRepositories();

    await repositories.contacts.getAll();
    await repositories.templates.getAll();
    await repositories.sendLog.getAll();

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(3);
  });
});
