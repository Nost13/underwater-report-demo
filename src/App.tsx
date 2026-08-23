'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createDemoPhotos, COMPONENT_OPTIONS, DEMO_VESSELS, SERVICES } from './app/demoData';
import { initialReportState, reportReducer, selectedPages, type ReportState } from './app/reportState';
import { createSectionTree, folderRelativePath, pickDirectory, scanImages, type DirectoryHandleLike } from './browser/directory';
import { ThumbnailPool, type ThumbnailLease } from './browser/images';
import { createCaption, matchPhotoPath, phaseIndexForPhoto } from './domain/photos';
import { checkReport } from './domain/qa';
import {
  appendTargetService,
  applyServicePreset,
  createGeneralTargets,
  createNicheTargets,
  createReportSections,
  GENERAL_SIDES,
  GENERAL_ZONES,
  removeTargetService,
  replaceTargetService,
} from './domain/structure';
import type { ExportInput } from './pdf/exportReport';
import type {
  ConditionClass,
  ConditionRating,
  NicheType,
  Phase,
  PhotoData,
  ReportSection,
  ScopeTarget,
  ServiceKind,
} from './domain/types';

const thumbnails = new ThumbnailPool();
const stages = ['Vessel / Scope', '사진 입력', 'Report Input', 'Check / Preview', 'PDF'];

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function PhotoThumb({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const hostRef = useRef<HTMLDivElement>(null);
  const leaseRef = useRef<ThumbnailLease | null>(null);

  useEffect(() => {
    if (visible || !hostRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '200px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    thumbnails.acquire(file).then((nextLease) => {
      if (!mounted) return nextLease.release();
      leaseRef.current = nextLease;
      setUrl(nextLease.url);
    }).catch(() => {
      if (mounted) setUrl(null);
    });
    return () => {
      mounted = false;
      leaseRef.current?.release();
      leaseRef.current = null;
    };
  }, [file, visible]);

  const releaseLoadedUrl = () => {
    leaseRef.current?.release();
    leaseRef.current = null;
  };

  return <div className="photo-thumb-content" ref={hostRef}>{url ? (
    // Object URLs reference local files and cannot use Next's remote image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" onLoad={releaseLoadedUrl} onError={releaseLoadedUrl} />
  ) : <div className="thumb-loading">IMG</div>}</div>;
}

