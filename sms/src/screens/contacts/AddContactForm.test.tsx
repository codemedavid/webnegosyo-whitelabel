import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AddContactForm } from './AddContactForm';

describe('AddContactForm', () => {
  it('submits the trimmed name, phone, and consent value, then clears the inputs', async () => {
    const onSubmit = jest.fn();
    await render(<AddContactForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Contact name'), '  Jane Doe  ');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('  Jane Doe  '));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '  +15555550100  ');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('  +15555550100  '));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Jane Doe', '+15555550100', true));
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe(''));
    expect(screen.getByLabelText('Contact phone number').props.value).toBe('');
  });

  it('does not submit when name or phone is blank', async () => {
    const onSubmit = jest.fn();
    await render(<AddContactForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Contact name'), '   ');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('   '));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '+15555550100');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('+15555550100'));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits consentGiven as false when the consent switch is toggled off', async () => {
    const onSubmit = jest.fn();
    await render(<AddContactForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Contact name'), 'Jane Doe');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('Jane Doe'));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '+15555550100');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('+15555550100'));
    fireEvent(screen.getByLabelText('Consent given'), 'valueChange', false);
    await waitFor(() => expect(screen.getByLabelText('Consent given').props.value).toBe(false));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Jane Doe', '+15555550100', false));
  });

  it('submits the phone number normalized to E.164 format', async () => {
    const onSubmit = jest.fn();
    await render(<AddContactForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Contact name'), 'Jane Doe');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('Jane Doe'));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '(555) 555-0100');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('(555) 555-0100'));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Jane Doe', '+15555550100', true));
  });

  it('shows a validation error and does not submit when the phone number cannot be normalized', async () => {
    const onSubmit = jest.fn();
    await render(<AddContactForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Contact name'), 'Jane Doe');
    await waitFor(() => expect(screen.getByLabelText('Contact name').props.value).toBe('Jane Doe'));
    fireEvent.changeText(screen.getByLabelText('Contact phone number'), '09668820122');
    await waitFor(() => expect(screen.getByLabelText('Contact phone number').props.value).toBe('09668820122'));
    fireEvent.press(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() =>
      expect(screen.getByText('Enter a valid phone number, e.g. +15555550100.')).toBeTruthy()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
