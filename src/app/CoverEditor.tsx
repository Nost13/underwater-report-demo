import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react';
import type { ReportSection } from '../domain/types';
import { COVER_PHOTO_SIZE, coverSourceRect } from '../browser/coverImage';
import { coverScopeGroups, linkedCoverValues, syncGeneratedCoverScope, type CoverInfo } from './coverInfo';
import type { ReportInfo } from './reportInfo';
import type { OpenPhotoLibrary } from './PhotoLibraryPicker';

interface CoverEditorProps {
  onOpenLibrary?: OpenPhotoLibrary;
  value: CoverInfo;
  onChange(value: CoverInfo): void;
  reportInfo: ReportInfo;
  sections: ReportSection[];
  onBack(): void;
  onNext(): void;
  onEditReportInfo(): void;
}

function createPhotoUrlStore(file: File | null) {
  let url: string | null = null;
  return {
    getSnapshot: () => url,
    subscribe: (onChange: () => void) => {
      if (!file) return () => {};
      // Allocate only on subscription, after commit. A discarded render owns
      // no URL, and StrictMode's resubscription receives a fresh live URL.
      const ownedUrl = URL.createObjectURL(file);
      url = ownedUrl;
      onChange();
      return () => { URL.revokeObjectURL(ownedUrl); if (url === ownedUrl) url = null; };
    },
  };
}

