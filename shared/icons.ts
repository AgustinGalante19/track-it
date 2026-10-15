import { z } from 'zod';

export const categoryIconKeys = ['shopping', 'food', 'coffee', 'transport', 'health', 'home', 'technology', 'entertainment', 'gaming', 'education', 'travel', 'pets', 'general', 'wifi', 'electricity', 'water'] as const;
export const brandIconKeys = ['youtube', 'spotify', 'netflix', 'twitch', 'discord'] as const;
export const categoryIconSchema = z.enum(categoryIconKeys).nullable().optional();
export const recurringIconSchema = z.enum([...categoryIconKeys, ...brandIconKeys, 'category']).nullable().optional();
export type IconKey = NonNullable<z.infer<typeof recurringIconSchema>>;
export const normalizeIconName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function categoryIcon(category?: { iconKey?: string | null; emoji: string; name: string } | null): IconKey {
  if (!category) return 'general';
  if (categoryIconKeys.some((key) => key === category.iconKey)) return category.iconKey as IconKey;
  const emojiMap: Record<string, IconKey> = { '🛒': 'shopping', '🛍️': 'shopping', '🍜': 'food', '🍔': 'food', '☕': 'coffee', '🚌': 'transport', '🚗': 'transport', '💊': 'health', '🏠': 'home', '⌨️': 'technology', '💻': 'technology', '🎬': 'entertainment', '🎮': 'entertainment', '📚': 'education', '✈️': 'travel', '🏖️': 'travel', '🐾': 'pets', '📶': 'wifi', '💡': 'electricity', '💧': 'water' };
  if (emojiMap[category.emoji]) return emojiMap[category.emoji];
  const name = normalizeIconName(category.name);
  return ([['aliment', 'shopping'], ['comida', 'food'], ['cafe', 'coffee'], ['transporte', 'transport'], ['salud', 'health'], ['hogar', 'home'], ['tecnolog', 'technology'], ['entretenimiento', 'entertainment'], ['educacion', 'education'], ['viaje', 'travel'], ['mascota', 'pets'], ['internet', 'wifi'], ['servicio', 'electricity']] as const).find(([term]) => name.includes(term))?.[1] ?? 'general';
}

export function recurringIcon(rule: { iconKey?: string | null; name: string }, category?: Parameters<typeof categoryIcon>[0]): IconKey {
  const choice = recurringIconChoice(rule);
  return choice === 'category' ? categoryIcon(category) : choice;
}

export function recurringIconChoice(rule: { iconKey?: string | null; name: string }): IconKey {
  if (rule.iconKey && recurringIconSchema.safeParse(rule.iconKey).success) return rule.iconKey as IconKey;
  const name = normalizeIconName(rule.name);
  return quickServices.find((service) => service.aliases.some((alias) => name.includes(alias)))?.iconKey ?? 'category';
}

export const quickServices = [
  { name: 'YouTube Premium', iconKey: 'youtube', kind: 'subscription', category: 'Entretenimiento', aliases: ['youtube'] },
  { name: 'Spotify', iconKey: 'spotify', kind: 'subscription', category: 'Entretenimiento', aliases: ['spotify'] },
  { name: 'Netflix', iconKey: 'netflix', kind: 'subscription', category: 'Entretenimiento', aliases: ['netflix'] },
  { name: 'Disney+', iconKey: 'entertainment', kind: 'subscription', category: 'Entretenimiento', aliases: ['disney'] },
  { name: 'Prime Video', iconKey: 'entertainment', kind: 'subscription', category: 'Entretenimiento', aliases: ['prime video', 'amazon prime'] },
  { name: 'Internet', iconKey: 'wifi', kind: 'service', category: 'Servicios', aliases: ['internet'] },
] as const;
export type QuickService = typeof quickServices[number];
