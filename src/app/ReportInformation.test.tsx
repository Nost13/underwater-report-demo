import { render, screen, within } from '@testing-library/react';
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

  it('recalculates derived operation values while keeping them editable', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('ETA'), '2026-09-01T01:36');
    await user.type(screen.getByLabelText('ETD'), '2026-09-01T18:00');
    expect(screen.getByLabelText('Work Window')).toHaveValue('16 Hours + 1 Hrs');

    await user.clear(screen.getByLabelText('Work Window'));
    await user.type(screen.getByLabelText('Work Window'), 'CUSTOM WINDOW');
    expect(screen.getByLabelText('Work Window')).toHaveValue('CUSTOM WINDOW');

    await user.type(screen.getByLabelText('Start'), '2026-09-01T03:00');
    await user.type(screen.getByLabelText('End'), '2026-09-01T07:30');
    expect(screen.getByLabelText('Working Time')).toHaveValue('4 Hrs 30 Min');
  });

  it('searches the company-neutral diver database and selects personnel for Section 8', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Diver search'), 'Kim-Dongu');
    const result = screen.getByRole('button', { name: '김동우 선택' });
    expect(result).toHaveTextContent('Kim Dongu');
    expect(result).toHaveTextContent('22402130572M');
    expect(screen.queryByText('19961205')).not.toBeInTheDocument();
    await user.click(result);

    const selected = screen.getByRole('table', { name: '선택한 자격 인원' });
    expect(within(selected).getByText('Kim Dongu')).toBeVisible();
    expect(within(selected).getByText('Technician Diver')).toBeVisible();
    expect(screen.getByLabelText('Personnel Deployed')).toHaveValue('DIVER : 1');

    await user.click(within(selected).getByRole('button', { name: '김동우 제외' }));
    expect(screen.queryByRole('table', { name: '선택한 자격 인원' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Personnel Deployed')).toHaveValue('');
  });
});