function StageRail({ active, onMove }: { active: number; onMove: (stage: number) => void }) {
  return <nav className="stage-rail" aria-label="Report stages">
    <div className="brand-mark">UW</div>
    <div className="stage-list">{stages.map((label, index) => <button
      type="button"
      key={label}
      className={index === active ? 'stage-item active' : index < active ? 'stage-item done' : 'stage-item'}
      onClick={() => onMove(index)}
    ><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}</div>
    <div className="local-only"><span />LOCAL ONLY</div>
  </nav>;
}

function SectionLabel({ section }: { section: ReportSection }) {
  const detail = [section.side, section.unit ? `UNIT ${String(section.unit).padStart(2, '0')}` : null]
    .filter(Boolean).join(' · ') || section.area;
  return <><strong>{section.component}</strong><span>{section.service} · {detail}</span></>;
}

interface NicheDraft { component: string; type: NicheType; quantity: number }
interface NicheGroup extends NicheDraft { id: string; targets: ScopeTarget[] }

function photoRecords(
  files: Array<{ file: File; relativePath: string }>,
  sections: ReportSection[],
  autoMatch: boolean,
  orderStart: number,
): PhotoData[] {
  return files.map((item, index) => {
    const match = autoMatch ? matchPhotoPath(item.relativePath, sections) : null;
    return {
      id: newId(),
      sectionId: match?.sectionId ?? null,
      phase: match?.phase ?? null,
      file: item.file,
      reportUse: true,
      order: orderStart + index,
      relativePath: item.relativePath,
    };
  });
}

type PdfExporter = (input: ExportInput) => Promise<{ skipped: string[] }>;

const loadPdfExporter: PdfExporter = async (input) => {
  const { exportReportPdf } = await import('./pdf/exportReport');
  return exportReportPdf(input);
};

export default function App({ exporter = loadPdfExporter }: { exporter?: PdfExporter }) {
  const [stage, setStage] = useState(0);
  const [imo, setImo] = useState('9876543');
  const [vessel, setVessel] = useState<(typeof DEMO_VESSELS)[number] | null>(null);
  const [activeService, setActiveService] = useState<ServiceKind>('CLEANING');
  const [generalTargets, setGeneralTargets] = useState<ScopeTarget[]>(() => createGeneralTargets());
  const [generalUndo, setGeneralUndo] = useState<ScopeTarget[] | null>(null);
  const [nicheDraft, setNicheDraft] = useState<NicheDraft>({ component: 'Sea Chest', type: 'SIDE_QUANTITY', quantity: 2 });
  const [nicheItems, setNicheItems] = useState<NicheGroup[]>([]);
  const [scopeMeta, setScopeMeta] = useState<{ vesselName: string; service: ServiceKind } | null>(null);
  const [report, dispatch] = useReducer(reportReducer, initialReportState);
  const [folder, setFolder] = useState<DirectoryHandleLike | null>(null);
  const [status, setStatus] = useState('사진 폴더를 선택하거나 샘플 사진으로 흐름을 확인하세요.');
  const [search, setSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const fallbackInput = useRef<HTMLInputElement>(null);

  const activeSection = report.sections.find((item) => item.id === report.focusedSectionId) ?? report.sections[0];
  const activePhotos = activeSection ? report.photos.filter((photo) => photo.sectionId === activeSection.id) : [];
  const unmatched = report.photos.filter((photo) => !photo.sectionId || !photo.phase);
  const pages = selectedPages({ ...report, focusedSectionId: activeSection?.id ?? null });
  const issues = useMemo(() => checkReport(report.sections, report.photos), [report.sections, report.photos]);
  const sectionList = report.sections.filter((section) => section.id.includes(search.trim().toUpperCase()));
  const safePreviewPage = Math.min(previewPage, Math.max(0, pages.length - 1));
  const draftTargets = [...generalTargets, ...nicheItems.flatMap((item) => item.targets)];
  const draftSections = createReportSections(draftTargets);
  const serviceSummary = [...new Set(
    (report.sections.length ? report.sections : draftSections).map((section) => section.service),
  )].join(' + ') || activeService;

  const buildScope = () => {
    const sections = createReportSections(draftTargets);
    dispatch({ type: 'SET_SCOPE', sections });
    setScopeMeta({ vesselName: vessel?.name ?? 'UNDERWATER REPORT', service: activeService });
    setPreviewPage(0);
  };

  const resetScope = () => {
    dispatch({ type: 'SET_SCOPE', sections: [] });
    setScopeMeta(null);
    setFolder(null);
    setPreviewPage(0);
    setStatus('사진 폴더를 선택하거나 샘플 사진으로 흐름을 확인하세요.');
  };

  const addNiche = () => setNicheItems((items) => {
    const id = `${nicheDraft.component}-${Date.now()}-${items.length}`;
    const targets = createNicheTargets({ ...nicheDraft, service: activeService });
    return [...items, { ...nicheDraft, id, targets }];
  });

  const changeGeneral = (update: (targets: ScopeTarget[]) => ScopeTarget[]) => {
    setGeneralTargets((current) => {
      const next = update(current);
      const changed = next.some((target, index) => (
        target.services.join('|') !== current[index]?.services.join('|')
      ));
      if (!changed) return current;
      setGeneralUndo(current);
      return next;
    });
  };

  const replaceGeneral = (targetId: string) => changeGeneral((targets) =>
    targets.map((target) => target.id === targetId
      ? replaceTargetService(target, activeService)
      : target),
  );

  const appendGeneral = (targetId: string) => changeGeneral((targets) =>
    targets.map((target) => target.id === targetId
      ? appendTargetService(target, activeService)
      : target),
  );

  const removeGeneral = (targetId: string, service: ServiceKind) => changeGeneral((targets) =>
    targets.map((target) => target.id === targetId
      ? removeTargetService(target, service)
      : target),
  );

  const applyGeneral = (side?: ScopeTarget['side']) => changeGeneral((targets) =>
    applyServicePreset(targets, activeService, (target) => !side || target.side === side),
  );

  const clearGeneral = () => changeGeneral((targets) =>
    targets.map((target) => ({ ...target, services: [] })),
  );

  const changeNicheTarget = (
    groupId: string,
    targetId: string,
    update: (target: ScopeTarget) => ScopeTarget,
  ) => setNicheItems((items) => items.map((item) => item.id === groupId
    ? {
      ...item,
      targets: item.targets.map((target) => target.id === targetId ? update(target) : target),
    }
    : item));

  const createFolders = async () => {
    if (!folder) return;
    try {
      await createSectionTree(folder, report.sections);
      setStatus(`${report.sections.length}개 Section의 폴더를 만들었습니다. 사진을 넣은 뒤 다시 불러오세요.`);
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'FILE_SYSTEM_ACCESS_UNAVAILABLE'
        ? '폴더 구조 생성은 현재 Chrome/Edge의 localhost 환경에서 사용할 수 있습니다.'
        : '폴더 생성을 취소했거나 권한을 받지 못했습니다.');
    }
  };

  const importDirectory = async (selected: DirectoryHandleLike, autoMatch: boolean) => {
    const scanned = await scanImages(selected);
    const photos = photoRecords(scanned, report.sections, autoMatch, report.photos.length + 1);
    dispatch({ type: 'IMPORT_PHOTOS', photos });
    const matched = photos.filter((photo) => photo.sectionId).length;
    setStatus(`${photos.length}장 불러옴 · ${matched}장 자동 매칭 · ${photos.length - matched}장 UNMATCHED`);
  };

  const reloadFolder = async () => {
    if (!folder) return;
    try {
      await importDirectory(folder, true);
    } catch {
      setStatus('폴더를 다시 읽지 못했습니다. 권한을 확인하고 폴더를 다시 선택하세요.');
    }
  };

  const selectPhotoFolder = async () => {
    try {
      const selected = await pickDirectory('readwrite');
      setFolder(selected);
      setStatus(`“${selected.name}” 폴더를 선택했습니다. 사진을 불러오거나 표준 구조를 생성하세요.`);
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_SYSTEM_ACCESS_UNAVAILABLE') fallbackInput.current?.click();
      else setStatus('폴더 선택을 취소했습니다.');
    }
  };

  const importFallback = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files)
      .filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name))
      .map((file) => ({ file, relativePath: folderRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) }));
    const photos = photoRecords(images, report.sections, true, report.photos.length + 1);
    dispatch({ type: 'IMPORT_PHOTOS', photos });
    const matched = photos.filter((photo) => photo.sectionId).length;
    setStatus(`${photos.length}장 불러옴 · ${matched}장 자동 매칭 · ${photos.length - matched}장 UNMATCHED`);
  };

  const loadDemo = async () => {
    if (!activeSection) return;
    setStatus('샘플 이미지를 만드는 중입니다…');
    dispatch({ type: 'IMPORT_PHOTOS', photos: await createDemoPhotos(activeSection) });
    setStatus(`${activeSection.id}에 샘플 사진 7장을 배정했습니다.`);
  };

  const focusIssue = (sectionId: string | null) => {
    if (sectionId) dispatch({ type: 'FOCUS_SECTION', sectionId });
    setStage(2);
  };

  const runExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setStatus('사진을 순차 리사이즈하여 PDF를 만드는 중입니다…');
    try {
      const result = await exporter({
        vesselName: scopeMeta?.vesselName ?? 'UNDERWATER REPORT',
        service: scopeMeta?.service ?? activeService,
        sections: report.sections,
        photos: report.photos,
      });
      setStatus(result.skipped.length
        ? `PDF 완료 · 읽을 수 없어 제외된 사진: ${result.skipped.join(', ')}`
        : 'PDF 다운로드가 완료되었습니다.');
    } catch {
      setStatus('PDF를 만들지 못했습니다. 사진 형식과 브라우저 다운로드 권한을 확인하세요.');
    } finally {
      setIsExporting(false);
    }
  };

  return <main className="app-shell">
    <input {...{ webkitdirectory: '' }} ref={fallbackInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => importFallback(event.target.files)} />
    <StageRail active={stage} onMove={(next) => { if (report.sections.length || next === 0) setStage(next); }} />
    <section className="app-main">
      <header className="topbar"><div><p className="eyebrow">UNDERWATER SERVICE REPORT</p><h1>{scopeMeta?.vesselName ?? vessel?.name ?? 'New report'}</h1></div><div className="top-meta"><span>{serviceSummary}</span><span>{report.sections.length} SECTIONS</span><span>{report.photos.length} PHOTOS</span></div></header>

      {stage === 0 && <VesselScope
        imo={imo} setImo={setImo} vessel={vessel} activeService={activeService} setActiveService={setActiveService}
        generalTargets={generalTargets} generalUndo={generalUndo}
        onGeneralReplace={replaceGeneral} onGeneralAppend={appendGeneral} onGeneralRemove={removeGeneral}
        onGeneralPreset={applyGeneral} onGeneralClear={clearGeneral}
        onGeneralUndo={() => { if (generalUndo) { setGeneralTargets(generalUndo); setGeneralUndo(null); } }}
        nicheDraft={nicheDraft} setNicheDraft={setNicheDraft} nicheItems={nicheItems}
        addNiche={addNiche} removeNiche={(id) => setNicheItems((items) => items.filter((item) => item.id !== id))}
        onNicheReplace={(groupId, targetId) => changeNicheTarget(groupId, targetId, (target) => replaceTargetService(target, activeService))}
        onNicheAppend={(groupId, targetId) => changeNicheTarget(groupId, targetId, (target) => appendTargetService(target, activeService))}
        onNicheRemove={(groupId, targetId, service) => changeNicheTarget(groupId, targetId, (target) => removeTargetService(target, service))}
        onLookup={() => setVessel(DEMO_VESSELS.find((item) => item.imo === imo.trim()) ?? null)}
        onBuild={buildScope} onReset={resetScope} sectionCount={report.sections.length} draftSections={draftSections}
        onPhotos={() => setStage(1)} onInput={() => setStage(2)}
      />}

      {stage === 1 && <PhotoSource
        photoCount={report.photos.length} status={status} hasFolder={Boolean(folder)}
        onSelect={selectPhotoFolder} onCreate={createFolders} onLoad={reloadFolder}
        onDemo={loadDemo} onBack={() => setStage(0)} onNext={() => setStage(2)}
      />}

      {stage === 2 && activeSection && <ReportInput
        report={report} activeSection={activeSection} activePhotos={activePhotos}
        sectionList={sectionList} search={search} setSearch={setSearch} unmatched={unmatched}
        pages={pages} issueCount={issues.length}
        dispatch={dispatch} onOpen={selectPhotoFolder} onBack={() => setStage(1)} onNext={() => setStage(3)}
      />}

      {stage === 3 && activeSection && <CheckPreview
        report={report} activeSection={activeSection} pages={pages} issues={issues}
        previewPage={safePreviewPage} onPage={setPreviewPage}
        onIssue={focusIssue} onSection={(sectionId) => dispatch({ type: 'FOCUS_SECTION', sectionId })}
        onNext={() => setStage(4)}
      />}

      {stage === 4 && activeSection && <ExportScreen
        vesselName={scopeMeta?.vesselName ?? 'UNDERWATER REPORT'} report={report} status={status}
        onBack={() => setStage(3)} onExport={runExport} busy={isExporting}
      />}
    </section>
  </main>;
}

