import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportSection } from '../domain/types';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, type VesselDiagramConfig } from '../vesselDiagram/types';
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

const nicheSection = (component: string, unit?: number): ReportSection => ({
  id: `niche-${component}`,
  targetId: `niche-${component}`,
  area: 'NICHE',
  component,
  unit,
  service: 'INSPECTION',
  phases: ['CURRENT'],
  conditions: {},
});

afterEach(() => vi.restoreAllMocks());

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
  it('keeps the Niche transition visible but disabled before a valid image draft exists', () => {
    render(<Harness sections={[generalSection('FWD')]} />);

    expect(screen.getByRole('button', { name: 'Niche 맞추기로 이동' })).toBeDisabled();
  });

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

  it('locks the preserved Hull draft on Niche transition and provides a Hull return without editable guides', async () => {
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
    fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(marker, { pointerId: 1 });
    const movedX = changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x;

    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    expect(changes.at(-1)).toMatchObject({ confirmed: true });
    expect(changes.at(-1)?.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x).toBe(movedX);
    expect(screen.queryByLabelText('선미 기준선')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hull 맞추기로 돌아가기' }));
    expect(screen.getByLabelText('선미 기준선')).toBeVisible();
  });

  it('reprojects Hull markers when a locked Hull guide changes and asks before replacing manually moved Niche markers', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[generalSection('AFT'), nicheSection('TRANSDUCER')]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    const niche = screen.getAllByLabelText('Transducer 표식')[0];
    fireEvent.pointerDown(niche, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(niche, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(niche, { pointerId: 1 });
    const beforeGuide = changes.at(-1)!;

    await user.click(screen.getByRole('button', { name: 'Hull 맞추기로 돌아가기' }));
    const stern = screen.getByLabelText('선미 기준선');
    fireEvent.pointerDown(stern, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stern, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stern, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(stern, { pointerId: 1 });

    expect(confirm).toHaveBeenCalledWith('Hull 변경 시 Niche 위치가 자동 배치로 재계산됩니다. 계속할까요?');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(changes.at(-1)?.calibration).toEqual(beforeGuide.calibration);
  });

  it('reprojects adjusted Hull markers without a prompt when Niche remains at its current defaults', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    const confirm = vi.spyOn(window, 'confirm');
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[generalSection('AFT')]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);
    const hull = screen.getByLabelText('AFT Hull 표식');
    fireEvent.pointerDown(hull, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(hull, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(hull, { pointerId: 1 });
    const beforeGuide = changes.at(-1)!;
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    await user.click(screen.getByRole('button', { name: 'Hull 맞추기로 돌아가기' }));
    const stern = screen.getByLabelText('선미 기준선');
    fireEvent.pointerDown(stern, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stern, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(stern, { pointerId: 1 });
    const afterGuide = changes.at(-1)!;

    expect(confirm).not.toHaveBeenCalled();
    expect(afterGuide.calibration.sternX).toBeGreaterThan(beforeGuide.calibration.sternX);
    expect(afterGuide.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x)
      .toBeGreaterThan(beforeGuide.hullMarkers.find(({ id }) => id === 'hull-aft')?.rect.x ?? 0);
  });

  it('moves all selected Bilge Keel markers together while retaining their relative positions', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[nicheSection('BILGE KEEL', 1), nicheSection('BILGE KEEL', 2)]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    await user.click(screen.getByRole('button', { name: 'Bilge keel 그룹 선택' }));
    const before = changes.at(-1)!.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));
    const marker = screen.getAllByLabelText('Bilge keel 표식')[0];
    fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(marker, { pointerId: 1 });
    const after = changes.at(-1)!.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));

    expect(after).toHaveLength(2);
    expect(after[0].rect.x - before[0].rect.x).toBeCloseTo(after[1].rect.x - before[1].rect.x, 8);
    expect(after[0].rect.width).toBe(before[0].rect.width);
    expect(after[1].rect.width).toBe(before[1].rect.width);

    const handle = screen.getAllByLabelText('Bilge keel se 크기 조절')[0];
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 110, pointerId: 2 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    const resized = changes.at(-1)!.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));
    expect(resized[0].rect.width).toBeGreaterThan(after[0].rect.width);
    expect(resized[1].rect.width).toBeGreaterThan(after[1].rect.width);
  });

  it('keeps every Bilge Keel unit at the canonical minimum when shrinking a selected group', async () => {
    const user = userEvent.setup();
    const changes: VesselDiagramConfig[] = [];
    function RecordingHarness() {
      const [value, setValue] = useState<VesselDiagramConfig | null>(null);
      return <VesselDiagramEditor sections={[nicheSection('BILGE KEEL', 1), nicheSection('BILGE KEEL', 2)]} value={value} onChange={(next) => {
        changes.push(next);
        setValue(next);
      }} onBack={vi.fn()} onNext={vi.fn()} />;
    }
    render(<RecordingHarness />);
    await uploadVessel(user);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    await user.click(screen.getByRole('button', { name: 'Bilge keel 그룹 선택' }));

    const handle = screen.getAllByLabelText('Bilge keel se 크기 조절')[0];
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -5000, clientY: -5000, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    const bilge = changes.at(-1)!.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));

    expect(bilge).toHaveLength(2);
    for (const marker of bilge) {
      expect(marker.rect.width).toBeGreaterThanOrEqual(8 / DIAGRAM_WIDTH);
      expect(marker.rect.height).toBeGreaterThanOrEqual(8 / DIAGRAM_HEIGHT);
      expect(marker.rect.x).toBeGreaterThanOrEqual(0);
      expect(marker.rect.y).toBeGreaterThanOrEqual(0);
      expect(marker.rect.x + marker.rect.width).toBeLessThanOrEqual(1);
      expect(marker.rect.y + marker.rect.height).toBeLessThanOrEqual(1);
    }
  });

  it('recreates a presentation URL from an existing draft after remount', async () => {
    const file = new File(['png'], 'vessel.png', { type: 'image/png' });
    const value: VesselDiagramConfig = {
      imageFile: file,
      imageName: file.name,
      calibration: { sternX: .08, bowX: .92, hullTopY: .15, bottomY: .86 },
      hullMarkers: [],
      nicheMarkers: [],
      confirmed: false,
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { unmount } = render(<VesselDiagramEditor sections={[]} value={value} onChange={vi.fn()} onBack={vi.fn()} onNext={vi.fn()} />);

    expect(await screen.findByAltText('업로드한 선박 사이드뷰')).toHaveAttribute('src', 'blob:restored');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:restored');
  });
});
