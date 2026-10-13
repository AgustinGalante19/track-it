import type { Category, Currency, Movement, Snapshot } from './domain';
import { addMonth } from './format';

export type CategorySummary = {
  category: Category | null; name: string; emoji: string;
  budget: number; current: number; previous: number; movements: Movement[];
};

export function summarizeCategories(data: Snapshot, month: string, currency: Currency): CategorySummary[] {
  const previousMonth = addMonth(`${month}-01`, -1).slice(0, 7);
  const rows: CategorySummary[] = data.categories.map((category) => ({
    category, name: category.name, emoji: category.emoji,
    budget: currency === 'ARS' ? category.budgetArs : category.budgetUsd,
    current: 0, previous: 0, movements: [],
  }));
  const byName = new Map(rows.map((row) => [row.name, row]));
  const unassigned: CategorySummary = { category: null, name: 'Sin categoría', emoji: '🏷️', budget: 0, current: 0, previous: 0, movements: [] };
  for (const movement of data.movements) {
    if (movement.voided || movement.currency !== currency || movement.expenseAmount <= 0) continue;
    const period = movement.date.slice(0, 7);
    if (period !== month && period !== previousMonth) continue;
    const row = byName.get(movement.category) || unassigned;
    if (period === month) { row.current += movement.expenseAmount; row.movements.push(movement); }
    else row.previous += movement.expenseAmount;
  }
  if (unassigned.current || unassigned.previous) rows.push(unassigned);
  return rows;
}