const targetLabel = (target: ScopeTarget) => [
  target.component,
  target.side,
  target.unit ? `UNIT ${String(target.unit).padStart(2, '0')}` : null,
].filter(Boolean).join(' ');

interface TargetCellProps {
  target: ScopeTarget;
  activeService: ServiceKind;
  locked: boolean;
  compact?: boolean;
  onReplace: () => void;
  onAppend: () => void;
  onRemove: (service: ServiceKind) => void;
}

function TargetCell(props: TargetCellProps) {
  const label = targetLabel(props.target);
  return <div className={props.target.services.length ? 'target-cell assigned' : 'target-cell'}>
    <button type="button" className="target-main" disabled={props.locked} aria-label={`${label} 작업 배정`} onClick={props.onReplace}>
      <b>{props.compact ? props.target.side : label}</b>
      <small>{props.target.services.length ? '클릭하여 교체' : '미배정'}</small>
    </button>
    <div className="target-status" aria-label={`${label} 배정 상태`}>
      {props.target.services.length ? props.target.services.map((service) => <button
        type="button"
        key={service}
        disabled={props.locked}
        className={`service-chip ${service.toLowerCase()}`}
        aria-label={`${label} ${service} 제거`}
        onClick={() => props.onRemove(service)}
      >{service}<span>×</span></button>) : <span>—</span>}
    </div>
    <button
      type="button"
      className="target-add"
      aria-label={`${label} 작업 추가`}
      disabled={props.locked || props.target.services.length === 0 || props.target.services.includes(props.activeService)}
      onClick={props.onAppend}
    >＋</button>
  </div>;
}

