import { fireEvent, render, screen, within } from '@testing-library/react';
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
    await user.type(screen.getByLabelText('End'), '2026-09-01T03:49');
    expect(screen.getByLabelText('Working Time')).toHaveValue('0 Hrs 49 Min');
  });

  it('structures the schedule and operation rows with date-time inputs', () => {
    render(<Harness />);

    const schedule = screen.getByRole('group', { name: 'VESSEL SCHEDULE' });
    const record = screen.getByRole('group', { name: 'OPERATION RECORD' });
    for (const label of ['ETA', 'ETD', 'Work Window', 'Location']) {
      expect(within(schedule).getByLabelText(label)).toBeVisible();
    }
    for (const label of ['Start', 'End', 'Working Time', 'Position']) {
      expect(within(record).getByLabelText(label)).toBeVisible();
    }
    for (const label of ['ETA', 'ETD', 'Start', 'End']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'datetime-local');
    }
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

  it('selects the first visible diver with Enter without submitting or adding a newline', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = screen.getByLabelText('Diver search');
    await user.type(search, 'kim');
    expect(fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' })).toBe(false);

    expect(screen.getByRole('table', { name: '선택한 자격 인원' })).toHaveTextContent('Kim Dongu');
    expect(search).toHaveValue('');
    expect(screen.getByLabelText('Personnel Deployed')).toHaveValue('DIVER : 1');
  });

  it('leaves diver search unchanged when Enter has no visible result', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = screen.getByLabelText('Diver search');
    await user.type(search, 'not-a-diver');
    expect(fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' })).toBe(false);

    expect(search).toHaveValue('not-a-diver');
    expect(screen.queryByRole('table', { name: '선택한 자격 인원' })).not.toBeInTheDocument();
  });

  it.each([
    ['Toolbox', 'Toolbox Note'],
    ['Preparation', 'Preparation Note'],
  ] as const)('keeps exactly two %s photo slots that support upload, replace, and clear', async (section, noteLabel) => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    render(<Harness />);

    const note = screen.getByLabelText(noteLabel);
    const originalNote = note.getAttribute('value');
    const photos = screen.getByRole('group', { name: `${section} photos` });
    expect(within(photos).getAllByRole('group', { name: new RegExp(`${section} photo slot`) })).toHaveLength(2);

    await user.upload(within(photos).getByLabelText(`Upload ${section} photos`), [
      new File(['one'], `${section.toLowerCase()}-one.jpg`, { type: 'image/jpeg' }),
      new File(['two'], `${section.toLowerCase()}-two.jpg`, { type: 'image/jpeg' }),
      new File(['three'], `${section.toLowerCase()}-three.jpg`, { type: 'image/jpeg' }),
    ]);
    expect(within(photos).getByRole('img', { name: `${section} photo 1: ${section.toLowerCase()}-one.jpg` })).toBeVisible();
    expect(within(photos).getByRole('img', { name: `${section} photo 2: ${section.toLowerCase()}-two.jpg` })).toBeVisible();
    expect(within(photos).queryByText(`${section.toLowerCase()}-three.jpg`)).not.toBeInTheDocument();

    await user.upload(within(photos).getByLabelText(`Replace ${section} photo 1`),
      new File(['replacement'], `${section.toLowerCase()}-replacement.jpg`, { type: 'image/jpeg' }));
    expect(within(photos).getByRole('img', { name: `${section} photo 1: ${section.toLowerCase()}-replacement.jpg` })).toBeVisible();
    expect(within(photos).getByRole('img', { name: `${section} photo 2: ${section.toLowerCase()}-two.jpg` })).toBeVisible();

    await user.click(within(photos).getByRole('button', { name: `Clear ${section} photo 2` }));
    expect(within(photos).getByText(`${section} photo 2 is empty`)).toBeVisible();
    expect(note).toHaveValue(originalNote);
  });
});
