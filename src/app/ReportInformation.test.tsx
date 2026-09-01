import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { emptyReportInfo, type ReportInfo } from './reportInfo';
import { ReportInformation } from './ReportInformation';

function Harness() {
  const [value, setValue] = useState<ReportInfo>(() => emptyReportInfo());
  return <ReportInformation value={value} onChange={setValue} onBack={vi.fn()} onNext={vi.fn()} />;
}

describe('Report Information', () => {
  it('shows every Section 1–4 operational and readiness input', () => {
    render(<Harness />);

    expect(screen.getByRole('heading', { name: 'Report Information' })).toBeVisible();
    for (const label of [
      'ETA', 'ETD', 'Work Window', 'Location', 'Start', 'End', 'Working Time', 'Position',
      'Draught FWD', 'Draught MID', 'Draught AFT', 'Berthing Side', 'Weather', 'Knots',
      'Current', 'Visibility', 'Personnel Deployed', 'Toolbox / LOTO Time', 'Toolbox Note',
      'Preparation Time', 'Preparation Note',
    ]) expect(screen.getByLabelText(label)).toBeVisible();
  });

  it('updates nested report information without changing entered capitalization', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Work Window'), '24 HOURS');
    await user.type(screen.getByLabelText('Position'), 'PORT SIDE');

    expect(screen.getByLabelText('Work Window')).toHaveValue('24 HOURS');
    expect(screen.getByLabelText('Position')).toHaveValue('PORT SIDE');
  });
});