interface VesselScopeProps {
  imo: string; setImo: (value: string) => void; vessel: (typeof DEMO_VESSELS)[number] | null;
  activeService: ServiceKind; setActiveService: (value: ServiceKind) => void;
  generalTargets: ScopeTarget[]; generalUndo: ScopeTarget[] | null;
  onGeneralReplace: (targetId: string) => void; onGeneralAppend: (targetId: string) => void;
  onGeneralRemove: (targetId: string, service: ServiceKind) => void;
  onGeneralPreset: (side?: ScopeTarget['side']) => void; onGeneralClear: () => void; onGeneralUndo: () => void;
  nicheDraft: NicheDraft; setNicheDraft: (value: NicheDraft) => void; nicheItems: NicheGroup[];
  addNiche: () => void; removeNiche: (id: string) => void;
  onNicheReplace: (groupId: string, targetId: string) => void;
  onNicheAppend: (groupId: string, targetId: string) => void;
  onNicheRemove: (groupId: string, targetId: string, service: ServiceKind) => void;
  onLookup: () => void; onBuild: () => void; onReset: () => void;
  sectionCount: number; draftSections: ReportSection[]; onPhotos: () => void; onInput: () => void;
}

function VesselScope(props: VesselScopeProps) {
  const locked = props.sectionCount > 0;
  const serviceCounts = SERVICES.map((item) => ({
    ...item,
    count: props.draftSections.filter((section) => section.service === item.value).length,
  })).filter((item) => item.count > 0);
  const unassignedGeneral = props.generalTargets.filter((target) => target.services.length === 0).length;

  return <div className="workspace wide">
    <div className="page-heading"><div><p className="step-kicker">STEP 01</p><h2>Vessel / Scope</h2><p>Vessel DB는 선박 확인에만 사용됩니다. 보고서와 사진은 이 브라우저 탭에만 있습니다.</p></div><span className="privacy-chip">서버 저장 없음</span></div>
    <div className="scope-grid">
      <section className="panel vessel-panel"><div className="panel-title"><span>01</span><div><h3>Vessel 확인</h3><p>Demo Vessel DB</p></div></div>
        <label className="field"><span>IMO number</span><div className="input-action"><input aria-label="IMO number" value={props.imo} disabled={locked} onChange={(event) => props.setImo(event.target.value)} /><button type="button" disabled={locked} onClick={props.onLookup}>Vessel 확인</button></div></label>
        {props.vessel ? <div className="vessel-card"><div className="vessel-icon">MV</div><div><strong>{props.vessel.name}</strong><span>IMO {props.vessel.imo} · {props.vessel.type}</span></div><dl><div><dt>CLASS</dt><dd>{props.vessel.classSociety}</dd></div><div><dt>FLAG</dt><dd>{props.vessel.flag}</dd></div></dl></div> : <div className="empty-note">IMO 9876543 또는 9234567을 확인할 수 있습니다.</div>}
      </section>
      <section className="panel scope-panel"><div className="panel-title"><span>02</span><div><h3>Service / Scope</h3><p>작업을 선택하고 필요한 Section만 클릭</p></div></div>
        <div className="service-brush" aria-label="Service 작업 선택">{SERVICES.map((item) => <button
          type="button"
          key={item.value}
          disabled={locked}
          aria-label={`${item.label} 작업 선택`}
          aria-pressed={props.activeService === item.value}
          className={props.activeService === item.value ? `active ${item.value.toLowerCase()}` : ''}
          onClick={() => props.setActiveService(item.value)}
        >{item.label}</button>)}</div>
        <div className="phase-rule"><b>{props.activeService === 'INSPECTION' ? 'CURRENT' : 'BEFORE  →  AFTER'}</b><span>{props.activeService === 'INSPECTION' ? 'Inspection 단일 phase' : 'AFTER 기본값 CLEAN / R0'}</span></div>

        <section className="general-builder"><div className="mini-heading"><b>GENERAL</b><span>15 AVAILABLE · 필요한 곳만 배정</span></div>
          <div className="preset-row"><button type="button" disabled={locked} onClick={() => props.onGeneralPreset()}>전체 적용</button>{GENERAL_SIDES.map((side) => <button type="button" disabled={locked} key={side} onClick={() => props.onGeneralPreset(side)}>{side} 적용</button>)}<button type="button" disabled={locked} onClick={props.onGeneralClear}>모두 해제</button><button type="button" disabled={locked || !props.generalUndo} onClick={props.onGeneralUndo}>실행 취소</button></div>
          <div className="general-matrix"><div className="matrix-corner">ZONE</div>{GENERAL_SIDES.map((side) => <b key={side}>{side}</b>)}{GENERAL_ZONES.map((zone) => <div className="general-matrix-row" key={zone}><strong>{zone}</strong>{GENERAL_SIDES.map((side) => { const target = props.generalTargets.find((item) => item.component === zone && item.side === side)!; return <TargetCell key={target.id} target={target} activeService={props.activeService} locked={locked} compact onReplace={() => props.onGeneralReplace(target.id)} onAppend={() => props.onGeneralAppend(target.id)} onRemove={(service) => props.onGeneralRemove(target.id, service)} />; })}</div>)}</div>
        </section>

        <section className="niche-builder"><div className="mini-heading"><b>NICHE</b><span>추가 시 현재 Service 전체 적용</span></div><div className="niche-controls">
          <select aria-label="Niche component" value={props.nicheDraft.component} disabled={locked} onChange={(event) => { const option = COMPONENT_OPTIONS.find((item) => item.name === event.target.value)!; props.setNicheDraft({ component: option.name, type: option.defaultType, quantity: option.defaultQuantity }); }}>{COMPONENT_OPTIONS.map((item) => <option key={item.name}>{item.name}</option>)}</select>
          <select aria-label="Niche type" value={props.nicheDraft.type} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, type: event.target.value as NicheType })}>{['SINGLE', 'SIDE', 'QUANTITY', 'SIDE_QUANTITY'].map((type) => <option key={type}>{type}</option>)}</select>
          <input aria-label="Quantity" type="number" min="1" max="12" value={props.nicheDraft.quantity} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Number(event.target.value) })} />
          <button type="button" className="icon-button" aria-label="Niche 추가" disabled={locked} onClick={props.addNiche}>＋</button>
        </div>{props.nicheItems.map((item) => <article className="niche-group" key={item.id}><header><div><b>{item.component}</b><span>{item.type}{item.type.includes('QUANTITY') ? ` ×${item.quantity}` : ''}</span></div><button type="button" disabled={locked} aria-label={`${item.component} 삭제`} onClick={() => props.removeNiche(item.id)}>×</button></header><div className="niche-targets">{item.targets.map((target) => <TargetCell key={target.id} target={target} activeService={props.activeService} locked={locked} onReplace={() => props.onNicheReplace(item.id, target.id)} onAppend={() => props.onNicheAppend(item.id, target.id)} onRemove={(service) => props.onNicheRemove(item.id, target.id, service)} />)}</div></article>)}<p className="side-note">Side 없음: Propeller Blade, Rope Guard, Boss Cap, Transducer, Stern Frame</p></section>

        <div className="scope-summary" aria-label="Scope 배정 요약"><div>{serviceCounts.map((item) => <span key={item.value} className={item.value.toLowerCase()}>{item.value} {item.count}</span>)}</div><em>GENERAL 미배정 {unassignedGeneral}</em></div>
        <button type="button" className="primary full" disabled={!props.vessel || props.draftSections.length === 0} onClick={props.onBuild}>Scope 만들기</button>
        {locked && <div className="scope-ready"><b>총 {props.sectionCount} sections</b><em>Condition과 phase가 준비되었습니다.</em><button type="button" className="text-button" onClick={props.onReset}>Scope 초기화</button></div>}
      </section>
    </div>
    <div className="actionbar"><span>{props.sectionCount ? 'Scope가 준비되었습니다.' : 'Vessel 확인 후 Section에 작업을 배정하세요.'}</span><div><button type="button" className="ghost" disabled={!props.sectionCount} onClick={props.onInput}>Report Input 바로가기</button><button type="button" className="primary" disabled={!props.sectionCount} onClick={props.onPhotos}>사진 입력으로</button></div></div>
  </div>;
}

