import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ReportSection } from '../domain/types';
import {
  clampRect,
  createDefaultHullMarkers,
  createDefaultNicheMarkers,
  isValidCalibration,
  resetMarker,
} from '../vesselDiagram/geometry';
import { bilgeQuantityFromSections, requiredMarkerGroups } from '../vesselDiagram/markers';
import {
  DEFAULT_CALIBRATION,
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type HullCalibration,
  type NormalizedRect,
  type VesselDiagramConfig,
  type ZoneMarker,
} from '../vesselDiagram/types';

interface VesselDiagramEditorProps {
  sections: ReportSection[];
  value: VesselDiagramConfig | null;
  onChange: (value: VesselDiagramConfig) => void;
  onBack: () => void;
  onNext: () => void;
}

type EditorStep = 'HULL' | 'NICHE';
type Interaction = {
  kind: 'GUIDE' | 'MOVE' | 'RESIZE';
  id: string;
  startPoint: { x: number; y: number };
  startRect?: NormalizedRect;
  edge?: 'nw' | 'ne' | 'sw' | 'se';
};

const MIN_WIDTH = 8 / DIAGRAM_WIDTH;
const MIN_HEIGHT = 8 / DIAGRAM_HEIGHT;
const ACCEPTED_IMAGE = /\.(png|jpe?g)$/i;
const DISPLAY_NAMES: Record<string, string> = {
  hull: 'Hull',
  'propeller-group': 'Propeller',
  'aft-services': 'Aft services',
  'rudder-group': 'Rudder',
  'fwd-services': 'Forward services',
  'bulbous-bow': 'Bulbous bow',
  transducer: 'Transducer',
  anode: 'Anode',
  'bilge-keel': 'Bilge keel',
};

const markerGroup = (marker: ZoneMarker) => {
  if (marker.id.startsWith('transducer-')) return 'transducer';
  if (marker.id.startsWith('anode-')) return 'anode';
  if (marker.id.startsWith('bilge-keel-')) return 'bilge-keel';
  return marker.groupId;
};

const markerName = (marker: ZoneMarker) => {
  if (marker.id.startsWith('hull-')) return `${marker.id.slice(5).toUpperCase().replaceAll('-', ' ')} Hull`;
  return DISPLAY_NAMES[markerGroup(marker)] ?? marker.id;
};

const sameRect = (a: NormalizedRect, b: NormalizedRect) => (
  Math.abs(a.x - b.x) < 1e-8
  && Math.abs(a.y - b.y) < 1e-8
  && Math.abs(a.width - b.width) < 1e-8
  && Math.abs(a.height - b.height) < 1e-8
);

async function decodeImage(file: File): Promise<void> {
  if (file.size <= 0) throw new Error('empty image');
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height) throw new Error('invalid image');
    } finally {
      bitmap.close();
    }
    return;
  }

  const temporaryUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight ? resolve() : reject(new Error('invalid image'));
      image.onerror = () => reject(new Error('invalid image'));
      image.src = temporaryUrl;
    });
  } finally {
    URL.revokeObjectURL(temporaryUrl);
  }
}

function newDraft(file: File, sections: ReportSection[]): VesselDiagramConfig {
  const calibration = { ...DEFAULT_CALIBRATION };
  return {
    imageFile: file,
    imageName: file.name,
    calibration,
    hullMarkers: createDefaultHullMarkers(calibration),
    nicheMarkers: createDefaultNicheMarkers(calibration, bilgeQuantityFromSections(sections)),
    confirmed: false,
  };
}

function resizeRect(rect: NormalizedRect, edge: NonNullable<Interaction['edge']>, delta: { x: number; y: number }): NormalizedRect {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const left = edge.includes('w') ? Math.min(right - MIN_WIDTH, Math.max(0, rect.x + delta.x)) : rect.x;
  const top = edge.includes('n') ? Math.min(bottom - MIN_HEIGHT, Math.max(0, rect.y + delta.y)) : rect.y;
  const nextRight = edge.includes('e') ? Math.max(left + MIN_WIDTH, Math.min(1, right + delta.x)) : right;
  const nextBottom = edge.includes('s') ? Math.max(top + MIN_HEIGHT, Math.min(1, bottom + delta.y)) : bottom;
  return clampRect({ x: left, y: top, width: nextRight - left, height: nextBottom - top });
}

