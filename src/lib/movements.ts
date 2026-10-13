import type { Movement } from '../../shared/domain';

export function movementTitle(movement: Movement) {
  return movement.concept.trim() || 'Gasto sin concepto';
}
