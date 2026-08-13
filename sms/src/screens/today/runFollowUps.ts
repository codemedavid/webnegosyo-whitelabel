import { buildContactTemplateVariables } from '../../domain/contactTemplateVariables';
import { computeNextFollowUpDate } from '../../domain/followUpSchedule';
import { renderTemplate, TemplateVariableError } from '../../domain/templateRenderer';
import type { Contact, Template } from '../../domain/types';
import type { ContactsRepository, SendLogRepository } from '../../repositories/types';

export type FollowUpSendStatus = 'sent' | 'failed' | 'skipped';

export interface FollowUpSendResult {
  contactId: string;
  status: FollowUpSendStatus;
  message?: string;
  errorMessage?: string;
}

export interface RunFollowUpsDeps {
  contactsRepository: ContactsRepository;
  sendLogRepository: SendLogRepository;
  sendSms: (phoneNumber: string, message: string) => Promise<void>;
  generateId: () => string;
  today: string;
  now: () => string;
  wait: (ms: number) => Promise<void>;
  staggerMs: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function sendToContact(
  contact: Contact,
  template: Template,
  deps: RunFollowUpsDeps
): Promise<FollowUpSendResult> {
  const { contactsRepository, sendLogRepository, sendSms, generateId, today, now } = deps;

  let message: string;
  try {
    message = renderTemplate(template.body, buildContactTemplateVariables(contact));
  } catch (error) {
    const errorMessage = error instanceof TemplateVariableError ? error.message : getErrorMessage(error);
    await sendLogRepository.append({
      id: generateId(),
      contactId: contact.id,
      sentAt: now(),
      messageBody: template.body,
      result: 'failed',
      errorMessage,
    });
    return { contactId: contact.id, status: 'failed', errorMessage };
  }

  try {
    await sendSms(contact.phone, message);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await sendLogRepository.append({
      id: generateId(),
      contactId: contact.id,
      sentAt: now(),
      messageBody: message,
      result: 'failed',
      errorMessage,
    });
    return { contactId: contact.id, status: 'failed', errorMessage };
  }

  await sendLogRepository.append({
    id: generateId(),
    contactId: contact.id,
    sentAt: now(),
    messageBody: message,
    result: 'sent',
  });
  await contactsRepository.update({
    ...contact,
    lastContactDate: today,
    nextFollowUpDate: computeNextFollowUpDate(today, contact.followUpIntervalDays),
  });

  return { contactId: contact.id, status: 'sent', message };
}

export async function runFollowUpsForToday(
  contacts: readonly Contact[],
  template: Template,
  deps: RunFollowUpsDeps
): Promise<FollowUpSendResult[]> {
  const results: FollowUpSendResult[] = [];

  for (const [index, contact] of contacts.entries()) {
    if (index > 0) {
      await deps.wait(deps.staggerMs);
    }

    if (!contact.consentGiven) {
      results.push({ contactId: contact.id, status: 'skipped', errorMessage: 'Contact has not given consent' });
      continue;
    }

    results.push(await sendToContact(contact, template, deps));
  }

  return results;
}
