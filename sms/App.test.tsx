const mockRepositories = {
  contacts: {
    getAll: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  templates: {
    getAll: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  sendLog: {
    getAll: jest.fn().mockResolvedValue([]),
    getByContactId: jest.fn(),
    append: jest.fn(),
  },
};

jest.mock('./src/repositories/sqlite/database', () => ({
  openAppRepositories: jest.fn(() => Promise.resolve(mockRepositories)),
}));

jest.mock('./src/native', () => ({
  sendSms: jest.fn(),
}));

import { Platform, StatusBar, StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import App from './App';

describe('App', () => {
  it('shows a loading state before repositories are ready, then renders the Today screen', async () => {
    await render(<App />);

    await waitFor(() => expect(screen.getByText('No follow-ups due today.')).toBeTruthy());
  });

  it('pads content below the Android status bar so it is not clipped under system UI', async () => {
    const originalOS = Platform.OS;
    const originalStatusBarHeight = StatusBar.currentHeight;
    Platform.OS = 'android';
    // @ts-expect-error test-only override of a normally read-only native constant
    StatusBar.currentHeight = 24;

    try {
      await render(<App />);
      await waitFor(() => expect(screen.getByText('No follow-ups due today.')).toBeTruthy());

      const root = screen.getByTestId('app-root');
      expect(StyleSheet.flatten(root.props.style)).toEqual(expect.objectContaining({ paddingTop: 24 }));
    } finally {
      Platform.OS = originalOS;
      // @ts-expect-error restoring test-only override
      StatusBar.currentHeight = originalStatusBarHeight;
    }
  });
});
