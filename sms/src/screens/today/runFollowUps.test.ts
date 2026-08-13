import { runFollowUpsForToday } from './runFollowUps';
import type { RunFollowUpsDeps } from './runFollowUps';
import type { Contact, Template } from '../../domain/types';
import type { ContactsRepository, SendLogRepository } from '../../repositories/types';

const TODAY = '2026-07-08';

const TEMPLATE: Template = {
  id: 'template-1',
  name: 'Follow-up',
  body: 'Hi {{firstName}}, just checking in!',
};

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

function makeDeps(overrides: Partial<jest.Mocked<RunFollowUpsDeps>> = {}): jest.Mocked<RunFollowUpsDeps> {
  let idCounter = 0;
  return {
    contactsRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<ContactsRepository>,
    sendLogRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getByContactId: jest.fn().mockResolvedValue([]),
      append: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<SendLogRepository>,
    sendSms: jest.fn().mockResolvedValue(undefined),
    generateId: jest.fn(() => `log-${++idCounter}`),
    today: TODAY,
    now: jest.fn(() => '2026-07-08T10:00:00.000Z'),
    wait: jest.fn().mockResolvedValue(undefined),
    staggerMs: 1000,
    ...overrides,
  };
}

describe('runFollowUpsForToday', () => {
  it('sends the rendered message and updates the contact for a follow-up date on success', async () => {
    const contact = makeContact();
    const deps = makeDeps();

    const results = await runFollowUpsForToday([contact], TEMPLATE, deps);

    expect(deps.sendSms).toHaveBeenCalledWith('+15555550100', 'Hi Jane, just checking in!');
    expect(deps.contactsRepository.update).toHaveBeenCalledWith({
      ...contact,
      lastContactDate: TODAY,
      nextFollowUpDate: '2026-07-15',
    });
    expect(deps.sendLogRepository.append).toHaveBeenCalledWith({
      id: 'log-1',
      contactId: contact.id,
      sentAt: '2026-07-08T10:00:00.000Z',
      messageBody: 'Hi Jane, just checking in!',
      result: 'sent',
    });
    expect(results).toEqual([{ contactId: contact.id, status: 'sent', message: 'Hi Jane, just checking in!' }]);
  });

  it('skips a contact without consent, never sending or updating it', async () => {
    const contact = makeContact({ consentGiven: false });
    const deps = makeDeps();

    const results = await runFollowUpsForToday([contact], TEMPLATE, deps);

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(deps.contactsRepository.update).not.toHaveBeenCalled();
    expect(deps.sendLogRepository.append).not.toHaveBeenCalled();
    expect(results).toEqual([
      { contactId: contact.id, status: 'skipped', errorMessage: 'Contact has not given consent' },
    ]);
  });

  it('logs a failure and does not send or update the contact when the template is missing a variable', async () => {
    const contact = makeContact();
    const brokenTemplate: Template = { ...TEMPLATE, body: 'Hi {{lastName}}!' };
    const deps = makeDeps();

    const results = await runFollowUpsForToday([contact], brokenTemplate, deps);

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(deps.contactsRepository.update).not.toHaveBeenCalled();
    expect(deps.sendLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: contact.id, result: 'failed' })
    );
    expect(results).toEqual([
      { contactId: contact.id, status: 'failed', errorMessage: 'Missing template variables: lastName' },
    ]);
  });

  it('logs a failure and does not update the contact when the native send rejects', async () => {
    const contact = makeContact();
    const deps = makeDeps({ sendSms: jest.fn().mockRejectedValue(new Error('SMS permission was denied')) });

    const results = await runFollowUpsForToday([contact], TEMPLATE, deps);

    expect(deps.contactsRepository.update).not.toHaveBeenCalled();
    expect(deps.sendLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: contact.id, result: 'failed', errorMessage: 'SMS permission was denied' })
    );
    expect(results).toEqual([
      { contactId: contact.id, status: 'failed', errorMessage: 'SMS permission was denied' },
    ]);
  });

  it('falls back to a generic error message when the native send rejects with a non-Error value', async () => {
    const contact = makeContact();
    const deps = makeDeps({ sendSms: jest.fn().mockRejectedValue('native module crashed') });

    const results = await runFollowUpsForToday([contact], TEMPLATE, deps);

    expect(results).toEqual([{ contactId: contact.id, status: 'failed', errorMessage: 'Unknown error' }]);
  });

  it('processes remaining contacts even when an earlier contact fails to send', async () => {
    const contactA = makeContact({ id: 'contact-a', phone: '+15555550100' });
    const contactB = makeContact({ id: 'contact-b', phone: '+15555550200', name: 'John Roe' });
    const sendSms = jest
      .fn()
      .mockRejectedValueOnce(new Error('carrier rejected message'))
      .mockResolvedValueOnce(undefined);
    const deps = makeDeps({ sendSms });

    const results = await runFollowUpsForToday([contactA, contactB], TEMPLATE, deps);

    expect(results).toEqual([
      { contactId: 'contact-a', status: 'failed', errorMessage: 'carrier rejected message' },
      { contactId: 'contact-b', status: 'sent', message: 'Hi John, just checking in!' },
    ]);
  });

  it('staggers sends by waiting between contacts but not before the first one', async () => {
    const contactA = makeContact({ id: 'contact-a' });
    const contactB = makeContact({ id: 'contact-b' });
    const contactC = makeContact({ id: 'contact-c' });
    const deps = makeDeps();

    await runFollowUpsForToday([contactA, contactB, contactC], TEMPLATE, deps);

    expect(deps.wait).toHaveBeenCalledTimes(2);
    expect(deps.wait).toHaveBeenCalledWith(1000);
  });

  it('returns an empty result list when there are no contacts to process', async () => {
    const deps = makeDeps();

    const results = await runFollowUpsForToday([], TEMPLATE, deps);

    expect(results).toEqual([]);
    expect(deps.sendSms).not.toHaveBeenCalled();
  });
});
