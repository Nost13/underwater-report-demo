export type BerthingSide = '' | 'PORT SIDE' | 'STBD SIDE';

const PORT_VALUES = new Set(['P', 'PORT', 'PORT SIDE']);
const STARBOARD_VALUES = new Set(['S', 'STBD', 'STARBOARD', 'STBD SIDE', 'STARBOARD SIDE']);

export function formatBerthingSide(value: unknown): BerthingSide {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (PORT_VALUES.has(normalized)) return 'PORT SIDE';
  if (STARBOARD_VALUES.has(normalized)) return 'STBD SIDE';
  return '';
}