interface PhotoSourceProps {
  photoCount: number; status: string; hasFolder: boolean; onSelect: () => void; onCreate: () => void; onLoad: () => void;
  onDemo: () => void; onBack: () => void; onNext: () => void;
}

function PhotoSource(props: PhotoSourceProps) {
  return <div className="workspace wide"><div className="page-heading"><div><p className="step-kicker">STEP 02</p><h2>사진 폴더</h2><p>원본은 로컬 File 참조로만 유지하며 서버로 전송하지 않습니다.</p></div><span className="privacy-chip">{props.photoCount} PHOTOS</span></div>
    <section className="method-card recommended photo-folder-card"><div className="method-top"><span>02</span><em>ONE FLOW</em></div><h3>사진 폴더 선택</h3><p>기존 사진 폴더와 새 OneDrive 폴더 모두 같은 방식으로 선택합니다. 정확한 경로는 자동 매칭하고, 맞지 않는 사진만 UNMATCHED로 남깁니다.</p><div className="folder-tree"><code>SECTION / COMPONENT</code><code>└ SIDE <small>필요시</small></code><code>&nbsp;&nbsp;└ UNIT <small>수량형</small></code><code>&nbsp;&nbsp;&nbsp;&nbsp;└ BEFORE / AFTER 또는 CURRENT</code></div><div className="photo-folder-actions"><button type="button" className="primary" onClick={props.onSelect}>사진 폴더 선택</button><button type="button" className="ghost" disabled={!props.hasFolder} onClick={props.onCreate}>표준 폴더 구조 생성</button><button type="button" className="ghost" disabled={!props.hasFolder} onClick={props.onLoad}>사진 불러오기</button></div><p className="folder-help">새 작업이면 폴더 구조를 먼저 만들고, 기존 폴더면 바로 사진을 불러오세요.</p></section>
    <section className="demo-strip"><div><b>빠른 동작 확인</b><span>선택된 첫 Section에 BEFORE 3장 + AFTER 4장을 생성합니다.</span></div><button type="button" className="ghost" onClick={props.onDemo}>샘플 사진 7장 불러오기</button></section>
    <div className="status-line"><span className="status-dot" />{props.status}</div><div className="actionbar"><button type="button" className="text-button" onClick={props.onBack}>← Vessel / Scope</button><button type="button" className="primary" onClick={props.onNext}>Report Input으로</button></div>
  </div>;
}