function usePhotoUrl(file: File | null): string | null {
  const store = useMemo(() => createPhotoUrlStore(file), [file]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}

export function CoverEditor({ value, onChange, reportInfo, sections, onBack, onNext, onEditReportInfo, onOpenLibrary }: CoverEditorProps) {
  const url = usePhotoUrl(value.photoFile);
  const [dimensions, setDimensions] = useState<{ url: string; width: number; height: number } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const linked = linkedCoverValues(reportInfo);
  const scope = syncGeneratedCoverScope(value, sections);
  const metadata = [
    ['REPORT NO', linked.reportNo], ['VESSEL NAME', linked.vesselName],
    ['IMO NUMBER', linked.imoNumber], ['CALL SIGN', linked.callSign], ['OWNER/CLIENT', linked.ownerClient],
    ['OPERATION DATE', linked.operationDate], ['LOCATION', linked.location],
  ];
  const imageStyle: CSSProperties = { objectFit: 'cover', transform: `scale(${value.crop.zoom})` };
  if (dimensions && dimensions.url === url) {
    const rect = coverSourceRect(dimensions.width, dimensions.height, value.crop, COVER_PHOTO_SIZE.width, COVER_PHOTO_SIZE.height);
    // Object position and transform origin share the clamped position so zoom
    // exposes the same source rectangle as the canvas renderer.
    const x = dimensions.width === rect.width ? 50 : rect.x / (dimensions.width - rect.width) * 100;
    const y = dimensions.height === rect.height ? 50 : rect.y / (dimensions.height - rect.height) * 100;
    imageStyle.objectPosition = `${x}% ${y}%`;
    imageStyle.transformOrigin = `${x}% ${y}%`;
  }
  const pan = (event: PointerEvent<HTMLDivElement>) => {
    const activeDrag = dragging.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - activeDrag.clientX;
    const deltaY = event.clientY - activeDrag.clientY;
    activeDrag.clientX = event.clientX;
    activeDrag.clientY = event.clientY;
    if (!bounds.width || !bounds.height) return;
    // Moving the visible image right/down means shifting the saved source crop
    // left/up.
    const nextCrop = {
      ...value.crop,
      focusX: Math.max(0, Math.min(1, value.crop.focusX - deltaX / bounds.width)),
      focusY: Math.max(0, Math.min(1, value.crop.focusY - deltaY / bounds.height)),
    };
    onChange({ ...scope, crop: nextCrop });
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!value.photoFile || event.button !== 0 || event.isPrimary === false || dragging.current) return;
    dragging.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current?.pointerId !== event.pointerId) return;
    dragging.current = null;
    setIsDragging(false);
  };
  return <section className="workspace cover-workspace">
    <header className="page-heading"><div><p className="step-kicker">STEP 03</p><h2>Cover</h2><p>표지 사진과 작업 내용을 확인하세요.</p></div></header>
    <div className="cover-editor-grid">
      <div className="panel cover-controls">
        <h3>표지 편집</h3>
        <label className="field"><span>표지 사진</span><input type="file" accept="image/*" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onChange({ ...scope, photoFile: file, crop: { focusX: .5, focusY: .5, zoom: 1 } });
          event.currentTarget.value = '';
        }} /></label>
        <button className="ghost" disabled={!value.photoFile} onClick={() => onChange({ ...scope, photoFile: null })}>사진 비우기</button>
        {onOpenLibrary&&<button type="button" onClick={()=>onOpenLibrary('커버 사진 선택',1,(photos)=>onChange({...scope,photoFile:photos[0].file,crop:{focusX:.5,focusY:.5,zoom:1}}))}>불러온 사진 보관함에서 선택</button>}
        <label className="field"><span>사진 확대</span><input type="range" min="1" max="3" step=".05" value={value.crop.zoom} disabled={!value.photoFile} onChange={(event) => onChange({ ...scope, crop: { ...value.crop, zoom: Number(event.target.value) } })} /></label>
        <p className="cover-help">사진 위를 드래그해 초점을 조정하세요. 방향키로도 조정할 수 있습니다.</p>
        <label className="field"><span>Date of Issue</span><input type="date" value={value.issueDate} onChange={(event) => onChange({ ...scope, issueDate: event.target.value })} /></label>
        <fieldset className="cover-performers"><legend>작업별 수행 주체</legend>{coverScopeGroups(sections).map(group=><label className="field" key={group.key}><span>{group.title}</span><select aria-label={`${group.title} 수행 주체`} value={scope.scopePerformers?.[group.key]??''} onChange={event=>{
          const next={...scope,scopePerformers:{...scope.scopePerformers,[group.key]:event.target.value}};
          onChange(syncGeneratedCoverScope(next,sections));
        }}><option value="">선택 필요</option><option value="ROV">ROV</option><option value="DIVER">Diver (다이버)</option><option value="BOTH">ROV + Diver (병행)</option></select></label>)}<p>수행 주체를 선택하면 설명을 자동 작성합니다. 직접 편집한 문구는 유지되며, 아래 ‘자동 내용 다시 적용’으로 갱신할 수 있습니다.</p></fieldset>
        <label className="field"><span>Scope of Work title</span><textarea rows={2} value={scope.scopeTitle} onChange={(event) => onChange({ ...scope, scopeTitle: event.target.value, scopeMode: 'MANUAL' })} /></label>
        <label className="field"><span>Scope of Work description</span><textarea rows={4} value={scope.scopeDescription} onChange={(event) => onChange({ ...scope, scopeDescription: event.target.value, scopeMode: 'MANUAL' })} /></label>
        <div className="cover-scope-actions"><span>{scope.scopeMode === 'AUTO' ? '자동 생성' : '직접 편집'}</span><button className="ghost" onClick={() => onChange(syncGeneratedCoverScope(value, sections, true))}>자동 내용 다시 적용</button></div>
        <div className="cover-linked"><h3>연결된 보고서 정보</h3><dl>{metadata.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl><button className="text-button" onClick={onEditReportInfo}>Report Information 수정</button></div>
      </div>
      <div className="cover-preview-scroll">
        <article className="cover-a4" aria-label="A4 표지 미리보기">
          <header className="cover-paper-header"><strong>UNDERWATER SERVICE REPORT</strong><dl><div><dt>REPORT NO</dt><dd>{linked.reportNo}</dd></div><div><dt>DATE OF ISSUE</dt><dd>{value.issueDate}</dd></div></dl></header>
          <div className="cover-photo-banner" aria-label="사진 초점 조정" role="group" tabIndex={value.photoFile ? 0 : -1}
            style={{ aspectRatio: `${COVER_PHOTO_SIZE.width} / ${COVER_PHOTO_SIZE.height}`, cursor: value.photoFile ? isDragging ? 'grabbing' : 'grab' : 'auto' }}
            onPointerDown={startDrag}
            onPointerMove={pan}
            onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
            onKeyDown={(event) => {
              const movement: Record<string, [number, number]> = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] };
              const delta = movement[event.key];
              if (!delta || !value.photoFile) return;
              event.preventDefault();
              onChange({ ...scope, crop: { ...value.crop, focusX: Math.max(0, Math.min(1, value.crop.focusX + delta[0])), focusY: Math.max(0, Math.min(1, value.crop.focusY + delta[1])) } });
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Local blob URLs and natural dimensions are required for interactive cropping. */}
            {url && failedUrl !== url ? <img src={url} alt="표지 사진 미리보기" draggable={false} style={imageStyle} onLoad={(event) => setDimensions({ url, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailedUrl(url)} /> : <span>{url ? '사진을 읽을 수 없습니다. 다른 사진을 선택하세요.' : '표지 사진을 선택하세요'}</span>}
          </div>
          <dl className="cover-paper-metadata">{metadata.slice(1).map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
          <section className="cover-paper-scope"><h3>SCOPE OF WORK</h3><h4>{scope.scopeTitle}</h4><p>{scope.scopeDescription}</p></section>
          <footer className="cover-paper-footer">UNDERWATER SERVICE REPORT</footer>
        </article>
      </div>
    </div>
    <div className="page-actions"><button className="ghost" onClick={onBack}>이전</button><button className="primary" onClick={onNext}>다음</button></div>
  </section>;
}
