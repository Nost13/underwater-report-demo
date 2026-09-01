import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportSection } from '../domain/types';
import { createDefaultHullMarkers, createDefaultNicheMarkers } from '../vesselDiagram/geometry';
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

function existingDraft(): VesselDiagramConfig {
  const calibration = { sternX: .25, bowX: .95, hullTopY: .2, bottomY: .8 };
  return {
    imageFile: new File(['png'], 'vessel.png', { type: 'image/png' }),
    imageName: 'vessel.png',
    calibration,
    hullMarkers: createDefaultHullMarkers(calibration),
    nicheMarkers: createDefaultNicheMarkers(calibration, 2),
    confirmed: true,
  };
}

function recordDraft(initial: VesselDiagramConfig, sections = [generalSection('AFT'), nicheSection('BILGE KEEL', 2)]) {
  let latest = initial;
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vessel');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  function RecordingHarness() {
    const [value, setValue] = useState(initial);
    return <VesselDiagramEditor sections={sections} value={value} onChange={(next) => {
      latest = next;
      setValue(next);
    }} onBack={vi.fn()} onNext={vi.fn()} />;
  }
  render(<RecordingHarness />);
  return () => latest;
}

describe('VesselDiagramEditor', () => {
  it.each(['individual', 'group'])('preserves %s pointer-moved dimensions and relative geometry at every edge', async (mode) => {
    const user = userEvent.setup();
    const latest = recordDraft(existingDraft());
    if (mode === 'group') {
      await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
      await user.click(screen.getByRole('button', { name: 'Bilge keel 그룹 선택' }));
    }
    const markers = () => mode === 'group'
      ? latest().nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'))
      : latest().hullMarkers.filter(({ id }) => id === 'hull-aft');
    const originals = markers();
    const marker = mode === 'group' ? screen.getAllByLabelText(/Bilge Keel \d+ 표식/)[0] : screen.getByLabelText('AFT Hull 표식');
    for (const [dx, dy] of [[5000, 0], [-5000, 0], [0, 5000], [0, -5000], [30, 20]]) {
      fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(marker, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
      fireEvent.pointerUp(marker, { pointerId: 1 });
      const moved = markers();
      moved.forEach(({ rect }, index) => {
        expect(rect.width).toBe(originals[index].rect.width);
        expect(rect.height).toBe(originals[index].rect.height);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1 + 1e-12);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1 + 1e-12);
        expect(rect.x - moved[0].rect.x).toBeCloseTo(originals[index].rect.x - originals[0].rect.x, 10);
        expect(rect.y - moved[0].rect.y).toBeCloseTo(originals[index].rect.y - originals[0].rect.y, 10);
      });
      expect(latest().confirmed).toBe(false);
    }
  });

  it.each([
    ['individual', 'ArrowRight', .7499, .2, .75, .2],
    ['individual', 'ArrowLeft', .0001, .2, 0, .2],
    ['individual', 'ArrowDown', .2, .8699, .2, .87],
    ['individual', 'ArrowUp', .2, .0001, .2, 0],
    ['group', 'ArrowRight', .7499, .2, .75, .2],
    ['group', 'ArrowLeft', .0001, .2, 0, .2],
    ['group', 'ArrowDown', .2, .8699, .2, .87],
    ['group', 'ArrowUp', .2, .0001, .2, 0],
  ] as const)('clamps %s %s keyboard overshoot as one translation', async (mode, key, x, y, wantX, wantY) => {
    const draft = existingDraft();
    draft.hullMarkers[0].rect = { x, y, width: .25, height: .13 };
    const bilge = draft.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));
    bilge[0].rect = { x, y, width: .1, height: .1 };
    bilge[1].rect = { x: x + .15, y: y + .03, width: .1, height: .1 };
    const latest = recordDraft(draft);
    if (mode === 'group') {
      fireEvent.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
      fireEvent.click(screen.getByRole('button', { name: 'Bilge keel 그룹 선택' }));
    }
    const marker = mode === 'group' ? screen.getAllByLabelText(/Bilge Keel \d+ 표식/)[0] : screen.getByLabelText('AFT Hull 표식');
    fireEvent.keyDown(marker, { key, shiftKey: true });
    const moved = mode === 'group' ? latest().nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-')) : [latest().hullMarkers[0]];
    expect(moved[0].rect.x).toBeCloseTo(wantX, 10);
    expect(moved[0].rect.y).toBeCloseTo(wantY, 10);
    expect(moved[0].rect.width).toBe(mode === 'group' ? .1 : .25);
    expect(moved[0].rect.height).toBe(mode === 'group' ? .1 : .13);
    if (mode === 'group') {
      expect(moved[1].rect.x - moved[0].rect.x).toBeCloseTo(.15, 10);
      expect(moved[1].rect.y - moved[0].rect.y).toBeCloseTo(.03, 10);
      expect(moved[1].rect.width).toBe(.1);
      expect(moved[1].rect.height).toBe(.1);
    }
    expect(latest().confirmed).toBe(false);
  });

  it.each([
    { x: .1, y: .2, width: 0, height: .2 },
    { x: .1, y: .2, width: .1, height: 0 },
    { x: Number.NaN, y: .2, width: .1, height: .2 },
    { x: .1, y: .2, width: Number.POSITIVE_INFINITY, height: .2 },
  ])('blocks final confirmation of malformed rectangles: %j', (rect) => {
    const draft = existingDraft();
    draft.hullMarkers[0].rect = rect;
    recordDraft(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    expect(screen.getByRole('button', { name: '선박 위치도 설정 완료' })).toBeDisabled();
  });

  it.each(['NICHE', 'HULL'])('preserves arrays, selection and saved status when automatic layout is canceled in %s', async (step) => {
    const user = userEvent.setup();
    const draft = existingDraft();
    draft.nicheMarkers.find(({ id }) => id === 'transducer-aft')!.rect.x = .5;
    const latest = recordDraft(draft);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    await user.click(screen.getByRole('button', { name: 'Bilge keel 그룹 선택' }));
    if (step === 'HULL') await user.click(screen.getByRole('button', { name: 'Hull 맞추기로 돌아가기' }));
    await user.click(screen.getByRole('button', { name: '자동 배치 다시 적용' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(latest()).toBe(draft);
    if (step === 'HULL') await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    screen.getAllByLabelText(/Bilge Keel \d+ 표식/).forEach((marker) => expect(marker).toHaveAttribute('aria-pressed', 'true'));
  });

  it('accepts automatic layout using current asymmetric calibration and invalidates the saved state', async () => {
    const user = userEvent.setup();
    const draft = existingDraft();
    draft.hullMarkers[0].rect.x = .3;
    draft.nicheMarkers.find(({ id }) => id === 'transducer-aft')!.rect.x = .5;
    const latest = recordDraft(draft);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '자동 배치 다시 적용' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(latest().hullMarkers[0].rect.x).toBe(.25);
    expect(latest().nicheMarkers.find(({ id }) => id === 'transducer-aft')!.rect.x).toBeCloseTo(.376, 10);
    const bilge = latest().nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));
    expect((bilge[0].rect.x + bilge[1].rect.x + bilge[1].rect.width) / 2).toBeCloseTo(.6, 10);
    expect(latest().confirmed).toBe(false);
  });

  it('regenerates Bilge markers around the new vessel midpoint after recalibration', () => {
    const latest = recordDraft(existingDraft());
    const stern = screen.getByLabelText('선미 기준선');
    fireEvent.pointerDown(stern, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stern, { clientX: 100 + .1 * DIAGRAM_WIDTH, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(stern, { pointerId: 1 });
    const bilge = latest().nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));
    expect((bilge[0].rect.x + bilge[1].rect.x + bilge[1].rect.width) / 2).toBeCloseTo(.65, 10);
    expect(latest().confirmed).toBe(false);
  });

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
    expect(screen.getAllByLabelText(/Transducer (AFT|FWD) 표식/)).toHaveLength(2);
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
    expect(changes.at(-1)).toMatchObject({ confirmed: false });
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
    const niche = screen.getAllByLabelText(/Transducer (AFT|FWD) 표식/)[0];
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
    const marker = screen.getAllByLabelText(/Bilge Keel \d+ 표식/)[0];
    fireEvent.pointerDown(marker, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(marker, { pointerId: 1 });
    const after = changes.at(-1)!.nicheMarkers.filter(({ id }) => id.startsWith('bilge-keel-'));

    expect(after).toHaveLength(2);
    expect(after[0].rect.x - before[0].rect.x).toBeCloseTo(after[1].rect.x - before[1].rect.x, 8);
    expect(after[0].rect.width).toBe(before[0].rect.width);
    expect(after[1].rect.width).toBe(before[1].rect.width);

    const handle = screen.getAllByLabelText(/Bilge Keel \d+ se 크기 조절/)[0];
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

    const handle = screen.getAllByLabelText(/Bilge Keel \d+ se 크기 조절/)[0];
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

  it('Ctrl-selects arbitrary markers, plain-clicks one, and clears with Escape', async () => {
    const user = userEvent.setup();
    recordDraft(existingDraft(), [
      nicheSection('TRANSDUCER'),
      nicheSection('ANODE / ICCP'),
      nicheSection('BILGE KEEL', 2),
    ]);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    const aft = screen.getByRole('button', { name: 'Transducer AFT 표식' });
    const fwd = screen.getByRole('button', { name: 'Transducer FWD 표식' });

    await user.keyboard('{Control>}');
    await user.click(aft);
    await user.click(fwd);
    await user.keyboard('{/Control}');
    expect(aft).toHaveAttribute('aria-pressed', 'true');
    expect(fwd).toHaveAttribute('aria-pressed', 'true');

    await user.click(aft);
    expect(aft).toHaveAttribute('aria-pressed', 'true');
    expect(fwd).toHaveAttribute('aria-pressed', 'false');

    await user.keyboard('{Escape}');
    expect(aft).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves a mixed multi-selection as one bounded group', async () => {
    const user = userEvent.setup();
    const latest = recordDraft(existingDraft(), [
      nicheSection('TRANSDUCER'),
      nicheSection('ANODE / ICCP'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Niche 맞추기로 이동' }));
    const aft = screen.getByRole('button', { name: 'Transducer AFT 표식' });
    const anode = screen.getByRole('button', { name: 'Anode AFT 표식' });
    fireEvent.pointerDown(aft, { clientX: 100, clientY: 100, pointerId: 1, ctrlKey: true });
    fireEvent.pointerUp(aft, { pointerId: 1, ctrlKey: true });
    fireEvent.pointerDown(anode, { clientX: 100, clientY: 100, pointerId: 2, ctrlKey: true });
    fireEvent.pointerUp(anode, { pointerId: 2, ctrlKey: true });
    const before = latest().nicheMarkers.filter(({ id }) => [
      'transducer-aft',
      'anode-aft',
    ].includes(id));

    fireEvent.pointerDown(aft, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(aft, { clientX: 130, clientY: 120, pointerId: 3 });
    fireEvent.pointerUp(aft, { pointerId: 3 });
    const after = latest().nicheMarkers.filter(({ id }) => [
      'transducer-aft',
      'anode-aft',
    ].includes(id));

    expect(after[0].rect.x - before[0].rect.x)
      .toBeCloseTo(after[1].rect.x - before[1].rect.x, 8);
    expect(after[0].rect.y - before[0].rect.y)
      .toBeCloseTo(after[1].rect.y - before[1].rect.y, 8);
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