interface ReportInputProps {
  report: ReportState; activeSection: ReportSection; activePhotos: PhotoData[]; sectionList: ReportSection[];
  search: string; setSearch: (value: string) => void; unmatched: PhotoData[]; pages: ReturnType<typeof selectedPages>;
  issueCount: number; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; onOpen: () => void;
  onBack: () => void; onNext: () => void;
}

function ReportInput(props: ReportInputProps) {
  return <div className="report-workspace"><aside className="section-sidebar"><div className="sidebar-head"><p className="step-kicker">STEP 03</p><h2>Sections</h2><span>{props.report.sections.length}</span></div><input className="section-search" aria-label="Section search" placeholder="Section 검색" value={props.search} onChange={(event) => props.setSearch(event.target.value)} /><div className="section-scroll">{props.sectionList.map((section) => { const count = props.report.photos.filter((photo) => photo.sectionId === section.id && photo.reportUse).length; return <button type="button" key={section.id} className={props.activeSection.id === section.id ? 'section-row active' : 'section-row'} onClick={() => props.dispatch({ type: 'FOCUS_SECTION', sectionId: section.id })}><span className="section-area">{section.area[0]}</span><span><SectionLabel section={section} /></span><em>{count}</em></button>; })}</div></aside>
    <section className="input-canvas"><div className="input-heading"><div><p className="eyebrow">{props.activeSection.area}</p><h2>Report Input</h2><span>{props.activeSection.id}</span></div><div className="page-badge"><b>{props.pages.length}P</b><span>{props.activePhotos.filter((photo) => photo.reportUse).length} Report Use</span></div></div>
      <div className={props.activeSection.phases.length === 1 ? 'phase-grid single' : 'phase-grid'}>{props.activeSection.phases.map((phase) => <PhasePanel key={phase} phase={phase} section={props.activeSection} photos={props.activePhotos.filter((photo) => photo.phase === phase)} dispatch={props.dispatch} />)}</div>
    </section>
    <aside className="unmatched-panel" id="unmatched"><div className="unmatched-head"><div><p className="eyebrow">MANUAL ASSIGN</p><h3>UNMATCHED</h3></div><span>{props.unmatched.length}</span></div><p className="unmatched-help">확실하지 않은 경로는 추측하지 않습니다.</p><div className="unmatched-list">{props.unmatched.length ? props.unmatched.map((photo) => <UnmatchedCard key={photo.id} photo={photo} sections={props.report.sections} onAssign={(sectionId, phase) => props.dispatch({ type: 'ASSIGN_PHOTO', photoId: photo.id, sectionId, phase })} />) : <div className="unmatched-empty"><b>0</b><span>모든 사진이 배정되었습니다.</span></div>}</div><button type="button" className="ghost full" onClick={props.onOpen}>사진 더 불러오기</button></aside>
    <div className="input-footer"><button type="button" className="text-button" onClick={props.onBack}>← 사진 입력</button><div><span>Report Check {props.issueCount} issues</span><button type="button" className="primary" onClick={props.onNext}>Check / Preview</button></div></div>
  </div>;
}

