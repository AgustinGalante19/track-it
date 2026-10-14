// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdatePrompt } from '../src/components/UpdatePrompt';
import { holdUpdate, setUpdateBlocked } from '../src/lib/update-safety';
import { trackDialog } from '../src/lib/interaction-state';

const { update, dismiss } = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn() }));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [true, dismiss], updateServiceWorker: update }) }));
afterEach(() => { cleanup(); setUpdateBlocked(false); update.mockClear(); dismiss.mockClear(); });
it('keeps the update pending until the mutation and the last open dialog finish', async () => {
  setUpdateBlocked(true);
  const closeDialog = trackDialog();
  render(createElement(UpdatePrompt));
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar app' }));
  expect(update).not.toHaveBeenCalled();
  act(() => setUpdateBlocked(false));
  expect(update).not.toHaveBeenCalled();
  act(closeDialog);
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(true));
});
it('postponing cancels deferred activation and preserves the current page', async () => {
  const release = holdUpdate();
  render(createElement(UpdatePrompt));
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar app' }));
  fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
  act(release);
  expect(update).not.toHaveBeenCalled();
  expect(dismiss).toHaveBeenCalledWith(false);
});