export function VesselDiagramEditor({ sections, value, onChange, onBack, onNext }: VesselDiagramEditorProps) {
  const [step, setStep] = useState<EditorStep>('HULL');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const bilgeQuantity = bilgeQuantityFromSections(sections);
  const allMarkers = value ? [...value.hullMarkers, ...value.nicheMarkers] : [];
  const requiredGroups = requiredMarkerGroups(sections);
  const canConfirm = Boolean(value && isValidCalibration(value.calibration)
    && requiredGroups.every((group) => group.markerIds.every((id) => allMarkers.some((marker) => marker.id === id))));

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const replace = (patch: Partial<VesselDiagramConfig>) => {
    if (value) onChange({ ...value, ...patch });
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file || (!(file.type === 'image/png' || file.type === 'image/jpeg') && !ACCEPTED_IMAGE.test(file.name))) {
      setError('PNG 또는 JPG 선박 이미지를 확인할 수 없습니다.');
      return;
    }
    try {
      await decodeImage(file);
      const nextUrl = URL.createObjectURL(file);
      setImageUrl(nextUrl);
      setStep('HULL');
      setSelectedIds([]);
      setError(null);
      onChange(newDraft(file, sections));
    } catch {
      setError('PNG 또는 JPG 선박 이미지를 확인할 수 없습니다.');
    }
  };

  const pointFor = (event: PointerEvent<HTMLElement | SVGLineElement>) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const width = bounds?.width || DIAGRAM_WIDTH;
    const height = bounds?.height || DIAGRAM_HEIGHT;
    return {
      x: (event.clientX - (bounds?.left ?? 0)) / width,
      y: (event.clientY - (bounds?.top ?? 0)) / height,
    };
  };

  const startMarkerInteraction = (event: PointerEvent<HTMLElement>, marker: ZoneMarker, kind: Interaction['kind'], edge?: Interaction['edge']) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedIds((ids) => ids.includes(marker.id) ? ids : [marker.id]);
    interactionRef.current = { kind, id: marker.id, startPoint: pointFor(event), startRect: marker.rect, edge };
  };

  const startGuideInteraction = (event: PointerEvent<SVGLineElement>, id: keyof HullCalibration) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interactionRef.current = { kind: 'GUIDE', id, startPoint: pointFor(event) };
  };

  const applyCalibration = (calibration: HullCalibration) => {
    if (!value) return;
    const nicheDefaults = createDefaultNicheMarkers(calibration, bilgeQuantity);
    const nicheChanged = value.nicheMarkers.some((marker) => {
      const expected = nicheDefaults.find((candidate) => candidate.id === marker.id);
      return !expected || !sameRect(marker.rect, expected.rect);
    });
    if (value.confirmed && nicheChanged && !window.confirm('Hull 변경 시 Niche 위치가 자동 배치로 재계산됩니다. 계속할까요?')) return;
    replace({ calibration, ...(value.confirmed ? {
      hullMarkers: createDefaultHullMarkers(calibration),
      nicheMarkers: nicheDefaults,
      confirmed: false,
    } : {}) });
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || !value) return;
    const point = pointFor(event);
    const delta = { x: point.x - interaction.startPoint.x, y: point.y - interaction.startPoint.y };
    if (interaction.kind === 'GUIDE') {
      const next = { ...value.calibration };
      const guideId = interaction.id as keyof HullCalibration;
      const amount = guideId === 'sternX' || guideId === 'bowX' ? delta.x : delta.y;
      next[guideId] = Math.min(1, Math.max(0, value.calibration[guideId] + amount));
      if (isValidCalibration(next)) {
        interactionRef.current = { ...interaction, startPoint: point };
        applyCalibration(next);
      }
      return;
    }
    const target = interaction.startRect;
    if (!target) return;
    const nextRect = interaction.kind === 'MOVE'
      ? clampRect({ ...target, x: target.x + delta.x, y: target.y + delta.y })
      : resizeRect(target, interaction.edge!, delta);
    const collection = interaction.id.startsWith('hull-') ? 'hullMarkers' : 'nicheMarkers';
    replace({ [collection]: value[collection].map((marker) => marker.id === interaction.id ? { ...marker, rect: nextRect } : marker) });
  };

  const finishInteraction = () => { interactionRef.current = null; };

  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>, marker: ZoneMarker) => {
    const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!isHorizontal && !isVertical) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const deltaX = event.key === 'ArrowLeft' ? -amount / DIAGRAM_WIDTH : event.key === 'ArrowRight' ? amount / DIAGRAM_WIDTH : 0;
    const deltaY = event.key === 'ArrowUp' ? -amount / DIAGRAM_HEIGHT : event.key === 'ArrowDown' ? amount / DIAGRAM_HEIGHT : 0;
    const collection = marker.id.startsWith('hull-') ? 'hullMarkers' : 'nicheMarkers';
    replace({ [collection]: value?.[collection].map((candidate) => candidate.id === marker.id
      ? { ...candidate, rect: clampRect({ ...candidate.rect, x: candidate.rect.x + deltaX, y: candidate.rect.y + deltaY }) }
      : candidate) });
  };

  const resetSelected = () => {
    if (!value) return;
    const defaults = (markers: ZoneMarker[]) => markers.map((marker) => selectedIds.includes(marker.id)
      ? resetMarker(marker.id, value.calibration, bilgeQuantity) ?? marker
      : marker);
    replace({ hullMarkers: defaults(value.hullMarkers), nicheMarkers: defaults(value.nicheMarkers) });
  };

  const resetGroups = () => {
    if (!value || !selectedIds.length) return;
    const selectedGroups = new Set(allMarkers.filter((marker) => selectedIds.includes(marker.id)).map(markerGroup));
    const defaults = (markers: ZoneMarker[]) => markers.map((marker) => selectedGroups.has(markerGroup(marker))
      ? resetMarker(marker.id, value.calibration, bilgeQuantity) ?? marker
      : marker);
    replace({ hullMarkers: defaults(value.hullMarkers), nicheMarkers: defaults(value.nicheMarkers) });
  };

  const resetAll = () => {
    if (!value) return;
    replace({ hullMarkers: createDefaultHullMarkers(value.calibration), nicheMarkers: createDefaultNicheMarkers(value.calibration, bilgeQuantity) });
  };

  const selectGroup = (groupId: string) => setSelectedIds(allMarkers.filter((marker) => markerGroup(marker) === groupId).map((marker) => marker.id));
  const presentGroups = [...new Set(allMarkers.map(markerGroup))];
  const relevantGroupIds = requiredGroups.map((group) => group.id);
  const restGroupIds = presentGroups.filter((group) => !relevantGroupIds.includes(group as typeof requiredGroups[number]['id']));

  const renderMarker = (marker: ZoneMarker) => <button
    key={marker.id}
    type="button"
    aria-label={`${markerName(marker)} 표식`}
    aria-pressed={selectedIds.includes(marker.id)}
    className={`vessel-marker ${marker.shape.toLowerCase()}${selectedIds.includes(marker.id) ? ' selected' : ''}`}
    style={{ left: `${marker.rect.x * 100}%`, top: `${marker.rect.y * 100}%`, width: `${marker.rect.width * 100}%`, height: `${marker.rect.height * 100}%` }}
    onPointerDown={(event) => startMarkerInteraction(event, marker, 'MOVE')}
    onPointerMove={moveInteraction}
    onPointerUp={finishInteraction}
    onKeyDown={(event) => moveByKey(event, marker)}
  >
    <span className="marker-label">{markerName(marker)}</span>
    {(['nw', 'ne', 'sw', 'se'] as const).map((edge) => <span
      key={edge}
      role="button"
      tabIndex={-1}
      aria-label={`${markerName(marker)} ${edge} 크기 조절`}
      className={`marker-handle ${edge}`}
      onPointerDown={(event) => startMarkerInteraction(event, marker, 'RESIZE', edge)}
    />)}
  </button>;

  const renderGroup = (groupId: string) => <button key={groupId} type="button" className="diagram-marker-group"
    aria-label={`${DISPLAY_NAMES[groupId] ?? groupId} 그룹 선택`}
    onClick={() => selectGroup(groupId)}
  ><b>{DISPLAY_NAMES[groupId] ?? groupId}</b><span>{allMarkers.filter((marker) => markerGroup(marker) === groupId).length}개 표식</span></button>;

  return <section className="vessel-diagram-editor" aria-label="선박 위치도 편집기">
    <header className="diagram-editor-head">
      <div><p className="step-kicker">VESSEL DIAGRAM</p><h2>{step === 'HULL' ? 'Hull 맞추기' : 'Niche 맞추기'}</h2></div>
      <p>이미지는 이 브라우저에서만 사용됩니다.</p>
    </header>
    <label className="diagram-upload"><span>선박 사이드뷰 이미지</span><input
      aria-label="선박 사이드뷰 이미지"
      type="file"
      accept="image/png,image/jpeg,.png,.jpg,.jpeg"
      onChange={(event) => void uploadImage(event.target.files?.[0])}
    />{value && <b>{value.imageName}</b>}</label>
    {error && <p role="alert" className="diagram-error">{error}</p>}
    {value && <div className="diagram-editor-grid">
      <div className="diagram-panel">
        <div ref={surfaceRef} className="vessel-diagram-surface" onPointerMove={moveInteraction} onPointerUp={finishInteraction}>
          {imageUrl && <img src={imageUrl} alt="업로드한 선박 사이드뷰" />}
          <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} aria-label="Hull 기준선">
            <line role="slider" aria-label="선미 기준선" x1={value.calibration.sternX * DIAGRAM_WIDTH} x2={value.calibration.sternX * DIAGRAM_WIDTH} y1="0" y2={DIAGRAM_HEIGHT} onPointerDown={(event) => startGuideInteraction(event, 'sternX')} />
            <line role="slider" aria-label="선수 기준선" x1={value.calibration.bowX * DIAGRAM_WIDTH} x2={value.calibration.bowX * DIAGRAM_WIDTH} y1="0" y2={DIAGRAM_HEIGHT} onPointerDown={(event) => startGuideInteraction(event, 'bowX')} />
            <line role="slider" aria-label="Hull 상단선" x1="0" x2={DIAGRAM_WIDTH} y1={value.calibration.hullTopY * DIAGRAM_HEIGHT} y2={value.calibration.hullTopY * DIAGRAM_HEIGHT} onPointerDown={(event) => startGuideInteraction(event, 'hullTopY')} />
            <line role="slider" aria-label="Bottom 기준선" x1="0" x2={DIAGRAM_WIDTH} y1={value.calibration.bottomY * DIAGRAM_HEIGHT} y2={value.calibration.bottomY * DIAGRAM_HEIGHT} onPointerDown={(event) => startGuideInteraction(event, 'bottomY')} />
          </svg>
          {(step === 'HULL' ? value.hullMarkers : value.nicheMarkers).map(renderMarker)}
        </div>
      </div>
      <aside className="diagram-controls">
        <div className="diagram-control-actions">
          <button type="button" className="ghost" onClick={resetSelected} disabled={!selectedIds.length}>선택 표식 초기화</button>
          <button type="button" className="ghost" onClick={resetGroups} disabled={!selectedIds.length}>그룹 초기화</button>
          <button type="button" className="ghost" onClick={resetAll}>자동 배치 다시 적용</button>
        </div>
        {step === 'NICHE' && <div className="diagram-group-list">
          <h3>Scope 표식</h3>
          {relevantGroupIds.map(renderGroup)}
          {restGroupIds.length > 0 && <details><summary>기타 승인 표식</summary>{restGroupIds.map(renderGroup)}</details>}
        </div>}
        {step === 'HULL' && <div className="diagram-hull-help"><b>Hull 기준선</b><span>선미·선수·상단·Bottom 기준선을 드래그해 선체 범위를 맞추세요.</span></div>}
      </aside>
    </div>}
    <footer className="diagram-editor-footer">
      <button type="button" className="ghost" onClick={onBack}>이전</button>
      {value && step === 'HULL' && <button type="button" className="primary" disabled={!isValidCalibration(value.calibration)} onClick={() => setStep('NICHE')}>Niche 맞추기로 이동</button>}
      {value && step === 'NICHE' && <button type="button" className="primary" disabled={!canConfirm} onClick={() => {
        const confirmed = { ...value, confirmed: true };
        onChange(confirmed);
        onNext();
      }}>선박 위치도 설정 완료</button>}
    </footer>
  </section>;
}