function PhasePanel({ phase, section, photos, dispatch }: { phase: Phase; section: ReportSection; photos: PhotoData[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]> }) {
  const condition = section.conditions[phase];
  return <section className={`phase-panel ${phase.toLowerCase()}`}><div className="phase-head"><div><span>{phase}</span><b>{photos.filter((photo) => photo.reportUse).length} PHOTOS</b></div><p>Condition · Phase 기준</p></div><div className="condition-row"><label><span>CONDITION</span><select aria-label={`${phase} condition`} value={condition?.class ?? ''} onChange={(event) => dispatch({ type: 'UPDATE_CONDITION', sectionId: section.id, phase, patch: { class: event.target.value as ConditionClass } })}><option value="">선택</option>{['CLEAN', 'BIOFOULING', 'DAMAGE', 'COATING'].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>RATING</span><select aria-label={`${phase} rating`} value={condition?.rating ?? ''} onChange={(event) => dispatch({ type: 'UPDATE_CONDITION', sectionId: section.id, phase, patch: { rating: event.target.value as ConditionRating } })}><option value="">선택</option>{['R0', 'R1', 'R2', 'R3', 'R4', 'R5'].map((value) => <option key={value}>{value}</option>)}</select></label></div><label className="detail-field"><span>DETAIL</span><input value={condition?.detail ?? ''} placeholder="Optional note" onChange={(event) => dispatch({ type: 'UPDATE_CONDITION', sectionId: section.id, phase, patch: { detail: event.target.value } })} /></label>
    <div className="photo-list">{photos.length ? photos.map((photo) => <article className={photo.reportUse ? 'photo-row' : 'photo-row excluded'} key={photo.id}><div className="thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /><span>{String(phaseIndexForPhoto(photo, photos)).padStart(2, '0')}</span></div><div className="photo-info"><b>{photo.file.name}</b><span>{createCaption(photo, section, phaseIndexForPhoto(photo, photos))}</span></div><div className="photo-actions"><label className="switch"><input type="checkbox" checked={photo.reportUse} onChange={() => dispatch({ type: 'TOGGLE_REPORT_USE', photoId: photo.id })} /><i /><span>REPORT USE</span></label><button type="button" aria-label={`${photo.file.name} 재배정`} onClick={() => dispatch({ type: 'UNASSIGN_PHOTO', photoId: photo.id })}>재배정</button></div></article>) : <div className="phase-empty"><span>＋</span><b>{phase} 사진 없음</b><p>폴더에서 불러오거나 UNMATCHED에서 배정하세요.</p></div>}</div>
  </section>;
}

function UnmatchedCard({ photo, sections, onAssign }: { photo: PhotoData; sections: ReportSection[]; onAssign: (sectionId: string, phase: Phase) => void }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const section = sections.find((item) => item.id === sectionId) ?? sections[0];
  const [phase, setPhase] = useState<Phase>(section?.phases[0] ?? 'BEFORE');
  return <article className="unmatched-card"><div className="unmatched-thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /></div><b>{photo.file.name}</b><select aria-label={`${photo.file.name} section`} value={sectionId} onChange={(event) => { const nextSection = sections.find((item) => item.id === event.target.value); setSectionId(event.target.value); setPhase(nextSection?.phases[0] ?? 'BEFORE'); }}>{sections.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select><div className="assign-row"><select aria-label={`${photo.file.name} phase`} value={phase} onChange={(event) => setPhase(event.target.value as Phase)}>{section?.phases.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => onAssign(sectionId, phase)}>배정</button></div></article>;
}

interface CheckPreviewProps {
  report: ReportState; activeSection: ReportSection; pages: ReturnType<typeof selectedPages>;
  issues: ReturnType<typeof checkReport>; previewPage: number; onPage: (page: number) => void;
  onIssue: (sectionId: string | null) => void; onSection: (sectionId: string) => void; onNext: () => void;
}

function CheckPreview(props: CheckPreviewProps) {
  const visiblePages = props.pages.filter((page) => Math.abs(page.index - props.previewPage) <= 1);
  return <div className="check-layout"><aside className="qa-panel"><div className="qa-title"><p className="step-kicker">STEP 04</p><h2>Report Check</h2><span>{props.issues.length}</span></div><p>별도 QA 페이지 없이 누락과 오류만 빠르게 확인합니다.</p><div className="qa-list">{props.issues.length ? props.issues.map((issue) => <button type="button" key={issue.id} onClick={() => props.onIssue(issue.sectionId)}><span className={`issue-icon ${issue.kind.toLowerCase()}`}>!</span><span><b>{issue.kind.replaceAll('_', ' ')}</b><em>{issue.message}</em></span><i>→</i></button>) : <div className="qa-clear"><b>✓</b><span>확인할 오류가 없습니다.</span></div>}</div></aside>
    <section className="preview-area"><div className="preview-toolbar"><div><p className="eyebrow">REPORT PREVIEW</p><h2>{props.activeSection.id}</h2></div><select aria-label="Preview section" value={props.activeSection.id} onChange={(event) => props.onSection(event.target.value)}>{props.report.sections.map((section) => <option key={section.id}>{section.id}</option>)}</select><div className="pager"><button type="button" disabled={props.previewPage === 0} onClick={() => props.onPage(Math.max(0, props.previewPage - 1))}>←</button><b>{props.pages.length ? props.previewPage + 1 : 0} / {props.pages.length}</b><button type="button" disabled={props.previewPage >= props.pages.length - 1} onClick={() => props.onPage(Math.min(props.pages.length - 1, props.previewPage + 1))}>→</button></div></div>
      <div className="preview-stage">{visiblePages.length ? visiblePages.map((page) => <article className={page.index === props.previewPage ? 'report-page current' : 'report-page neighbor'} data-page-index={page.index} key={page.index}><header><div><b>UNDERWATER SERVICE REPORT</b><span>{props.activeSection.id}</span></div><em>PAGE {page.index + 1}</em></header><div className={page.photos.length <= 4 ? 'preview-grid four' : 'preview-grid six'}>{page.photos.map((photo) => <div className="preview-photo" key={photo.id}><div><PhotoThumb file={photo.file} alt={photo.file.name} /><span className={`phase-tag ${photo.phase?.toLowerCase()}`}>{photo.phase}</span></div><p>{createCaption(photo, props.activeSection, phaseIndexForPhoto(photo, props.report.photos))}</p></div>)}</div><footer><span>Condition by phase</span><span>{props.activeSection.phases.map((phase) => `${phase} ${props.activeSection.conditions[phase]?.class || '—'} / ${props.activeSection.conditions[phase]?.rating || '—'}`).join(' · ')}</span></footer></article>) : <div className="preview-empty"><b>0P</b><span>Report Use 사진을 추가하면 페이지가 자동 생성됩니다.</span></div>}</div>
      <div className="preview-footer"><span>Page 1: 4 photos · Next pages: 6 photos</span><button type="button" className="primary" onClick={props.onNext}>PDF 준비</button></div>
    </section>
  </div>;
}

function ExportScreen({ vesselName, report, status, onBack, onExport, busy }: { vesselName: string; report: ReportState; status: string; onBack: () => void; onExport: () => void; busy: boolean }) {
  return <div className="workspace export-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 05</p><h2>PDF 다운로드</h2><p>페이지는 Report Use 사진 수에 따라 자동 생성됩니다.</p></div><span className="privacy-chip">LOCAL EXPORT</span></div><div className="export-card"><div className="export-doc"><span>PDF</span><div><b>{vesselName}</b><p>{report.sections.length} sections · {report.photos.filter((photo) => photo.reportUse && photo.sectionId).length} photos</p></div></div><dl><div><dt>Layout</dt><dd>A4 Landscape</dd></div><div><dt>Page rule</dt><dd>4 + 6 / page</dd></div><div><dt>Processing</dt><dd>Sequential resize</dd></div></dl><button type="button" className="primary export-button" disabled={busy} onClick={onExport}>{busy ? 'PDF 생성 중…' : 'PDF 다운로드'}</button><p>{status}</p></div><div className="actionbar"><button type="button" className="text-button" onClick={onBack}>← Check / Preview</button></div></div>;
}
