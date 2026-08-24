'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createDemoPhotos, COMPONENT_OPTIONS, DEMO_VESSELS, SERVICES } from './app/demoData';
import { ConditionEditor } from './app/ConditionEditor';
import {
  cloneCondition,
  conditionGroupKey,
  conditionGroupMembers,
  patchCondition,
  type ConditionPatch,
  type ConditionSource,
} from './app/conditionDefaults';
import { initialReportState, reportReducer, selectedPages, type ReportState } from './app/reportState';
import { conciseSectionLabel } from './app/reportLabels';
import { createSectionTree, folderRelativePath, pickDirectory, scanImages, type DirectoryHandleLike } from './browser/directory';
import { ThumbnailPool, type ThumbnailLease } from './browser/images';
import { createCaption, matchPhotoPath, phaseIndexForPhoto } from './domain/photos';
import { formatConditionSummary } from './domain/conditions';
import { buildWordPhasePages } from './docx/reportModel';
import { checkReport } from './domain/qa';
import {
  appendTargetService,
  applyServicePreset,
  createGeneralTargets,
  createNicheTargets,
  createReportSections,
  GENERAL_SIDES,
  GENERAL_ZONES,
  mergeScopeTargets,
  removeTargetService,
  replaceTargetService,
} from './domain/structure';
import type { WordExportInput, WordExportResult } from './docx/templateWriter';
import type {
  NicheType,
  Condition,
  Phase,
  PhotoData,
  ReportSection,
  ScopeTarget,
  ServiceKind,
} from './domain/types';

const thumbnails = new ThumbnailPool();
const stages = ['준비', 'Report Input', 'Check / Preview', 'Word'];

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

interface NicheDraft { component: string; type: NicheType; quantity: number }
interface NicheGroup extends NicheDraft { id: string; targets: ScopeTarget[] }
interface GeneralScopeState { targets: ScopeTarget[]; undo: ScopeTarget[] | null }

const POLISHING_COMPONENTS = new Set(['Propeller Blade', 'Boss Cap']);

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

type WordExporter = (input: WordExportInput) => Promise<WordExportResult>;

