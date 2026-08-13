import { buildContactTemplateVariables } from '../../domain/contactTemplateVariables';
import { getContactsDueToday } from '../../domain/followUpSchedule';
import { renderTemplate, TemplateVariableError } from '../../domain/templateRenderer';
import type { Contact, Template } from '../../domain/types';

export interface TodayContactPreview {
  contact: Contact;
  message: string;
  error?: string;
}

export interface TodayViewModel {
  template: Template | null;
  dueContacts: Contact[];
  previews: TodayContactPreview[];
  emptyStateMessage: string | null;
}

function buildPreview(contact: Contact, template: Template): TodayContactPreview {
  try {
    return { contact, message: renderTemplate(template.body, buildContactTemplateVariables(contact)) };
  } catch (error) {
    const errorMessage = error instanceof TemplateVariableError ? error.message : 'Unable to render message';
    return { contact, message: '', error: errorMessage };
  }
}

export function computeTodayViewModel(
  contacts: readonly Contact[],
  templates: readonly Template[],
  today: string
): TodayViewModel {
  const dueContacts = getContactsDueToday(contacts, today);

  if (dueContacts.length === 0) {
    return { template: null, dueContacts, previews: [], emptyStateMessage: 'No follow-ups due today.' };
  }

  const template = templates[0] ?? null;
  if (!template) {
    return {
      template: null,
      dueContacts,
      previews: [],
      emptyStateMessage: 'Add a message template in Settings before running follow-ups.',
    };
  }

  const previews = dueContacts.map((contact) => buildPreview(contact, template));

  return { template, dueContacts, previews, emptyStateMessage: null };
}
