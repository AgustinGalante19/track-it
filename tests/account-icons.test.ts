// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { accountBrand } from '../src/lib/account-brand';
import { AccountIcon } from '../src/components/AccountIcon';

afterEach(cleanup);

it.each([
  ['Galicia USD', 'banco-galicia'], ['Mercado Pago', 'mercadopago'], ['MercadoPago ARS', 'mercadopago'],
  ['Ualá', 'uala'], ['Naranja X', 'naranja-x'], ['Brubank', 'brubank'], ['BBVA Visa', 'banco-bbva'],
  ['Banco de la Nación Argentina', 'banco-nacion'], ['Cuenta DNI', 'cuenta-dni'],
  ['Banco Provincia de Neuquén', 'bpn'], ['Banco Provincia', 'banco-provincia'], ['Banco de Córdoba', 'bancor'],
  ['Mi banco', null], ['Galiciano', null], ['Comodoro', null],
])('matches local bank aliases: %s', (name, expected) => {
  expect(accountBrand(name, 'bank')).toBe(expected);
});

it('uses generic cash and unknown-account icons; falls back when a logo fails', () => {
  expect(accountBrand('Galicia', 'cash')).toBeNull();
  const view = render(createElement(AccountIcon, { account: { name: 'Galicia', type: 'bank' } }));
  const img = view.container.querySelector('img')!;
  expect(img.getAttribute('src')).toBeTruthy();
  fireEvent.error(img);
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.querySelector('svg')).toBeTruthy();
  view.rerender(createElement(AccountIcon, { account: { name: 'Brubank', type: 'bank' } }));
  expect(view.container.querySelector('img')).toBeTruthy();
  view.rerender(createElement(AccountIcon, { account: { name: 'Mi cuenta', type: 'wallet' } }));
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.querySelector('svg')).toBeTruthy();
});