const loadWordExporter: WordExporter = async (input) => {
  const { writeTemplateReport } = await import('./docx/templateWriter');
  return writeTemplateReport(input, {
    download: (blob, fileName) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
};

export default function App({ exporter = loadWordExporter }: { exporter?: WordExporter }) {
  const [stage, setStage] = useState(0);
  const [imo, setImo] = useState('9876543');
  const [vessel, setVessel] = useState<(typeof DEMO_VESSELS)[number] | null>(null);
  const [activeService, setActiveService] = useState<ServiceKind>('CLEANING');
  const [generalScope, setGeneralScope] = useState<GeneralScopeState>(() => ({
    targets: createGeneralTargets(),
    undo: null,
  }));
  const [nicheDraft, setNicheDraft] = useState<NicheDraft>({ component: 'Sea Chest', type: 'SIDE_QUANTITY', quantity: 2 });
  const [includeFinBlade, setIncludeFinBlade] = useState(false);
  const [nicheItems, setNicheItems] = useState<NicheGroup[]>([]);
  const [scopeMeta, setScopeMeta] = useState<{ vesselName: string } | null>(null);
  const [report, dispatch] = useReducer(reportReducer, initialReportState);
  const [folder, setFolder] = useState<DirectoryHandleLike | null>(null);
  const [folderStructureCreated, setFolderStructureCreated] = useState(false);
  const [photoImportComplete, setPhotoImportComplete] = useState(false);
  const [status, setStatus] = useState('사진 폴더를 선택하거나 샘플 사진으로 흐름을 확인하세요.');
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [activePhotoPhase, setActivePhotoPhase] = useState<Phase>('BEFORE');
  const [isExporting, setIsExporting] = useState(false);
  const fallbackInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const manualTarget = useRef<{ sectionId: string; phase: Phase } | null>(null);

  const activeSection = report.sections.find((item) => item.id === report.focusedSectionId) ?? report.sections[0];
  const activePhotoTarget = activeSection ? {
    sectionId: activeSection.id,
    phase: activeSection.phases.includes(activePhotoPhase) ? activePhotoPhase : activeSection.phases[0],
  } : null;
  const activePhotos = activeSection ? report.photos.filter((photo) => photo.sectionId === activeSection.id) : [];
  const unmatched = report.photos.filter((photo) => !photo.sectionId || !photo.phase);
  const pages = selectedPages({ ...report, focusedSectionId: activeSection?.id ?? null });
  const issues = useMemo(() => checkReport(report.sections, report.photos), [report.sections, report.photos]);
  const generalTargets = generalScope.targets;
  const draftTargets = [...generalTargets, ...nicheItems.flatMap((item) => item.targets)];
  const draftSections = createReportSections(draftTargets);
  const serviceSummary = [...new Set(
    (report.sections.length ? report.sections : draftSections).map((section) => section.service),
  )].join(' + ') || activeService;

  const buildScope = () => {
    const sections = createReportSections(draftTargets);
    dispatch({ type: 'SET_SCOPE', sections });
    setActivePhotoPhase(sections[0]?.phases[0] ?? 'BEFORE');
    setScopeMeta({ vesselName: vessel?.name ?? 'UNDERWATER REPORT' });
    setFolderStructureCreated(false);
    setPhotoImportComplete(false);
  };

  const resetScope = () => {
    dispatch({ type: 'SET_SCOPE', sections: [] });
    setScopeMeta(null);
    setFolder(null);
    setFolderStructureCreated(false);
    setPhotoImportComplete(false);
    setUnmatchedOpen(false);
    setActivePhotoPhase('BEFORE');
    setStatus('사진 폴더를 선택하거나 샘플 사진으로 흐름을 확인하세요.');
  };

  const selectService = (service: ServiceKind) => {
    setActiveService(service);
    setIncludeFinBlade(false);
    if (service === 'POLISHING') {
      setNicheDraft({ component: 'Propeller Blade', type: 'QUANTITY', quantity: 4 });
    }
  };

  const addNiche = () => setNicheItems((items) => {
    const isPropellerPolishing = activeService === 'POLISHING'
      && nicheDraft.component === 'Propeller Blade';
    const additions: Array<{ draft: NicheDraft; service: ServiceKind }> = isPropellerPolishing
      ? [
        { draft: { component: 'Rope Guard', type: 'SINGLE', quantity: 1 }, service: 'INSPECTION' },
        { draft: nicheDraft, service: 'POLISHING' },
        ...(includeFinBlade ? [{
          draft: { component: 'Fin Blade', type: 'QUANTITY' as const, quantity: nicheDraft.quantity },
          service: 'POLISHING' as const,
        }] : []),
        { draft: { component: 'Boss Cap', type: 'SINGLE', quantity: 1 }, service: 'POLISHING' },
      ]
      : [{ draft: nicheDraft, service: activeService }];
    return additions.reduce<NicheGroup[]>((currentItems, addition, draftIndex) => {
      const { draft, service } = addition;
      const id = `${draft.component}-${Date.now()}-${currentItems.length}-${draftIndex}`;
      const incoming = new Map(createNicheTargets({
        ...draft,
        service,
      }).map((target) => [target.id, target]));
      const mergedItems = currentItems.map((item) => ({
        ...item,
        targets: item.targets.map((target) => {
          const addition = incoming.get(target.id);
          if (!addition) return target;
          incoming.delete(target.id);
          return mergeScopeTargets([target, addition])[0];
        }),
      }));
      return incoming.size
        ? [...mergedItems, { ...draft, id, targets: [...incoming.values()] }]
        : mergedItems;
    }, items);
  });

  const changeGeneral = (update: (targets: ScopeTarget[]) => ScopeTarget[]) => {
    setGeneralScope((current) => {
      const next = update(current.targets);
      const changed = next.some((target, index) => (
        target.services.join('|') !== current.targets[index]?.services.join('|')
      ));
      if (!changed) return current;
      return { targets: next, undo: current.targets };
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
    if (!folder || report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 폴더 구조를 생성할 수 있습니다.');
      return;
    }
    try {
      await createSectionTree(folder, report.sections);
      setFolderStructureCreated(true);
      setStatus(`${report.sections.length}개 Section의 폴더를 만들었습니다. 사진을 넣은 뒤 다시 불러오세요.`);
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'FILE_SYSTEM_ACCESS_UNAVAILABLE'
        ? '폴더 구조 생성은 현재 Chrome/Edge의 localhost 환경에서 사용할 수 있습니다.'
        : '폴더 생성을 취소했거나 권한을 받지 못했습니다.');
    }
  };

  const importDirectory = async (selected: DirectoryHandleLike, autoMatch: boolean) => {
    if (report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 사진을 불러올 수 있습니다.');
      return;
    }
    const scanned = await scanImages(selected);
    const photos = photoRecords(scanned, report.sections, autoMatch, report.photos.length + 1);
    dispatch({ type: 'IMPORT_PHOTOS', photos });
    const matched = photos.filter((photo) => photo.sectionId).length;
    setPhotoImportComplete(true);
    setStatus(`${photos.length}장 불러옴 · ${matched}장 자동 매칭 · ${photos.length - matched}장 UNMATCHED`);
  };

  const reloadFolder = async () => {
    if (!folder || report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 사진을 불러올 수 있습니다.');
      return;
    }
    try {
      await importDirectory(folder, true);
    } catch {
      setStatus('폴더를 다시 읽지 못했습니다. 권한을 확인하고 폴더를 다시 선택하세요.');
    }
  };

  const selectPhotoFolder = async () => {
    if (report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 사진 폴더를 선택할 수 있습니다.');
      return;
    }
    try {
      const selected = await pickDirectory('readwrite');
      setFolder(selected);
      setFolderStructureCreated(false);
      setPhotoImportComplete(false);
      setStatus(`“${selected.name}” 폴더를 선택했습니다. 사진을 불러오거나 표준 구조를 생성하세요.`);
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_SYSTEM_ACCESS_UNAVAILABLE') fallbackInput.current?.click();
      else setStatus('폴더 선택을 취소했습니다.');
    }
  };

  const importFallback = (files: FileList | null) => {
    if (!files || report.sections.length === 0) return;
    const images = Array.from(files)
      .filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name))
      .map((file) => ({ file, relativePath: folderRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) }));
    const photos = photoRecords(images, report.sections, true, report.photos.length + 1);
    dispatch({ type: 'IMPORT_PHOTOS', photos });
    const matched = photos.filter((photo) => photo.sectionId).length;
    setPhotoImportComplete(true);
    setStatus(`${photos.length}장 불러옴 · ${matched}장 자동 매칭 · ${photos.length - matched}장 UNMATCHED`);
  };

  const addPhotosToPhase = (sectionId: string, phase: Phase) => {
    setActivePhotoPhase(phase);
    manualTarget.current = { sectionId, phase };
    manualInput.current?.click();
  };

  const assignUnmatchedToActivePhase = (photoId: string) => {
    if (!activePhotoTarget) return;
    dispatch({ type: 'ASSIGN_PHOTO', photoId, ...activePhotoTarget });
    if (unmatched.length === 1) setUnmatchedOpen(false);
  };

  const importManualPhotos = (files: FileList | null) => {
    const target = manualTarget.current;
    if (!files || !target) return;
    const photos = photoRecords(
      Array.from(files)
        .filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name))
        .map((file) => ({ file, relativePath: file.name })),
      report.sections,
      false,
      report.photos.length + 1,
    ).map((photo) => ({ ...photo, sectionId: target.sectionId, phase: target.phase }));
    dispatch({ type: 'IMPORT_PHOTOS', photos });
    setStatus(`${target.phase}에 사진 ${photos.length}장을 추가했습니다.`);
  };

  const loadDemo = async () => {
    if (!activeSection) return;
    setStatus('샘플 이미지를 만드는 중입니다…');
    dispatch({ type: 'IMPORT_PHOTOS', photos: await createDemoPhotos(activeSection) });
    setStatus(`${activeSection.id}에 샘플 사진 7장을 배정했습니다.`);
  };

  const openReportInput = () => {
    if (report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 Report Input으로 이동할 수 있습니다.');
      return;
    }
    setStage(2);
  };

  const focusIssue = (sectionId: string | null) => {
    if (sectionId) dispatch({ type: 'FOCUS_SECTION', sectionId });
    else setUnmatchedOpen(true);
    setStage(2);
  };

  const runExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setStatus('사진을 순차 처리하여 Word 보고서를 만드는 중입니다…');
    try {
      const result = await exporter({
        vesselName: scopeMeta?.vesselName ?? 'UNDERWATER REPORT',
        sections: report.sections,
        photos: report.photos,
        templateUrl: 'templates/Detail_report_template.docx',
      });
      setStatus(result.skipped.length
        ? `Word 보고서 완료 · 읽을 수 없어 제외된 사진: ${result.skipped.join(', ')}`
        : 'Word 보고서 다운로드가 완료되었습니다.');
    } catch {
      setStatus('Word 보고서를 만들지 못했습니다. 사진 형식과 브라우저 다운로드 권한을 확인하세요.');
    } finally {
      setIsExporting(false);
    }
  };

  return <main className="app-shell">
    <input {...{ webkitdirectory: '' }} ref={fallbackInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => importFallback(event.target.files)} />
    <input ref={manualInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => { importManualPhotos(event.target.files); event.currentTarget.value = ''; }} />
    <StageRail active={stage < 2 ? 0 : stage - 1} onMove={(next) => { const nextStage = next === 0 ? 0 : next + 1; if (report.sections.length || nextStage === 0) setStage(nextStage); }} />
    <section className="app-main">
      <header className="topbar"><div><p className="eyebrow">UNDERWATER SERVICE REPORT</p><h1>{scopeMeta?.vesselName ?? vessel?.name ?? 'New report'}</h1></div><div className="top-meta"><span>{serviceSummary}</span><span>{report.sections.length} SECTIONS</span><span>{report.photos.length} PHOTOS</span></div></header>

      {stage === 0 && <><VesselScope
        imo={imo} setImo={setImo} vessel={vessel} activeService={activeService} setActiveService={selectService}
        generalTargets={generalTargets} generalUndo={generalScope.undo}
        onGeneralReplace={replaceGeneral} onGeneralAppend={appendGeneral} onGeneralRemove={removeGeneral}
        onGeneralPreset={applyGeneral} onGeneralClear={clearGeneral}
        onGeneralUndo={() => setGeneralScope((current) => current.undo
          ? { targets: current.undo, undo: null }
          : current)}
        nicheDraft={nicheDraft} setNicheDraft={setNicheDraft} nicheItems={nicheItems}
        includeFinBlade={includeFinBlade} setIncludeFinBlade={setIncludeFinBlade}
        addNiche={addNiche} removeNiche={(id) => setNicheItems((items) => items.filter((item) => item.id !== id))}
        onNicheReplace={(groupId, targetId) => changeNicheTarget(groupId, targetId, (target) => replaceTargetService(target, activeService))}
        onNicheAppend={(groupId, targetId) => changeNicheTarget(groupId, targetId, (target) => appendTargetService(target, activeService))}
        onNicheRemove={(groupId, targetId, service) => changeNicheTarget(groupId, targetId, (target) => removeTargetService(target, service))}
        onLookup={() => setVessel(DEMO_VESSELS.find((item) => item.imo === imo.trim()) ?? null)}
        onBuild={buildScope} onReset={resetScope} sectionCount={report.sections.length} draftSections={draftSections}
        onPhotos={() => document.getElementById('photo-source')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
      /><PhotoSource embedded
        photoCount={report.photos.length} matchedCount={report.photos.length - unmatched.length} unmatchedCount={unmatched.length}
        status={status} hasFolder={Boolean(folder)} structureCreated={folderStructureCreated} importComplete={photoImportComplete} folderName={folder?.name ?? null} sections={report.sections}
        onSelect={selectPhotoFolder} onCreate={createFolders} onLoad={reloadFolder}
        onDemo={loadDemo} onBack={() => setStage(0)} onNext={openReportInput}
      /></>}

      {stage === 1 && <PhotoSource
        photoCount={report.photos.length} matchedCount={report.photos.length - unmatched.length} unmatchedCount={unmatched.length}
        status={status} hasFolder={Boolean(folder)} structureCreated={folderStructureCreated} importComplete={photoImportComplete} folderName={folder?.name ?? null} sections={report.sections}
        onSelect={selectPhotoFolder} onCreate={createFolders} onLoad={reloadFolder}
        onDemo={loadDemo} onBack={() => setStage(0)} onNext={openReportInput}
      />}

      {stage === 2 && activeSection && <ReportInput
        report={report} activeSection={activeSection} activePhotos={activePhotos}
        unmatched={unmatched} unmatchedOpen={unmatchedOpen}
        pages={pages} issueCount={issues.length}
        activePhotoTarget={activePhotoTarget}
        onToggleUnmatched={() => setUnmatchedOpen((open) => !open)} onCloseUnmatched={() => setUnmatchedOpen(false)}
        onSelectPhotoTarget={(target) => setActivePhotoPhase(target.phase)} onAssignUnmatched={assignUnmatchedToActivePhase}
        dispatch={dispatch} onOpen={selectPhotoFolder} onAddPhotos={addPhotosToPhase} onBack={() => setStage(1)} onNext={() => setStage(3)}
      />}

      {stage === 3 && activeSection && <CheckPreview
        report={report} activeSection={activeSection} pages={pages} issues={issues}
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
  const shortLabel = [props.target.side, props.target.unit ? `#${String(props.target.unit).padStart(2, '0')}` : null]
    .filter(Boolean).join(' ') || props.target.component;
  return <div className={props.target.services.length ? 'target-cell assigned' : 'target-cell'}>
    <button type="button" className="target-main" disabled={props.locked} aria-label={`${label} 작업 배정`} onClick={props.onReplace}>
      {props.compact ? (props.target.services.length ? '배정 변경' : '클릭 배정') : shortLabel}
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
  includeFinBlade: boolean; setIncludeFinBlade: (value: boolean) => void;
  addNiche: () => void; removeNiche: (id: string) => void;
  onNicheReplace: (groupId: string, targetId: string) => void;
  onNicheAppend: (groupId: string, targetId: string) => void;
  onNicheRemove: (groupId: string, targetId: string, service: ServiceKind) => void;
  onLookup: () => void; onBuild: () => void; onReset: () => void;
  sectionCount: number; draftSections: ReportSection[]; onPhotos: () => void;
}

function VesselScope(props: VesselScopeProps) {
  const locked = props.sectionCount > 0;
  const polishingActive = props.activeService === 'POLISHING';
  const generalLocked = locked || polishingActive;
  const componentOptions = polishingActive
    ? COMPONENT_OPTIONS.filter((option) => POLISHING_COMPONENTS.has(option.name))
    : COMPONENT_OPTIONS;
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

        <section className={polishingActive ? 'general-builder restricted' : 'general-builder'}><div className="mini-heading"><b>GENERAL</b><span>{polishingActive ? 'POLISHING 배정 불가' : '15 AVAILABLE · 필요한 곳만 배정'}</span></div>
          <div className="preset-row"><button type="button" disabled={generalLocked} onClick={() => props.onGeneralPreset()}>전체 적용</button>{GENERAL_SIDES.map((side) => <button type="button" disabled={generalLocked} key={side} onClick={() => props.onGeneralPreset(side)}>{side} 적용</button>)}<button type="button" disabled={generalLocked} onClick={props.onGeneralClear}>모두 해제</button><button type="button" disabled={generalLocked || !props.generalUndo} onClick={props.onGeneralUndo}>실행 취소</button></div>
          <div className="general-matrix"><div className="matrix-corner">ZONE</div>{GENERAL_SIDES.map((side) => <b key={side}>{side}</b>)}{GENERAL_ZONES.map((zone) => <div className="general-matrix-row" key={zone}><strong>{zone}</strong>{GENERAL_SIDES.map((side) => { const target = props.generalTargets.find((item) => item.component === zone && item.side === side)!; return <TargetCell key={target.id} target={target} activeService={props.activeService} locked={generalLocked} compact onReplace={() => props.onGeneralReplace(target.id)} onAppend={() => props.onGeneralAppend(target.id)} onRemove={(service) => props.onGeneralRemove(target.id, service)} />; })}</div>)}</div>
        </section>

        <section className="niche-builder"><div className="mini-heading"><b>NICHE</b><span>추가 시 현재 Service 전체 적용</span></div><div className="niche-controls">
          <select aria-label="Niche component" value={props.nicheDraft.component} disabled={locked} onChange={(event) => { const option = componentOptions.find((item) => item.name === event.target.value)!; props.setIncludeFinBlade(false); props.setNicheDraft({ component: option.name, type: option.defaultType, quantity: option.defaultQuantity }); }}>{componentOptions.map((item) => <option key={item.name}>{item.name}</option>)}</select>
          <select aria-label="Niche type" value={props.nicheDraft.type} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, type: event.target.value as NicheType })}>{['SINGLE', 'SIDE', 'QUANTITY', 'SIDE_QUANTITY'].map((type) => <option key={type}>{type}</option>)}</select>
          <div className="quantity-stepper"><button type="button" aria-label="수량 감소" disabled={locked || props.nicheDraft.quantity <= 1} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.max(1, props.nicheDraft.quantity - 1) })}>−</button><input aria-label="Quantity" type="number" min="1" max="12" value={props.nicheDraft.quantity} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Number(event.target.value) })} onBlur={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /><button type="button" aria-label="수량 증가" disabled={locked || props.nicheDraft.quantity >= 12} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, props.nicheDraft.quantity + 1) })}>＋</button></div>
          <button type="button" className="icon-button" aria-label="Niche 추가" disabled={locked} onClick={props.addNiche}>＋</button>
        </div>{polishingActive && props.nicheDraft.component === 'Propeller Blade' && <><div className="polishing-set-note">자동 세트: Propeller Polishing + Boss Cap Polishing + Rope Guard Inspection</div><label className="fin-blade-option"><input type="checkbox" aria-label="Fin Blade 포함" checked={props.includeFinBlade} disabled={locked} onChange={(event) => props.setIncludeFinBlade(event.target.checked)} /><span><b>Fin Blade 포함</b><small>Propeller Blade와 동일 수량으로 함께 추가</small></span></label></>}{props.nicheItems.map((item) => <article className="niche-group" key={item.id}><header><div><b>{item.component}</b><span>{item.type}{item.type.includes('QUANTITY') ? ` ×${item.quantity}` : ''}</span></div><button type="button" disabled={locked} aria-label={`${item.component} 삭제`} onClick={() => props.removeNiche(item.id)}>×</button></header><div className="niche-targets">{item.targets.map((target) => <TargetCell key={target.id} target={target} activeService={props.activeService} locked={locked} onReplace={() => props.onNicheReplace(item.id, target.id)} onAppend={() => props.onNicheAppend(item.id, target.id)} onRemove={(service) => props.onNicheRemove(item.id, target.id, service)} />)}</div></article>)}<p className="side-note">Side 없음: Propeller Blade, Fin Blade, Rope Guard, Boss Cap, Transducer, Stern Frame</p></section>

        <div className="scope-summary" aria-label="Scope 배정 요약"><div>{serviceCounts.map((item) => <span key={item.value} className={item.value.toLowerCase()}>{item.value} {item.count}</span>)}</div><em>GENERAL 미배정 {unassignedGeneral}</em></div>
        <button type="button" className="primary full" disabled={!props.vessel || props.draftSections.length === 0} onClick={props.onBuild}>Scope 만들기</button>
        {locked && <div className="scope-ready"><b>총 {props.sectionCount} sections</b><em>Condition과 phase가 준비되었습니다.</em><div><button type="button" className="ghost" onClick={props.onPhotos}>사진 폴더로 이동</button><button type="button" className="text-button" onClick={props.onReset}>Scope 초기화</button></div></div>}
      </section>
    </div>
  </div>;
}

