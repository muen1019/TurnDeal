import type { ProductPreference } from './data-tools.ts';
import { assertContract } from './contract.ts';
export function validatePreferences(preferences: ProductPreference[]) {
  if (!Array.isArray(preferences)) throw new Error('invalid_argument: product_preferences');
  const ids = new Set<string>();
  for (const p of preferences) {
    assertContract('ProductPreference', p);
    if (ids.has(p.preference_id)) throw new Error('duplicate_preference_id');
    ids.add(p.preference_id);
    if (p.operator === 'range' && (p.min === null && p.max === null || p.min !== null && p.max !== null && p.min > p.max))
      throw new Error('invalid_preference_range');
  }
}
export function matchesPreference(attributes: Record<string, unknown>, p: ProductPreference) {
  const value = attributes[p.attribute];
  // Missing data never proves a negative preference or a hard range is satisfied.
  if (p.operator === 'range') return typeof value === 'number' && Number.isFinite(value) &&
    (p.min === null || value >= p.min) && (p.max === null || value <= p.max);
  return typeof value === 'string' && (p.operator === 'in' ? p.values.includes(value) : !p.values.includes(value));
}
