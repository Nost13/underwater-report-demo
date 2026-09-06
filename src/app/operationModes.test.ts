import { it, expect } from 'vitest';
import { emptyReportInfo, deriveOperationValues } from './reportInfo';
it('clears stale automatic durations but preserves manual values', () => {
  const operation={...emptyReportInfo().operation, eta:'2026-09-01T01:36',etd:'',workWindow:'old'};
  expect(deriveOperationValues(operation,'etd').workWindow).toBe('');
  expect(deriveOperationValues(operation,'etd',{workWindow:'MANUAL'}).workWindow).toBe('old');
});
