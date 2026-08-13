import type { Contact } from './types';

export function buildContactTemplateVariables(contact: Contact): Record<string, string> {
  const [firstName] = contact.name.trim().split(/\s+/);
  return { firstName: firstName || contact.name, name: contact.name };
}
