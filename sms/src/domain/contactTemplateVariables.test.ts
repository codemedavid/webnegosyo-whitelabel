import { buildContactTemplateVariables } from './contactTemplateVariables';
import type { Contact } from './types';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    name: 'Jane Doe',
    phone: '+15555550100',
    lastContactDate: '2026-07-01',
    nextFollowUpDate: '2026-07-08',
    followUpIntervalDays: 7,
    status: 'pending',
    consentGiven: true,
    ...overrides,
  };
}

describe('buildContactTemplateVariables', () => {
  it('extracts the first word of the name as firstName', () => {
    const variables = buildContactTemplateVariables(makeContact({ name: 'Jane Doe' }));

    expect(variables).toEqual({ firstName: 'Jane', name: 'Jane Doe' });
  });

  it('uses the whole name as firstName when there is only one word', () => {
    const variables = buildContactTemplateVariables(makeContact({ name: 'Cher' }));

    expect(variables).toEqual({ firstName: 'Cher', name: 'Cher' });
  });

  it('collapses extra whitespace between name parts', () => {
    const variables = buildContactTemplateVariables(makeContact({ name: '  Jane   Doe  ' }));

    expect(variables).toEqual({ firstName: 'Jane', name: '  Jane   Doe  ' });
  });

  it('falls back to the raw name when it is entirely whitespace', () => {
    const variables = buildContactTemplateVariables(makeContact({ name: '   ' }));

    expect(variables).toEqual({ firstName: '   ', name: '   ' });
  });
});
