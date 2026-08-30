import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportSection } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { VesselDiagramEditor } from './VesselDiagramEditor';

const generalSection = (component: string): ReportSection => ({
  id: `general-${component}`,
  targetId: `general-${component}`,
  area: 'GENERAL',
  component,
  service: 'INSPECTION',
  phases: ['CURRENT'],
  conditions: {},
});

const nicheSection = (component: string): ReportSection => ({
  id: `niche-${component}`,
  targetId: `niche-${component}`,
  area: 'NICHE',
  component,
  service: 'INSPECTION',
  phases: ['CURRENT'],
  conditions: {},
});

function Harness({ sections, onNext = vi.fn() }: { sections: ReportSection[]; onNext?: () => void }) {
  const [value, setValue] = useState<VesselDiagramConfig | null>(null);
  return <VesselDiagramEditor
    sections={sections}
    value={value}
    onChange={setValue}
    onBack={vi.fn()}
    onNext={onNext}
  />;
}

async function uploadVessel(user: ReturnType<typeof userEvent.setup>) {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 320, close: vi.fn() })));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vessel');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  await user.upload(screen.getByLabelText('선박 사이드뷰 이미지'),
    new File(['png'], 'vessel.png', { type: 'image/png' }));
}

describe('VesselDiagramEditor', () => {
  it('unlocks the Hull-first workflow only after decoding an accepted image', async () => {
    const user = userEvent.setup();
    render(<Harness sections={[generalSection('FWD'), nicheSection('TRANSDUCER')]} />);

    await uploadVessel(user);

    expect(screen.getByRole('heading', { name: 'Hull 맞추기' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Niche 맞추기로 이동' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Niche 맞추기' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    expect(screen.getByRole('heading', { name: 'Niche 맞추기' })).toBeVisible();
    expect(screen.getAllByLabelText('Transducer 표식')).toHaveLength(2);
  });

  it('keeps the existing draft when an image cannot be decoded', async () => {
    const user = userEvent.setup();
    const decode = vi.fn()
      .mockResolvedValueOnce({ width: 1200, height: 320, close: vi.fn() })
      .mockRejectedValueOnce(new Error('bad image'));
    vi.stubGlobal('createImageBitmap', decode);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vessel');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    render(<Harness sections={[generalSection('FWD')]} />);

    await user.upload(screen.getByLabelText('선박 사이드뷰 이미지'),
      new File(['ok'], 'vessel.png', { type: 'image/png' }));
    await user.upload(screen.getByLabelText('선박 사이드뷰 이미지'),
      new File(['bad'], 'vessel.jpg', { type: 'image/jpeg' }));

    expect(screen.getByText('PNG 또는 JPG 선박 이미지를 확인할 수 없습니다.')).toBeVisible();
    expect(screen.getByText('vessel.png')).toBeVisible();
  });

  it('moves a marker by pointer and canonical-pixel keyboard deltas', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[generalSection('AFT')]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);

    const marker = screen.getByLabelText('AFT Hull 표식');
    const initialX = changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x ?? 0;
    fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 120, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(marker, { pointerId: 1 });
    const afterDrag = changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect;
    expect(afterDrag?.x).toBeGreaterThan(initialX);

    marker.focus();
    fireEvent.keyDown(marker, { key: 'ArrowRight' });
    expect(changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x)
      .toBeCloseTo((afterDrag?.x ?? 0) + 1 / 2048, 8);
    fireEvent.keyDown(marker, { key: 'ArrowDown', shiftKey: true });
    expect(changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.y)
      .toBeCloseTo((afterDrag?.y ?? 0) + 10 / 488, 8);
  });

  it('resizes a marker from its corner handle without moving its opposite corner', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[generalSection('AFT')]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);

    const before = changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect;
    const handle = screen.getByLabelText('AFT Hull se 크기 조절');
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 110, pointerId: 2 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    const after = changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect;

    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
    expect(after?.width).toBeGreaterThan(before?.width ?? 0);
    expect(after?.height).toBeGreaterThan(before?.height ?? 0);
  });

  it('confirms only when required linked markers are available', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness sections={[generalSection('FWD'), nicheSection('ANODE / ICCP')]} onNext={onNext} />);
    await uploadVessel(user);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));

    const complete = screen.getByRole('button', { name: '선박 위치도 설정 완료' });
    expect(complete).toBeEnabled();
    await user.click(complete);
    expect(onNext).toHaveBeenCalledOnce();
  });
});
