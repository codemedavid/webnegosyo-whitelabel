import type { SQLiteDatabase } from 'expo-sqlite';

export type SqliteClient = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;
