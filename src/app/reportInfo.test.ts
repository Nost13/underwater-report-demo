import { describe, expect, it } from 'vitest';
import { DEMO_VESSELS } from './demoData';
import { emptyReportInfo, reportInfoForScopes, reportInfoFromVessel } from './reportInfo';

describe('report information', () => {
  it('prefills Word fields from the selected IMO record', () => {
    expect(reportInfoFromVessel(DEMO_VESSELS[0]).vessel).toMatchObject({
      name: 'M.V. PACIFIC AURORA',
      imo: '9876543',
      type: 'Bulk Carrier',
    });
  });

  it('keeps one Word service row for each selected service in order', () => {
    expect(reportInfoForScopes(emptyReportInfo(), ['INSPECTION', 'POLISHING']).serviceItems)
      .toEqual(['Inspection', 'Polishing']);
  });
});
