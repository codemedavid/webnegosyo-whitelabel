import type { SqliteClient } from './sqliteClient';

const CREATE_CONTACTS_TABLE = `
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    lastContactDate TEXT NOT NULL,
    nextFollowUpDate TEXT NOT NULL,
    followUpIntervalDays INTEGER NOT NULL,
    status TEXT NOT NULL,
    consentGiven INTEGER NOT NULL
  );
`;

const CREATE_TEMPLATES_TABLE = `
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL
  );
`;

const CREATE_SEND_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS sendLog (
    id TEXT PRIMARY KEY NOT NULL,
    contactId TEXT NOT NULL,
    sentAt TEXT NOT NULL,
    messageBody TEXT NOT NULL,
    result TEXT NOT NULL,
    errorMessage TEXT
  );
`;

export async function initializeSchema(db: SqliteClient): Promise<void> {
  await db.execAsync(CREATE_CONTACTS_TABLE);
  await db.execAsync(CREATE_TEMPLATES_TABLE);
  await db.execAsync(CREATE_SEND_LOG_TABLE);
}
