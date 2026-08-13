import type { Template } from '../../domain/types';
import type { TemplatesRepository } from '../types';
import type { SqliteClient } from './sqliteClient';

export function createSqliteTemplatesRepository(db: SqliteClient): TemplatesRepository {
  return {
    async getAll(): Promise<Template[]> {
      return db.getAllAsync<Template>('SELECT * FROM templates', []);
    },

    async getById(id: string): Promise<Template | null> {
      return db.getFirstAsync<Template>('SELECT * FROM templates WHERE id = ?', [id]);
    },

    async insert(template: Template): Promise<void> {
      await db.runAsync(
        'INSERT INTO templates (id, name, body) VALUES (?, ?, ?)',
        [template.id, template.name, template.body]
      );
    },

    async update(template: Template): Promise<void> {
      await db.runAsync(
        'UPDATE templates SET name = ?, body = ? WHERE id = ?',
        [template.name, template.body, template.id]
      );
    },

    async delete(id: string): Promise<void> {
      await db.runAsync('DELETE FROM templates WHERE id = ?', [id]);
    },
  };
}
