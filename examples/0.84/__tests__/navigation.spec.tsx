import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { App } from '../App';
import { runtimeChecks } from '../src/utils/runtimeChecks';

test('pressing "Get Started" navigates to the details screen', async () => {
  render(<App />);

  // Home screen is shown initially with the "Get Started" button.
  expect(screen.getByText('Get Started')).toBeTruthy();

  fireEvent.press(screen.getByText('Get Started'));

  // After navigation, the details screen renders its title.
  expect(await screen.findByText('Test cases')).toBeTruthy();
});

test('running the test suites reports all runtime checks as passed', async () => {
  render(<App />);

  fireEvent.press(screen.getByText('Get Started'));
  expect(await screen.findByText('Test cases')).toBeTruthy();

  fireEvent.press(screen.getByText('Open Test Suites'));
  expect(await screen.findByText('Runtime checks')).toBeTruthy();

  fireEvent.press(screen.getByText('Run all checks'));

  expect(
    await screen.findByText(`${runtimeChecks.length}/${runtimeChecks.length} checks passed`),
  ).toBeTruthy();
});
