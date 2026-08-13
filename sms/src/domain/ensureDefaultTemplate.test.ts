import { ensureDefaultTemplate } from './ensureDefaultTemplate';
import type { TemplatesRepository } from '../repositories/types';
import type { Template } from './types';

function makeTemplatesRepository(overrides: Partial<jest.Mocked<TemplatesRepository>> = {}): jest.Mocked<TemplatesRepository> {
  return {
    getAll: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ensureDefaultTemplate', () => {
  it('inserts a default template when none exist', async () => {
    const templatesRepository = makeTemplatesRepository();
    const generateId = jest.fn(() => 'template-1');

    await ensureDefaultTemplate(templatesRepository, generateId);

    expect(templatesRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'template-1', body: expect.stringContaining('{{firstName}}') })
    );
  });

  it('does nothing when a template already exists', async () => {
    const existing: Template = { id: 'existing', name: 'Existing', body: 'Hi {{firstName}}' };
    const templatesRepository = makeTemplatesRepository({ getAll: jest.fn().mockResolvedValue([existing]) });
    const generateId = jest.fn(() => 'template-1');

    await ensureDefaultTemplate(templatesRepository, generateId);

    expect(templatesRepository.insert).not.toHaveBeenCalled();
  });
});
