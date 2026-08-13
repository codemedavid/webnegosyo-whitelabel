import { computeTodayViewModel } from './computeTodayViewModel';
import type { Contact, Template } from '../../domain/types';

const TODAY = '2026-07-08';

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

const TEMPLATE: Template = {
  id: 'template-1',
  name: 'Follow-up',
  body: 'Hi {{firstName}}, just checking in!',
};

describe('computeTodayViewModel', () => {
  it('returns an empty-state message when no contacts are due today', () => {
    const contact = makeContact({ nextFollowUpDate: '2026-07-09' });

    const viewModel = computeTodayViewModel([contact], [TEMPLATE], TODAY);

    expect(viewModel.dueContacts).toEqual([]);
    expect(viewModel.previews).toEqual([]);
    expect(viewModel.emptyStateMessage).toBe('No follow-ups due today.');
  });

  it('returns a guidance message when contacts are due but no template is configured', () => {
    const contact = makeContact();

    const viewModel = computeTodayViewModel([contact], [], TODAY);

    expect(viewModel.template).toBeNull();
    expect(viewModel.dueContacts).toEqual([contact]);
    expect(viewModel.previews).toEqual([]);
    expect(viewModel.emptyStateMessage).toBe('Add a message template in Settings before running follow-ups.');
  });

  it('renders a preview message for each due contact using the first template', () => {
    const contact = makeContact();

    const viewModel = computeTodayViewModel([contact], [TEMPLATE], TODAY);

    expect(viewModel.template).toEqual(TEMPLATE);
    expect(viewModel.emptyStateMessage).toBeNull();
    expect(viewModel.previews).toEqual([{ contact, message: 'Hi Jane, just checking in!' }]);
  });

  it('includes a render error in the preview instead of throwing when a variable is missing', () => {
    const contact = makeContact();
    const brokenTemplate: Template = { ...TEMPLATE, body: 'Hi {{lastName}}!' };

    const viewModel = computeTodayViewModel([contact], [brokenTemplate], TODAY);

    expect(viewModel.previews).toEqual([
      { contact, message: '', error: 'Missing template variables: lastName' },
    ]);
  });

  it('excludes contacts that are not due today from the previews', () => {
    const dueContact = makeContact({ id: 'due', nextFollowUpDate: '2026-07-08' });
    const notDueContact = makeContact({ id: 'not-due', nextFollowUpDate: '2026-07-09' });

    const viewModel = computeTodayViewModel([dueContact, notDueContact], [TEMPLATE], TODAY);

    expect(viewModel.dueContacts).toEqual([dueContact]);
    expect(viewModel.previews.map((preview) => preview.contact.id)).toEqual(['due']);
  });
});
