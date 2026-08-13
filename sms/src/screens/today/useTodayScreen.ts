import { useCallback, useEffect, useState } from 'react';
import { buildNewContact } from '../../domain/buildNewContact';
import { ensureDefaultTemplate } from '../../domain/ensureDefaultTemplate';
import type { ContactsRepository, SendLogRepository, TemplatesRepository } from '../../repositories/types';
import { computeTodayViewModel } from './computeTodayViewModel';
import type { TodayViewModel } from './computeTodayViewModel';
import { runFollowUpsForToday } from './runFollowUps';
import type { FollowUpSendResult } from './runFollowUps';

export interface UseTodayScreenDeps {
  contactsRepository: ContactsRepository;
  templatesRepository: TemplatesRepository;
  sendLogRepository: SendLogRepository;
  sendSms: (phoneNumber: string, message: string) => Promise<void>;
  generateId: () => string;
  getToday: () => string;
  now: () => string;
  wait: (ms: number) => Promise<void>;
  staggerMs: number;
}

export interface UseTodayScreenState {
  isLoading: boolean;
  isSending: boolean;
  viewModel: TodayViewModel;
  results: FollowUpSendResult[] | null;
  runFollowUps: () => Promise<void>;
  addContact: (name: string, phone: string, consentGiven: boolean) => Promise<void>;
}

const EMPTY_VIEW_MODEL: TodayViewModel = {
  template: null,
  dueContacts: [],
  previews: [],
  emptyStateMessage: null,
};

export function useTodayScreen(deps: UseTodayScreenDeps): UseTodayScreenState {
  const {
    contactsRepository,
    templatesRepository,
    sendLogRepository,
    sendSms,
    generateId,
    getToday,
    now,
    wait,
    staggerMs,
  } = deps;

  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [viewModel, setViewModel] = useState<TodayViewModel>(EMPTY_VIEW_MODEL);
  const [results, setResults] = useState<FollowUpSendResult[] | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    await ensureDefaultTemplate(templatesRepository, generateId);
    const [contacts, templates] = await Promise.all([contactsRepository.getAll(), templatesRepository.getAll()]);
    setViewModel(computeTodayViewModel(contacts, templates, getToday()));
    setIsLoading(false);
  }, [contactsRepository, templatesRepository, generateId, getToday]);

  useEffect(() => {
    load();
  }, [load]);

  const addContact = useCallback(
    async (name: string, phone: string, consentGiven: boolean) => {
      await contactsRepository.insert(buildNewContact({ name, phone, consentGiven }, generateId, getToday()));
      await load();
    },
    [contactsRepository, generateId, getToday, load]
  );

  const runFollowUps = useCallback(async () => {
    if (!viewModel.template || viewModel.dueContacts.length === 0) {
      return;
    }

    setIsSending(true);
    const sendResults = await runFollowUpsForToday(viewModel.dueContacts, viewModel.template, {
      contactsRepository,
      sendLogRepository,
      sendSms,
      generateId,
      today: getToday(),
      now,
      wait,
      staggerMs,
    });
    setResults(sendResults);
    setIsSending(false);
    await load();
  }, [viewModel, contactsRepository, sendLogRepository, sendSms, generateId, getToday, now, wait, staggerMs, load]);

  return { isLoading, isSending, viewModel, results, runFollowUps, addContact };
}
