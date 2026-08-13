import type { TemplatesRepository } from '../repositories/types';

const DEFAULT_TEMPLATE_BODY = "Hi {{firstName}}, just checking in — let us know if there's anything you need!";

export async function ensureDefaultTemplate(
  templatesRepository: TemplatesRepository,
  generateId: () => string
): Promise<void> {
  const templates = await templatesRepository.getAll();
  if (templates.length > 0) {
    return;
  }

  await templatesRepository.insert({ id: generateId(), name: 'Default Follow-up', body: DEFAULT_TEMPLATE_BODY });
}
