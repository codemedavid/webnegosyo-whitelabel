import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTodayScreen } from './useTodayScreen';
import type { UseTodayScreenDeps } from './useTodayScreen';
import type { Contact, Template } from '../../domain/types';
import type { ContactsRepository, SendLogRepository, TemplatesRepository } from '../../repositories/types';

const TODAY = '2026-07-08';

const CONTACT: Contact = {
  id: 'contact-1',
  name: 'Jane Doe',
  phone: '+15555550100',
  lastContactDate: '2026-07-01',
  nextFollowUpDate: '2026-07-08',
  followUpIntervalDays: 7,
  status: 'pending',
  consentGiven: true,
};

const TEMPLATE: Template = {
  id: 'template-1',
  name: 'Follow-up',
  body: 'Hi {{firstName}}, just checking in!',
};

function makeContactsRepository(overrides: Partial<jest.Mocked<ContactsRepository>> = {}): jest.Mocked<ContactsRepository> {
  return {
    getAll: jest.fn().mockResolvedValue([CONTACT]),
    getById: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTemplatesRepository(overrides: Partial<jest.Mocked<TemplatesRepository>> = {}): jest.Mocked<TemplatesRepository> {
  return {
    getAll: jest.fn().mockResolvedValue([TEMPLATE]),
    getById: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<jest.Mocked<UseTodayScreenDeps>> = {}): jest.Mocked<UseTodayScreenDeps> {
  let idCounter = 0;
  return {
    contactsRepository: makeContactsRepository(),
    templatesRepository: makeTemplatesRepository(),
    sendLogRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getByContactId: jest.fn().mockResolvedValue([]),
      append: jest.fn().mockResolvedValue(undefined),
    },
    sendSms: jest.fn().mockResolvedValue(undefined),
    generateId: jest.fn(() => `log-${++idCounter}`),
    getToday: jest.fn(() => TODAY),
    now: jest.fn(() => '2026-07-08T10:00:00.000Z'),
    wait: jest.fn().mockResolvedValue(undefined),
    staggerMs: 1000,
    ...overrides,
  };
}

describe('useTodayScreen', () => {
  it('loads due contacts and a rendered preview on mount', async () => {
    const deps = makeDeps();

    const { result } = await renderHook(() => useTodayScreen(deps));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.viewModel.dueContacts).toEqual([CONTACT]);
    expect(result.current.viewModel.previews).toEqual([
      { contact: CONTACT, message: 'Hi Jane, just checking in!' },
    ]);
  });

  it('sends follow-ups and records the results when runFollowUps is called', async () => {
    const deps = makeDeps();
    const { result } = await renderHook(() => useTodayScreen(deps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.runFollowUps();
    });

    expect(deps.sendSms).toHaveBeenCalledWith('+15555550100', 'Hi Jane, just checking in!');
    expect(result.current.results).toEqual([
      { contactId: 'contact-1', status: 'sent', message: 'Hi Jane, just checking in!' },
    ]);
    expect(result.current.isSending).toBe(false);
  });

  it('does nothing when there is no template configured', async () => {
    const deps = makeDeps({ templatesRepository: makeTemplatesRepository({ getAll: jest.fn().mockResolvedValue([]) }) });
    const { result } = await renderHook(() => useTodayScreen(deps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.runFollowUps();
    });

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(result.current.results).toBeNull();
  });

  it('auto-creates a default template on load when none exist', async () => {
    const templatesRepository = makeTemplatesRepository({ getAll: jest.fn().mockResolvedValue([]) });
    const deps = makeDeps({ templatesRepository });

    await renderHook(() => useTodayScreen(deps));

    await waitFor(() => expect(templatesRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('{{firstName}}') })
    ));
  });

  it('inserts a new contact and reloads the view model when addContact is called', async () => {
    const contactsRepository = makeContactsRepository({ getAll: jest.fn().mockResolvedValue([]) });
    const deps = makeDeps({ contactsRepository, generateId: jest.fn(() => 'contact-new') });
    const { result } = await renderHook(() => useTodayScreen(deps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    contactsRepository.getAll.mockResolvedValue([
      {
        id: 'contact-new',
        name: 'New Person',
        phone: '+15555550199',
        lastContactDate: '2026-07-07',
        nextFollowUpDate: TODAY,
        followUpIntervalDays: 7,
        status: 'pending',
        consentGiven: true,
      },
    ]);

    await act(async () => {
      await result.current.addContact('New Person', '+15555550199', true);
    });

    expect(contactsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contact-new', name: 'New Person', phone: '+15555550199', consentGiven: true })
    );
    expect(result.current.viewModel.dueContacts).toHaveLength(1);
  });
});
