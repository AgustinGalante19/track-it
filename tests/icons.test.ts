import { expect, it } from 'vitest';
import { categoryIcon, recurringIcon, categoryIconSchema, recurringIconSchema } from '../shared/icons';
import { financeRecordSchemas } from '../shared/finance-sync';

it('uses explicit category icons before legacy emoji and name, with a safe missing-category fallback', () => {
  const category = { name: 'Comida', emoji: '☕' };
  expect(categoryIcon(category)).toBe('coffee');
  expect(categoryIcon({ ...category, iconKey: 'home' })).toBe('home');
  expect(categoryIcon({ name: 'Viajes', emoji: 'X' })).toBe('travel');
  expect(categoryIcon(null)).toBe('general');
  expect(categoryIcon({ ...category, iconKey: 'unknown' })).toBe('coffee');
});

it('honors explicit recurring choices and inheritance before known-brand detection', () => {
  const category = { name: 'Servicios', emoji: '💡', iconKey: 'water' };
  expect(recurringIcon({ name: 'Spotify Premium' }, category)).toBe('spotify');
  expect(recurringIcon({ name: 'Spotify Premium', iconKey: 'wifi' }, category)).toBe('wifi');
  expect(recurringIcon({ name: 'Spotify Premium', iconKey: 'category' }, category)).toBe('water');
  expect(recurringIcon({ name: 'Servicio personalizado' }, category)).toBe('water');
  expect(recurringIcon({ name: 'Servicio personalizado' })).toBe('general');
});

it('validates catalog keys and accepts legacy sync records without an icon', () => {
  expect(categoryIconSchema.safeParse('spotify').success).toBe(false);
  expect(recurringIconSchema.safeParse('category').success).toBe(true);
  expect(recurringIconSchema.safeParse('<svg/>').success).toBe(false);
  const category = { id: 'category', name: 'Hogar', emoji: '🏠', budgetArs: 0, budgetUsd: 0, version: 1 };
  expect(financeRecordSchemas.categories.parse(category)).toEqual(category);
  expect(financeRecordSchemas.categories.parse({ ...category, iconKey: 'coffee' }).iconKey).toBe('coffee');
  expect(financeRecordSchemas.categories.safeParse({ ...category, iconKey: 'unknown' }).success).toBe(false);
});
