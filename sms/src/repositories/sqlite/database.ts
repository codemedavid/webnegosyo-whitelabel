import * as SQLite from 'expo-sqlite';
import type { ContactsRepository, SendLogRepository, TemplatesRepository } from '../types';
import { createSqliteContactsRepository } from './contactsRepository';
import { createSqliteSendLogRepository } from './sendLogRepository';
import { initializeSchema } from './schema';
import { createSqliteTemplatesRepository } from './templatesRepository';

const DATABASE_NAME = 'sms-followup.db';

export interface AppRepositories {
  contacts: ContactsRepository;
  templates: TemplatesRepository;
  sendLog: SendLogRepository;
}

export async function openAppRepositories(): Promise<AppRepositories> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await initializeSchema(db);

  return {
    contacts: createSqliteContactsRepository(db),
    templates: createSqliteTemplatesRepository(db),
    sendLog: createSqliteSendLogRepository(db),
  };
}