interface PhotoSourceProps {
  photoCount: number; matchedCount: number; unmatchedCount: number; status: string; hasFolder: boolean; structureCreated: boolean; importComplete: boolean; folderName: string | null; sections: ReportSection[];
  onSelect: () => void; onCreate: () => void; onLoad: () => void;
  onDemo: () => void; onBack: () => void; onNext: () => void;
  embedded?: boolean;
}

function PhotoSource(props: PhotoSourceProps) {
  const scopeReady = props.sections.length > 0;
  const phaseFolderCount = props.sections.reduce((total, section) => total + section.phases.length, 0);
  const scopeGroups = SERVICES.flatMap(({ value }) => {
    const serviceSections = props.sections.filter((section) => section.service === value);
    return (['GENERAL', 'NICHE'] as const).flatMap((area) => {
      const sections = serviceSections.filter((section) => section.area === area);
      if (!sections.length) return [];
      const label = area === 'GENERAL' ? 'GENERAL' : [...new Set(sections.map((section) => section.component))].join(', ');
      return [{ service: value, label, count: sections.length, phases: [...new Set(sections.flatMap((section) => section.phases))] }];
    });
  });
  const folderResult = !scopeReady
    ? 'Scope 생성 후 사진 폴더를 선택할 수 있습니다'
    : props.hasFolder
    ? `폴더 선택 완료 · ${props.folderName}`
    : '사진 폴더를 선택하세요';
  const structureResult = props.structureCreated
    ? `구조 생성 완료 · ${props.sections.length} Sections / ${phaseFolderCount} Phase folders`
    : props.hasFolder ? '폴더 구조를 아직 생성하지 않음' : '폴더 선택 후 생성 가능';
  const importResult = props.importComplete
    ? `사진 불러오기 완료 · ${props.photoCount}장 / UNMATCHED ${props.unmatchedCount}장`
    : '사진을 아직 불러오지 않음';

  return <div id={props.embedded ? 'photo-source' : undefined} className={props.embedded ? 'photo-source-section' : 'workspace wide'}>{!props.embedded && <div className="page-heading"><div><p className="step-kicker">STEP 02</p><h2>사진 폴더</h2><p>원본은 로컬 File 참조로만 유지하며 서버로 전송하지 않습니다.</p></div><span className="privacy-chip">{props.photoCount} PHOTOS</span></div>}
    <section className="method-card recommended photo-folder-card"><div className="method-top"><span>03</span><em>PHOTO INPUT</em></div><h3>사진 폴더</h3><p>사진을 넣기 전 폴더 구조로 분류하거나, 이미 있는 사진을 불러온 뒤 경로로 분류할 수 있습니다.</p>
      <ol className="photo-progress" aria-label="사진 입력 진행 상태"><li className={props.hasFolder ? 'done' : scopeReady ? 'current' : 'pending'}><span>{props.hasFolder ? '✓' : '1'}</span><div><b>사진 폴더 선택</b><small>사진이 저장된 폴더를 선택합니다.</small><strong>{folderResult}</strong><button type="button" className={props.hasFolder ? 'ghost' : 'primary'} disabled={!scopeReady} onClick={props.onSelect}>{props.hasFolder ? '다른 사진 폴더 선택' : '사진 폴더 선택'}</button></div></li><li className={props.structureCreated ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.structureCreated ? '✓' : '2'}</span><div><b>표준 폴더 구조 생성 <i>선분류</i></b><small>선택 폴더 안에 선택된 Scope와 구역의 폴더 구조를 생성합니다.</small><strong>{structureResult}</strong><button type="button" className={props.hasFolder && !props.structureCreated ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onCreate}>{props.structureCreated ? '폴더 구조 다시 생성' : '표준 폴더 구조 생성'}</button></div></li><li className={props.importComplete ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.importComplete ? '✓' : '3'}</span><div><b>사진 불러오기 <i>후분류</i></b><small>선택 폴더의 사진을 불러와 경로 기준으로 자동 매칭합니다.</small><strong>{importResult}</strong><button type="button" className={props.hasFolder && !props.importComplete ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onLoad}>{props.importComplete ? '사진 다시 불러오기' : '사진 불러오기'}</button></div></li></ol>
      <section className="photo-scope-summary" aria-label="현재 작업 범위"><p>현재 작업 범위</p><div className="scope-work-list">{scopeGroups.map((group) => <div key={`${group.service}-${group.label}`}><b>{group.service}</b><span>{group.label} · {group.count}개 구역 · {group.phases.join(' / ')}</span></div>)}</div><small>총 {props.sections.length}개 Section · {phaseFolderCount}개 사진 폴더 · SERVICE 폴더는 같은 위치에 여러 Service가 있을 때만 추가됩니다.</small></section>
      <p className="folder-help"><b>선분류</b>는 사진을 넣기 전 표준 폴더를 만드는 방식이고, <b>후분류</b>는 기존 사진을 불러온 뒤 경로로 자동 분류하는 방식입니다.</p></section>
    <section className={`demo-strip${props.hasFolder || props.importComplete ? ' muted' : ''}`}><div><b>빠른 동작 확인</b><span>선택된 첫 Section에 BEFORE 3장 + AFTER 4장을 생성합니다.</span></div><button type="button" className="ghost" disabled={!scopeReady} onClick={props.onDemo}>샘플 사진 7장 불러오기</button></section>
    <p className="photo-status-detail" aria-label="사진 입력 상세 상태">{props.status}</p>{props.embedded ? <div className="photo-next-row"><button type="button" className="primary" disabled={!scopeReady} onClick={props.onNext}>Report Input으로</button></div> : <div className="actionbar"><button type="button" className="text-button" onClick={props.onBack}>← Vessel / Scope</button><button type="button" className="primary" disabled={!scopeReady} onClick={props.onNext}>Report Input으로</button></div>}
  </div>;
}

