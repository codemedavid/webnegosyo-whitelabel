import { buildNewContact, InvalidPhoneNumberError } from './buildNewContact';

const TODAY = '2026-07-08';

describe('buildNewContact', () => {
  it('builds a pending contact that is due today', () => {
    const generateId = jest.fn(() => 'contact-1');

    const contact = buildNewContact({ name: 'Jane Doe', phone: '+15555550100', consentGiven: true }, generateId, TODAY);

    expect(contact).toEqual({
      id: 'contact-1',
      name: 'Jane Doe',
      phone: '+15555550100',
      lastContactDate: '2026-07-07',
      nextFollowUpDate: '2026-07-08',
      followUpIntervalDays: 7,
      status: 'pending',
      consentGiven: true,
    });
  });

  it('preserves consentGiven when false', () => {
    const generateId = jest.fn(() => 'contact-2');

    const contact = buildNewContact({ name: 'John', phone: '+15555550101', consentGiven: false }, generateId, TODAY);

    expect(contact.consentGiven).toBe(false);
  });

  it('normalizes a formatted phone number to E.164', () => {
    const generateId = jest.fn(() => 'contact-3');

    const contact = buildNewContact({ name: 'Amy', phone: '(555) 555-0102', consentGiven: true }, generateId, TODAY);

    expect(contact.phone).toBe('+15555550102');
  });

  it('throws InvalidPhoneNumberError when the phone number cannot be normalized', () => {
    const generateId = jest.fn(() => 'contact-4');

    expect(() => buildNewContact({ name: 'Bad Phone', phone: '09668820122', consentGiven: true }, generateId, TODAY)).toThrow(
      InvalidPhoneNumberError
    );
  });
});
