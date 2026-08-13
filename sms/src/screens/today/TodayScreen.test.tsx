import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TodayScreen } from './TodayScreen';
import type { UseTodayScreenDeps } from './useTodayScreen';
import type { Contact, Template } from '../../domain/types';
import type { ContactsRepository, TemplatesRepository } from '../../repositories/types';

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

describe('TodayScreen', () => {
  it('shows the empty state when no follow-ups are due today', async () => {
    const deps = makeDeps({ contactsRepository: makeContactsRepository({ getAll: jest.fn().mockResolvedValue([]) }) });

    await render(<TodayScreen deps={deps} />);

    await waitFor(() => expect(screen.getByText('No follow-ups due today.')).toBeTruthy());
  });

  it('shows the due contact and its rendered message preview', async () => {
    const deps = makeDeps();

    await render(<TodayScreen deps={deps} />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect(screen.getByText('Hi Jane, just checking in!')).toBeTruthy();
  });

  it('shows a preview error instead of a message when the template is missing a variable', async () => {
    const deps = makeDeps({
      templatesRepository: makeTemplatesRepository({
        getAll: jest.fn().mockResolvedValue([{ ...TEMPLATE, body: 'Hi {{lastName}}!' }]),
      }),
    });

    await render(<TodayScreen deps={deps} />);

    await waitFor(() =>
      expect(screen.getByText('Error: Missing template variables: lastName')).toBeTruthy()
    );
  });

  it('sends follow-ups when the Run Follow-ups button is pressed', async () => {
    const deps = makeDeps();
    await render(<TodayScreen deps={deps} />);
    await waitFor(() => expect(screen.getByText('Run Follow-ups')).toBeTruthy());

    fireEvent.press(screen.getByText('Run Follow-ups'));

    await waitFor(() => expect(screen.getByText('Sent 1 of 1')).toBeTruthy());
    expect(deps.sendSms).toHaveBeenCalledWith('+15555550100', 'Hi Jane, just checking in!');
  });

  it('shows why a follow-up failed to send after running follow-ups', async () => {
    const deps = makeDeps({ sendSms: jest.fn().mockRejectedValue(new Error('No SIM card available')) });
    await render(<TodayScreen deps={deps} />);
    await waitFor(() => expect(screen.getByText('Run Follow-ups')).toBeTruthy());

    fireEvent.press(screen.getByText('Run Follow-ups'));

    await waitFor(() => expect(screen.getByText('Sent 0 of 1')).toBeTruthy());
    expect(screen.getByText('Failed: No SIM card available')).toBeTruthy();
  });

  it('shows why a follow-up was skipped after running follow-ups', async () => {
    const deps = makeDeps({
      contactsRepository: makeContactsRepository({
        getAll: jest.fn().mockResolvedValue([{ ...CONTACT, consentGiven: false }]),
      }),
    });
    await render(<TodayScreen deps={deps} />);
    await waitFor(() => expect(screen.getByText('Run Follow-ups')).toBeTruthy());

    fireEvent.press(screen.getByText('Run Follow-ups'));

    await waitFor(() => expect(screen.getByText('Sent 0 of 1')).toBeTruthy());
    expect(screen.getByText('Skipped: Contact has not given consent')).toBeTruthy();
  });

  it('lets the user add a new contact from the empty state', async () => {
    const contactsRepository = makeContactsRepository({ getAll: jest.fn().mockResolvedValue([]) });
    const deps = makeDeps({ contactsRepository, generateId: jest.fn(() => 'contact-new') });
    await render(<TodayScreen deps={deps} />);
    await waitFor(() => expect(screen.getByText('No follow-ups due today.')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Contact name'), 'New Person');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('New Person'));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '+15555550199');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('+15555550199'));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() =>
      expect(contactsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'contact-new', name: 'New Person', phone: '+15555550199' })
      )
    );
  });
});