interface ReportInputProps {
  report: ReportState; activeSection: ReportSection; activePhotos: PhotoData[];
  unmatched: PhotoData[]; unmatchedOpen: boolean; pages: ReturnType<typeof selectedPages>;
  issueCount: number; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; onOpen: () => void;
  activePhotoTarget: { sectionId: string; phase: Phase } | null;
  onToggleUnmatched: () => void; onCloseUnmatched: () => void; onAddPhotos: (sectionId: string, phase: Phase) => void;
  onSelectPhotoTarget: (target: { sectionId: string; phase: Phase }) => void; onAssignUnmatched: (photoId: string) => void; onBack: () => void; onNext: () => void;
}

function ReportInput(props: ReportInputProps) {
  const activeIndex = Math.max(0, props.report.sections.findIndex((section) => section.id === props.activeSection.id));
  const activeSectionButtonRef = useRef<HTMLButtonElement>(null);
  const focusSection = (index: number) => {
    const section = props.report.sections[index];
    if (section) props.dispatch({ type: 'FOCUS_SECTION', sectionId: section.id });
  };

  useEffect(() => {
    activeSectionButtonRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [props.activeSection.id]);

  return <div className={`report-workspace${props.unmatchedOpen && props.unmatched.length > 0 ? ' unmatched-open' : ''}`}>
    <section className="input-canvas"><div className="input-heading"><div className="input-title"><p className="step-kicker">STEP 03 · {props.activeSection.area}</p><h2>Report Input</h2><span>{props.activeSection.id}</span></div><nav className="section-navigator" aria-label="Report Section 바로가기"><button type="button" className="section-arrow" aria-label="이전 Section" disabled={activeIndex === 0} onClick={() => focusSection(activeIndex - 1)}>←</button><div className="section-strip"><span className="section-count">SECTION {activeIndex + 1} / {props.report.sections.length}</span><div className="section-tabs">{props.report.sections.map((section) => {
      const active = section.id === props.activeSection.id;
      return <button
        type="button"
        key={section.id}
        ref={active ? activeSectionButtonRef : undefined}
        className={`section-tab${active ? ' active' : ''}`}
        aria-label={`${section.id} Section 열기`}
        aria-current={active ? 'page' : undefined}
        onClick={() => props.dispatch({ type: 'FOCUS_SECTION', sectionId: section.id })}
      ><span className={`service-badge ${section.service.toLowerCase()}`}>{section.service}</span><b>{conciseSectionLabel(section)}</b></button>;
    })}</div></div><button type="button" className="section-arrow" aria-label="다음 Section" disabled={activeIndex === props.report.sections.length - 1} onClick={() => focusSection(activeIndex + 1)}>→</button></nav><div className="input-metrics"><div className="page-badge"><b>{props.pages.length}P</b><span>{props.activePhotos.filter((photo) => photo.reportUse).length} Report Use</span></div><button type="button" className="unmatched-trigger" aria-label={`UNMATCHED ${props.unmatched.length}`} aria-controls="unmatched" aria-expanded={props.unmatchedOpen && props.unmatched.length > 0} disabled={props.unmatched.length === 0} onClick={props.onToggleUnmatched}><span>UNMATCHED</span><b>{props.unmatched.length}</b></button></div></div>
      <p className={`assignment-target ${props.activePhotoTarget?.phase.toLowerCase() ?? ''}`} aria-label="현재 사진 배정 위치" aria-live="polite"><b>{props.activePhotoTarget?.phase ?? '—'} 사진 배정 대상</b><span>{conciseSectionLabel(props.activeSection)}</span><small>{props.activePhotoTarget?.sectionId ?? '—'} · {props.activePhotoTarget?.phase ?? '—'}</small></p>
      <GroupConditionPanel report={props.report} section={props.activeSection} dispatch={props.dispatch} />
      <div className="phase-stack">{props.activeSection.phases.map((phase) => <PhasePanel key={phase} phase={phase} section={props.activeSection} sections={props.report.sections} photos={props.activePhotos.filter((photo) => photo.phase === phase)} dispatch={props.dispatch} source={props.report.conditionSources[props.activeSection.id]?.[phase] ?? 'GROUP'} onAddPhotos={props.onAddPhotos} selected={props.activePhotoTarget?.sectionId === props.activeSection.id && props.activePhotoTarget.phase === phase} onSelect={() => props.onSelectPhotoTarget({ sectionId: props.activeSection.id, phase })} />)}</div>
      <p className="photo-delete-note">삭제는 보고서 참조만 제거하며 원본 파일은 유지됩니다.</p>
    </section>
    {props.unmatchedOpen && props.unmatched.length > 0 && <aside className="unmatched-drawer" id="unmatched" aria-label="UNMATCHED 사진 배정"><div className="unmatched-head"><div><p className="eyebrow">MANUAL ASSIGN</p><h3>UNMATCHED</h3></div><div><span>{props.unmatched.length}</span><button type="button" aria-label="UNMATCHED 닫기" onClick={props.onCloseUnmatched}>×</button></div></div><p className="unmatched-help">확실하지 않은 경로는 추측하지 않습니다. 사진을 클릭하면 현재 선택된 위치에 바로 배정됩니다.</p><div className="unmatched-list">{props.unmatched.map((photo) => <UnmatchedCard key={photo.id} photo={photo} onAssign={() => props.onAssignUnmatched(photo.id)} />)}</div><button type="button" className="ghost full" onClick={props.onOpen}>사진 더 불러오기</button></aside>}
    <div className="input-footer"><button type="button" className="text-button" onClick={props.onBack}>← 사진 입력</button><div><span>Report Check {props.issueCount} issues</span><button type="button" className="primary" onClick={props.onNext}>Check / Preview</button></div></div>
  </div>;
}

interface GroupConditionPanelProps {
  report: ReportState;
  section: ReportSection;
  dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>;
}

function GroupConditionPanel({ report, section, dispatch }: GroupConditionPanelProps) {
  const [phaseChoice, setPhaseChoice] = useState<Phase>(section.phases[0]);
  const selectedPhase = section.phases.includes(phaseChoice) ? phaseChoice : section.phases[0];
  const groupKey = conditionGroupKey(section);
  const storedDefault = report.conditionDefaults[groupKey]?.[selectedPhase]
    ?? section.conditions[selectedPhase];
  const members = conditionGroupMembers(report.sections, section);

  if (!storedDefault) return null;

  return <section className="group-condition-panel" aria-label="구역 기본 Condition">
    <header className="group-condition-head">
      <div><span>구역 기본 CONDITION</span><b>{section.service} · {section.area} · {section.component}</b><small>하위 {members.length}개 Section에 적용</small></div>
      <div className="group-phase-tabs" role="tablist" aria-label="구역 기본 Condition Phase">
        {section.phases.map((phase) => <button
          type="button"
          role="tab"
          key={phase}
          aria-selected={selectedPhase === phase}
          className={selectedPhase === phase ? 'active' : ''}
          onClick={() => setPhaseChoice(phase)}
        >{phase}</button>)}
      </div>
    </header>
    <GroupConditionDraftEditor
      key={`${groupKey}:${selectedPhase}`}
      condition={storedDefault}
      phase={selectedPhase}
      onApply={(condition) => dispatch({
        type: 'APPLY_GROUP_CONDITION',
        sectionId: section.id,
        phase: selectedPhase,
        condition,
      })}
    />
  </section>;
}

function GroupConditionDraftEditor({ condition, phase, onApply }: {
  condition: Condition;
  phase: Phase;
  onApply: (condition: Condition) => void;
}) {
  const [draft, setDraft] = useState<Condition>(() => cloneCondition(condition));
  const changeDraft = (patch: ConditionPatch) => {
    setDraft((current) => patchCondition(current, patch));
  };

  return <>
    <ConditionEditor
      ariaPrefix={`구역 기본 ${phase}`}
      condition={draft}
      onPatch={changeDraft}
    />
    <div className="group-condition-actions"><span>Side와 Unit 하위에서 개별 수정할 수 있습니다.</span><button
      type="button"
      className="primary"
      onClick={() => onApply(draft)}
    >{phase} 기본값 적용</button></div>
  </>;
}

function PhasePanel({ phase, section, sections, photos, dispatch, source, onAddPhotos, selected, onSelect }: { phase: Phase; section: ReportSection; sections: ReportSection[]; photos: PhotoData[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; source: ConditionSource; onAddPhotos: (sectionId: string, phase: Phase) => void; selected: boolean; onSelect: () => void }) {
  const condition = section.conditions[phase];
  if (!condition) return null;
  return <section className={`phase-panel ${phase.toLowerCase()}${selected ? ' selected' : ''}`} aria-label={`${phase} 사진 갤러리`}>
    <div className="phase-head"><div><span>{phase}</span><b>{photos.filter((photo) => photo.reportUse).length} PHOTOS</b><em className={`condition-source ${source.toLowerCase()}`}>{source === 'OVERRIDE' ? '개별 수정' : '기본값 사용'}</em></div><div>{source === 'OVERRIDE' && <button type="button" className="condition-revert" aria-label={`${phase} 기본값으로 되돌리기`} onClick={() => dispatch({ type: 'REVERT_CONDITION_TO_GROUP', sectionId: section.id, phase })}>기본값으로 되돌리기</button>}<button type="button" className="phase-select" aria-label={`${phase} ${selected ? '현재 사진 배정 위치' : '이곳에 사진 배정'}`} aria-pressed={selected} onClick={onSelect}><span>{selected ? '✓ 현재 사진 배정 위치' : '이곳에 사진 배정'}</span></button><button type="button" className="ghost phase-add" aria-label={`${phase}에 사진 추가`} onClick={() => onAddPhotos(section.id, phase)}>사진 추가</button></div></div>
    <div className="phase-condition"><ConditionEditor ariaPrefix={phase} condition={condition} onPatch={(patch) => dispatch({ type: 'UPDATE_CONDITION', sectionId: section.id, phase, patch })} /></div>
    <div className="photo-list">{photos.length ? photos.map((photo) => <PhotoRow key={photo.id} photo={photo} phasePhotos={photos} section={section} phase={phase} sections={sections} dispatch={dispatch} />) : <div className="phase-empty"><span>＋</span><b>{phase} 사진 없음</b><p>이 Phase에 사진을 추가하거나 폴더에서 불러오세요.</p></div>}</div>
  </section>;
}

function PhotoRow({ photo, phasePhotos, section, phase, sections, dispatch }: { photo: PhotoData; phasePhotos: PhotoData[]; section: ReportSection; phase: Phase; sections: ReportSection[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]> }) {
  const [moving, setMoving] = useState(false);
  const [sectionId, setSectionId] = useState(section.id);
  const targetSection = sections.find((item) => item.id === sectionId) ?? section;
  const [targetPhase, setTargetPhase] = useState<Phase>(phase);
  const index = phaseIndexForPhoto(photo, phasePhotos);

  const move = () => {
    dispatch({ type: 'ASSIGN_PHOTO', photoId: photo.id, sectionId, phase: targetPhase });
    setMoving(false);
  };

  const resetMoveDraft = () => {
    setSectionId(section.id);
    setTargetPhase(phase);
  };

  const startMove = () => {
    resetMoveDraft();
    setMoving(true);
  };

  const cancelMove = () => {
    resetMoveDraft();
    setMoving(false);
  };

  return <article className={photo.reportUse ? 'photo-row' : 'photo-row excluded'}><div className="thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /><span>{String(index).padStart(2, '0')}</span></div><div className="photo-info"><b>{photo.file.name}</b><span>{createCaption(photo, section, index)}</span></div><div className="photo-actions"><label className="switch"><input type="checkbox" className="switch-input" aria-label={`${photo.file.name} Report Use`} checked={photo.reportUse} onChange={() => dispatch({ type: 'TOGGLE_REPORT_USE', photoId: photo.id })} /><i /><span>REPORT USE</span></label>{moving ? <div className="photo-move"><select aria-label={`${photo.file.name} 이동 Section`} value={sectionId} onChange={(event) => { const next = sections.find((item) => item.id === event.target.value) ?? section; setSectionId(next.id); setTargetPhase(next.phases[0]); }}>{sections.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select><select aria-label={`${photo.file.name} 이동 Phase`} value={targetPhase} onChange={(event) => setTargetPhase(event.target.value as Phase)}>{targetSection.phases.map((item) => <option key={item}>{item}</option>)}</select><button type="button" className="move-confirm" onClick={move}>이동 완료</button><button type="button" className="move-cancel" aria-label="이동 취소" onClick={cancelMove}>취소</button></div> : <div className="photo-action-buttons"><button type="button" className="photo-action-button move" aria-label={`${photo.file.name} 이동`} onClick={startMove}><span aria-hidden="true">↗</span>이동</button><button type="button" className="photo-action-button danger" aria-label={`${photo.file.name} 삭제`} onClick={() => dispatch({ type: 'DELETE_PHOTO', photoId: photo.id })}><span aria-hidden="true">×</span>삭제</button></div>}</div></article>;
}

function UnmatchedCard({ photo, onAssign }: { photo: PhotoData; onAssign: () => void }) {
  return <button type="button" className="unmatched-card" aria-label={`${photo.file.name} 사진 배정`} onClick={onAssign}><div className="unmatched-thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /></div><b>{photo.file.name}</b><span>현재 사진 배정 위치로 넣기 →</span></button>;
}

interface CheckPreviewProps {
  report: ReportState; activeSection: ReportSection; pages: ReturnType<typeof selectedPages>;
  issues: ReturnType<typeof checkReport>;
  onIssue: (sectionId: string | null) => void; onSection: (sectionId: string) => void; onNext: () => void;
}

function CheckPreview(props: CheckPreviewProps) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  return <div className="check-layout"><aside className="qa-panel"><div className="qa-title"><p className="step-kicker">STEP 04</p><h2>Report Check</h2><span>{props.issues.length}</span></div><p>누락과 오류만 확인하고, 필요할 때 목록을 펼쳐 해당 Section으로 이동합니다.</p>{props.issues.length ? <><button type="button" className="qa-summary" aria-expanded={issuesOpen} onClick={() => setIssuesOpen((open) => !open)}>Report Check {props.issues.length} issues <span>{issuesOpen ? '접기' : '목록 보기'}</span></button>{issuesOpen && <div className="qa-list">{props.issues.map((issue) => <button type="button" key={issue.id} onClick={() => props.onIssue(issue.sectionId)}><span className={`issue-icon ${issue.kind.toLowerCase()}`}>!</span><span><b>{issue.kind.replaceAll('_', ' ')}</b><em>{issue.message}</em></span><i>→</i></button>)}</div>}</> : <div className="qa-clear"><b>✓</b><span>확인할 오류가 없습니다.</span></div>}</aside>
    <section className="preview-area"><div className="preview-toolbar"><div><p className="eyebrow">REPORT PREVIEW · ALL PAGES</p><h2>{props.activeSection.id}</h2></div><select aria-label="Preview section" value={props.activeSection.id} onChange={(event) => props.onSection(event.target.value)}>{props.report.sections.map((section) => <option key={section.id}>{section.id}</option>)}</select><b className="preview-count">{props.pages.length} PAGES</b></div>
      <div className="preview-stage" aria-label="전체 Report Preview">{props.pages.length ? props.pages.map((page) => <article className="report-page" data-page-index={page.index} key={page.index}><header><div><b>UNDERWATER SERVICE REPORT</b><span>{props.activeSection.id}</span></div><em>PAGE {page.index + 1}</em></header><div className={page.photos.length <= 4 ? 'preview-grid four' : 'preview-grid six'}>{page.photos.map((photo) => <div className="preview-photo" key={photo.id}><div><PhotoThumb file={photo.file} alt={photo.file.name} /><span className={`phase-tag ${photo.phase?.toLowerCase()}`}>{photo.phase}</span></div><p>{createCaption(photo, props.activeSection, phaseIndexForPhoto(photo, props.report.photos))}</p></div>)}</div><footer><span>Condition by phase</span><span>{props.activeSection.phases.map((phase) => `${phase} ${formatConditionSummary(props.activeSection.conditions[phase])}`).join(' · ')}</span></footer></article>) : <div className="preview-empty"><b>0P</b><span>Report Use 사진을 추가하면 페이지가 자동 생성됩니다.</span></div>}</div>
      <div className="preview-footer"><span>Word 출력: Phase별 Page 1은 4장 · 이후 6장</span><button type="button" className="primary" onClick={props.onNext}>Word 준비</button></div>
    </section>
  </div>;
}

function ExportScreen({ vesselName, report, status, onBack, onExport, busy }: { vesselName: string; report: ReportState; status: string; onBack: () => void; onExport: () => void; busy: boolean }) {
  const wordPageCount = buildWordPhasePages(report.sections, report.photos).length;
  return <div className="workspace export-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 05</p><h2>Word 보고서 다운로드</h2><p>공식 Detail Service Record 템플릿에 Phase별 사진과 Condition을 채웁니다.</p></div><span className="privacy-chip">LOCAL EXPORT</span></div><div className="export-card"><div className="export-doc"><span>DOCX</span><div><b>{vesselName}</b><p>Detail Service Record 템플릿 · {wordPageCount} Word pages · {report.photos.filter((photo) => photo.reportUse && photo.sectionId).length} photos</p></div></div><dl><div><dt>Layout</dt><dd>A4 Portrait · Phase-first</dd></div><div><dt>Page rule</dt><dd>4 + 6 / phase</dd></div><div><dt>Processing</dt><dd>Sequential local resize</dd></div></dl><button type="button" className="primary export-button" disabled={busy} onClick={onExport}>{busy ? 'Word 생성 중…' : 'Word 보고서 다운로드'}</button><p>{status}</p></div><div className="actionbar"><button type="button" className="text-button" onClick={onBack}>← Check / Preview</button></div></div>;
}
