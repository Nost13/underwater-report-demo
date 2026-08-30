import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ReportSection } from '../domain/types';
import {
  clampRect,
  createDefaultHullMarkers,
  createDefaultNicheMarkers,
  isValidCalibration,
  isValidRect,
  resetMarker,
  translateRect,
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
  markerIds?: string[];
  startRects?: ZoneMarker[];
  groupBounds?: NormalizedRect;
  cancelled?: boolean;
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

const markerBounds = (markers: ZoneMarker[]): NormalizedRect => {
  const left = Math.min(...markers.map((marker) => marker.rect.x));
  const top = Math.min(...markers.map((marker) => marker.rect.y));
  const right = Math.max(...markers.map((marker) => marker.rect.x + marker.rect.width));
  const bottom = Math.max(...markers.map((marker) => marker.rect.y + marker.rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const reprojectRect = (rect: NormalizedRect, previous: HullCalibration, next: HullCalibration): NormalizedRect => {
  const previousWidth = previous.bowX - previous.sternX;
  const previousHeight = previous.bottomY - previous.hullTopY;
  const nextWidth = next.bowX - next.sternX;
  const nextHeight = next.bottomY - next.hullTopY;
  return clampRect({
    x: next.sternX + (rect.x - previous.sternX) / previousWidth * nextWidth,
    y: next.hullTopY + (rect.y - previous.hullTopY) / previousHeight * nextHeight,
    width: rect.width / previousWidth * nextWidth,
    height: rect.height / previousHeight * nextHeight,
  });
};

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

function resizeRect(
  rect: NormalizedRect,
  edge: NonNullable<Interaction['edge']>,
  delta: { x: number; y: number },
  minimum = { width: MIN_WIDTH, height: MIN_HEIGHT },
): NormalizedRect {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const left = edge.includes('w') ? Math.min(right - minimum.width, Math.max(0, rect.x + delta.x)) : rect.x;
  const top = edge.includes('n') ? Math.min(bottom - minimum.height, Math.max(0, rect.y + delta.y)) : rect.y;
  const nextRight = edge.includes('e') ? Math.max(left + minimum.width, Math.min(1, right + delta.x)) : right;
  const nextBottom = edge.includes('s') ? Math.max(top + minimum.height, Math.min(1, bottom + delta.y)) : bottom;
  return clampRect({ x: left, y: top, width: nextRight - left, height: nextBottom - top });
}

export function VesselDiagramEditor({ sections, value, onChange, onBack, onNext }: VesselDiagramEditorProps) {
  const [step, setStep] = useState<EditorStep>('HULL');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const previewFileRef = useRef<File | null>(null);
  const uploadVersionRef = useRef(0);
  const bilgeQuantity = bilgeQuantityFromSections(sections);
  const allMarkers = value ? [...value.hullMarkers, ...value.nicheMarkers] : [];
  const requiredGroups = requiredMarkerGroups(sections);
  const canConfirm = Boolean(value && isValidCalibration(value.calibration)
    && allMarkers.every((marker) => isValidRect(marker.rect))
    && requiredGroups.every((group) => group.markerIds.every((id) => allMarkers.some((marker) => marker.id === id))));

  useEffect(() => {
    const file = value?.imageFile ?? null;
    if (previewFileRef.current === file) return;
    previewFileRef.current = file;
    setImageUrl(file ? URL.createObjectURL(file) : null);
    uploadVersionRef.current += 1;
  }, [value?.imageFile]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const replace = (patch: Partial<VesselDiagramConfig>) => {
    if (value) onChange({ ...value, ...patch, confirmed: false });
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file || (!(file.type === 'image/png' || file.type === 'image/jpeg') && !ACCEPTED_IMAGE.test(file.name))) {
      setError('PNG 또는 JPG 선박 이미지를 확인할 수 없습니다.');
      return;
    }
    const uploadVersion = ++uploadVersionRef.current;
    try {
      await decodeImage(file);
      if (uploadVersion !== uploadVersionRef.current) return;
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
    const selected = allMarkers.filter((candidate) => selectedIds.includes(candidate.id));
    const moveBilgeGroup = kind !== 'GUIDE'
      && markerGroup(marker) === 'bilge-keel'
      && selected.length > 1
      && selected.every((candidate) => markerGroup(candidate) === 'bilge-keel');
    interactionRef.current = {
      kind,
      id: marker.id,
      startPoint: pointFor(event),
      startRect: marker.rect,
      edge,
      ...(moveBilgeGroup ? {
        markerIds: selected.map((candidate) => candidate.id),
        startRects: selected,
        groupBounds: markerBounds(selected),
      } : {}),
    };
  };

  const startGuideInteraction = (event: PointerEvent<SVGLineElement>, id: keyof HullCalibration) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interactionRef.current = { kind: 'GUIDE', id, startPoint: pointFor(event) };
  };

  const confirmNicheReset = (): boolean => {
    if (!value) return false;
    const currentNicheDefaults = createDefaultNicheMarkers(value.calibration, bilgeQuantity);
    const nicheChanged = value.nicheMarkers.some((marker) => {
      const expected = currentNicheDefaults.find((candidate) => candidate.id === marker.id);
      return !expected || !sameRect(marker.rect, expected.rect);
    });
    return !nicheChanged || window.confirm('Hull 변경 시 Niche 위치가 자동 배치로 재계산됩니다. 계속할까요?');
  };

  const applyCalibration = (calibration: HullCalibration): boolean => {
    if (!value || !confirmNicheReset()) return false;
    replace({
      calibration,
      hullMarkers: value.hullMarkers.map((marker) => ({ ...marker, rect: reprojectRect(marker.rect, value.calibration, calibration) })),
      nicheMarkers: createDefaultNicheMarkers(calibration, bilgeQuantity),
    });
    return true;
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.cancelled || !value) return;
    const point = pointFor(event);
    const delta = { x: point.x - interaction.startPoint.x, y: point.y - interaction.startPoint.y };
    if (interaction.kind === 'GUIDE') {
      const next = { ...value.calibration };
      const guideId = interaction.id as keyof HullCalibration;
      const amount = guideId === 'sternX' || guideId === 'bowX' ? delta.x : delta.y;
      next[guideId] = Math.min(1, Math.max(0, value.calibration[guideId] + amount));
      if (isValidCalibration(next)) {
        if (applyCalibration(next)) interactionRef.current = { ...interaction, startPoint: point };
        else interactionRef.current = { ...interaction, cancelled: true };
      }
      return;
    }
    const target = interaction.startRect;
    if (!target) return;
    if (interaction.markerIds && interaction.startRects && interaction.groupBounds) {
      const startBounds = interaction.groupBounds;
      if (interaction.kind === 'MOVE') {
        const nextBounds = translateRect(startBounds, delta);
        const starts = new Map(interaction.startRects.map((marker) => [marker.id, marker]));
        replace({ nicheMarkers: value.nicheMarkers.map((marker) => {
          const start = starts.get(marker.id);
          return start ? { ...marker, rect: {
            ...start.rect,
            x: nextBounds.x + (start.rect.x - startBounds.x),
            y: nextBounds.y + (start.rect.y - startBounds.y),
          } } : marker;
        }) });
        return;
      }
      const groupMinimum = {
        width: Math.max(MIN_WIDTH, ...interaction.startRects.map((marker) => startBounds.width * MIN_WIDTH / marker.rect.width)),
        height: Math.max(MIN_HEIGHT, ...interaction.startRects.map((marker) => startBounds.height * MIN_HEIGHT / marker.rect.height)),
      };
      const nextBounds = resizeRect(startBounds, interaction.edge!, delta, groupMinimum);
      const scaleX = nextBounds.width / startBounds.width;
      const scaleY = nextBounds.height / startBounds.height;
      const starts = new Map(interaction.startRects.map((marker) => [marker.id, marker]));
      replace({ nicheMarkers: value.nicheMarkers.map((marker) => {
        const start = starts.get(marker.id);
        if (!start) return marker;
        return {
          ...marker,
          rect: clampRect({
            x: nextBounds.x + (start.rect.x - startBounds.x) * scaleX,
            y: nextBounds.y + (start.rect.y - startBounds.y) * scaleY,
            width: start.rect.width * scaleX,
            height: start.rect.height * scaleY,
          }),
        };
      }) });
      return;
    }
    const nextRect = interaction.kind === 'MOVE'
      ? translateRect(target, delta)
      : resizeRect(target, interaction.edge!, delta);
    const collection = interaction.id.startsWith('hull-') ? 'hullMarkers' : 'nicheMarkers';
    replace({ [collection]: value[collection].map((marker) => marker.id === interaction.id ? { ...marker, rect: nextRect } : marker) });
  };

  const finishInteraction = () => { interactionRef.current = null; };

  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>, marker: ZoneMarker) => {
    if (!value) return;
    const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!isHorizontal && !isVertical) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const deltaX = event.key === 'ArrowLeft' ? -amount / DIAGRAM_WIDTH : event.key === 'ArrowRight' ? amount / DIAGRAM_WIDTH : 0;
    const deltaY = event.key === 'ArrowUp' ? -amount / DIAGRAM_HEIGHT : event.key === 'ArrowDown' ? amount / DIAGRAM_HEIGHT : 0;
    const collection = marker.id.startsWith('hull-') ? 'hullMarkers' : 'nicheMarkers';
    const selected = value[collection].filter((candidate) => selectedIds.includes(candidate.id));
    const moveGroup = selectedIds.includes(marker.id) && selected.length > 1
      && selected.every((candidate) => markerGroup(candidate) === 'bilge-keel');
    const moving = moveGroup ? selected : [marker];
    const bounds = markerBounds(moving);
    const nextBounds = translateRect(bounds, { x: deltaX, y: deltaY });
    const movingIds = new Set(moving.map((candidate) => candidate.id));
    replace({ [collection]: value[collection].map((candidate) => movingIds.has(candidate.id)
      ? { ...candidate, rect: {
        ...candidate.rect,
        x: nextBounds.x + (candidate.rect.x - bounds.x),
        y: nextBounds.y + (candidate.rect.y - bounds.y),
      } }
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
    if (!value || !confirmNicheReset()) return;
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

  const guide = (id: keyof HullCalibration, label: string, vertical: boolean) => {
    const point = vertical ? value!.calibration[id] * DIAGRAM_WIDTH : value!.calibration[id] * DIAGRAM_HEIGHT;
    const line = vertical
      ? { x1: point, x2: point, y1: 0, y2: DIAGRAM_HEIGHT }
      : { x1: 0, x2: DIAGRAM_WIDTH, y1: point, y2: point };
    return <g key={id}>
      <line className="diagram-guide-hit" role="slider" aria-label={label} {...line} onPointerDown={(event) => startGuideInteraction(event, id)} />
      <line className="diagram-guide" aria-hidden="true" {...line} />
    </g>;
  };

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
          {imageUrl && <>
            {/* Object URLs reference local files and cannot use Next's remote image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="업로드한 선박 사이드뷰" />
          </>}
          {step === 'HULL' && <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} aria-label="Hull 기준선">
            {guide('sternX', '선미 기준선', true)}
            {guide('bowX', '선수 기준선', true)}
            {guide('hullTopY', 'Hull 상단선', false)}
            {guide('bottomY', 'Bottom 기준선', false)}
          </svg>}
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
      {step === 'HULL' && <button type="button" className="primary" disabled={!value || !isValidCalibration(value.calibration)} onClick={() => {
        if (!value) return;
        setStep('NICHE');
      }}>Niche 맞추기로 이동</button>}
      {value && step === 'NICHE' && <button type="button" className="ghost" onClick={() => setStep('HULL')}>Hull 맞추기로 돌아가기</button>}
      {value && step === 'NICHE' && <button type="button" className="primary" disabled={!canConfirm} onClick={() => {
        if (!canConfirm) return;
        const confirmed = { ...value, confirmed: true };
        onChange(confirmed);
        onNext();
      }}>선박 위치도 설정 완료</button>}
    </footer>
  </section>;
}
