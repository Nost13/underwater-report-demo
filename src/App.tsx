'use client';

import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { createDemoPhotos, COMPONENT_OPTIONS, DEMO_VESSELS, SERVICES } from './app/demoData';
import { deriveOperationValues, emptyReportInfo, reportInfoForScopes, reportInfoFromVessel, type ReportInfo } from './app/reportInfo';
import { ReportInformation } from './app/ReportInformation';
import { CoverEditor } from './app/CoverEditor';
import { createCoverInfo, syncGeneratedCoverScope, type CoverInfo } from './app/coverInfo';
import { lookupVesselSchedule, type VesselSchedule } from './app/scheduleLookup';
import { lookupVessel } from './app/vesselLookup';
import { VesselDiagramEditor } from './app/VesselDiagramEditor';
import { VesselDiagramPreview } from './app/VesselDiagramPreview';
import { createBilgeKeelMarkers } from './vesselDiagram/geometry';
import { bilgeQuantityFromSections, requiredMarkerGroups } from './vesselDiagram/markers';
import type { VesselDiagramConfig, ZoneMarker } from './vesselDiagram/types';
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
import { conciseSectionLabel, defaultReportLabels, reportLabelKey } from './app/reportLabels';
import { defaultWorkPerformed, workPerformLabelKey } from './app/workPerformLabels';
import type { WorkPerformLabel } from './domain/types';
import { filterSections, groupSections, sectionWindow } from './app/sectionNavigator';
import { createSectionTree, folderRelativePath, pickDirectory, scanImages, type DirectoryHandleLike } from './browser/directory';
import { ThumbnailPool, type ThumbnailLease } from './browser/images';
import { composePhotoCaption, createCaption, matchPhotoPath, phaseIndexForPhoto, photoFolderContext, summarizePhotoImport } from './domain/photos';
import { buildWordPhasePages, type WordPhasePage } from './docx/reportModel';
import { ratingFill } from './docx/ratingPalette';
import { buildSummaryModel } from './summary/summaryModel';
import { checkReport } from './domain/qa';
import {
  applyServicePreset,
  createGeneralTargets,
  createNicheTargets,
  createReportSections,
  GENERAL_SIDES,
  GENERAL_ZONES,
  mergeScopeTargets,
  removeTargetService,
  toggleTargetService,
} from './domain/structure';
import type { WordExportInput, WordExportResult } from './docx/templateWriter';
import type {
  NicheType,
  Condition,
  Phase,
  PhotoData,
  QaIssue,
  ReportSection,
  ScopeTarget,
  ServiceKind,
} from './domain/types';

const thumbnails = new ThumbnailPool();
const stages = ['Vessel / Scope', 'Report Information', 'Cover', 'Vessel Diagram', '사진 폴더', 'Report Input', 'Check / Preview', 'Summary', 'Word'];

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sameMarkerRect = (a: ZoneMarker, b: ZoneMarker) => (
  Math.abs(a.rect.x - b.rect.x) < 1e-8
  && Math.abs(a.rect.y - b.rect.y) < 1e-8
  && Math.abs(a.rect.width - b.rect.width) < 1e-8
  && Math.abs(a.rect.height - b.rect.height) < 1e-8
);

const markerRequirementKey = (sections: ReportSection[]) => requiredMarkerGroups(sections)
  .map((group) => `${group.id}:${group.markerIds.join(',')}`)
  .join('|');

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
      aria-label={index === 0 ? label : undefined}
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
      captionText: '',
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

export default function App({
  exporter = loadWordExporter,
  vesselLookup = lookupVessel,
  scheduleLookup = lookupVesselSchedule,
}: {
  exporter?: WordExporter;
  vesselLookup?: typeof lookupVessel;
  scheduleLookup?: typeof lookupVesselSchedule;
}) {
  const [stage, setStage] = useState(0);
  const [imo, setImo] = useState('');
  const [vessel, setVessel] = useState<(typeof DEMO_VESSELS)[number] | null>(null);
  const [vesselMatches, setVesselMatches] = useState<(typeof DEMO_VESSELS)[number][]>([]);
  const [vesselSchedules, setVesselSchedules] = useState<VesselSchedule[]>([]);
  const [vesselSchedule, setVesselSchedule] = useState<VesselSchedule | null>(null);
  const [isVesselLookupPending, setIsVesselLookupPending] = useState(false);
  const [reportInfo, setReportInfo] = useState<ReportInfo>(() => emptyReportInfo());
  const [coverInfo, setCoverInfo] = useState<CoverInfo>(() => createCoverInfo());
  const [activeService, setActiveService] = useState<ServiceKind>('CLEANING');
  const [generalScope, setGeneralScope] = useState<GeneralScopeState>(() => ({
    targets: createGeneralTargets(),
    undo: null,
  }));
  const [nicheDraft, setNicheDraft] = useState<NicheDraft>({ component: 'Sea Chest', type: 'SIDE_QUANTITY', quantity: 2 });
  const [includeFinBlade, setIncludeFinBlade] = useState(false);
  const [nicheItems, setNicheItems] = useState<NicheGroup[]>([]);
  const [scopeMeta, setScopeMeta] = useState<{ vesselName: string } | null>(null);
  const [vesselDiagram, setVesselDiagram] = useState<VesselDiagramConfig | null>(null);
  const [report, dispatch] = useReducer(reportReducer, initialReportState);
  const [folder, setFolder] = useState<DirectoryHandleLike | null>(null);
  const [folderStructureCreated, setFolderStructureCreated] = useState(false);
  const [photoImportComplete, setPhotoImportComplete] = useState(false);
  const [standardPathsDetected, setStandardPathsDetected] = useState(false);
  const [status, setStatus] = useState('사진 폴더를 선택하거나 샘플 사진으로 흐름을 확인하세요.');
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [activePhotoPhase, setActivePhotoPhase] = useState<Phase>('BEFORE');
  const [isExporting, setIsExporting] = useState(false);
  const [diagramExportError, setDiagramExportError] = useState<string | null>(null);
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

  useEffect(() => {
    setCoverInfo((current) => syncGeneratedCoverScope(current, report.sections));
  }, [report.sections]);

  const focusReportSection = (sectionId: string) => {
    const nextSection = report.sections.find((section) => section.id === sectionId);
    if (!nextSection) return;
    dispatch({ type: 'FOCUS_SECTION', sectionId });
    if (report.focusedSectionId !== sectionId) setActivePhotoPhase(nextSection.phases[0]);
  };

  const buildScope = () => {
    const sections = createReportSections(draftTargets);
    const previousSections = report.sections;
    const previousDiagram = vesselDiagram;
    if (previousDiagram) {
      const previousQuantity = bilgeQuantityFromSections(previousSections);
      const nextQuantity = bilgeQuantityFromSections(sections);
      const defaultBilges = createBilgeKeelMarkers(previousDiagram.calibration, previousQuantity);
      const existingBilges = previousDiagram.nicheMarkers.filter((marker) => marker.id.startsWith('bilge-keel-'));
      const bilgesWereAdjusted = existingBilges.some((marker) => {
        const expected = defaultBilges.find((candidate) => candidate.id === marker.id);
        return !expected || !sameMarkerRect(marker, expected);
      });
      if (previousQuantity !== nextQuantity && bilgesWereAdjusted
        && !window.confirm('빌지킬 수량을 변경하면 조정한 위치가 다시 배치됩니다. 계속할까요?')) return;
      const requirementsChanged = markerRequirementKey(previousSections) !== markerRequirementKey(sections);
      if (previousQuantity !== nextQuantity) {
        setVesselDiagram({
          ...previousDiagram,
          nicheMarkers: [
            ...previousDiagram.nicheMarkers.filter((marker) => !marker.id.startsWith('bilge-keel-')),
            ...createBilgeKeelMarkers(previousDiagram.calibration, nextQuantity),
          ],
          confirmed: false,
        });
      } else if (requirementsChanged) setVesselDiagram({ ...previousDiagram, confirmed: false });
    }
    dispatch({ type: 'SET_SCOPE', sections });
    setActivePhotoPhase(sections[0]?.phases[0] ?? 'BEFORE');
    setScopeMeta({ vesselName: vessel?.name ?? 'UNDERWATER REPORT' });
    setReportInfo((current) => reportInfoForScopes(current, [...new Set(sections.map((section) => section.service))]));
    setFolderStructureCreated(false);
    setPhotoImportComplete(false);
    setStandardPathsDetected(false);
  };

  const resetScope = () => {
    dispatch({ type: 'SET_SCOPE', sections: [] });
    setScopeMeta(null);
    setFolder(null);
    setFolderStructureCreated(false);
    setPhotoImportComplete(false);
    setStandardPathsDetected(false);
    setUnmatchedOpen(false);
    setActivePhotoPhase('BEFORE');
    setVesselDiagram(null);
    setDiagramExportError(null);
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

  const toggleGeneral = (targetId: string) => changeGeneral((targets) =>
    targets.map((target) => target.id === targetId
      ? toggleTargetService(target, activeService)
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
    const summary = summarizePhotoImport(photos);
    setPhotoImportComplete(true);
    setStandardPathsDetected(summary.standardPathsDetected);
    setStatus(`${summary.total}장 불러옴 · ${summary.matched}장 자동 매칭 · 미배정 사진 ${summary.unmatched}장`);
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
      setStandardPathsDetected(false);
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
    const summary = summarizePhotoImport(photos);
    setPhotoImportComplete(true);
    setStandardPathsDetected(summary.standardPathsDetected);
    setStatus(`${summary.total}장 불러옴 · ${summary.matched}장 자동 매칭 · 미배정 사진 ${summary.unmatched}장`);
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
    if (report.sections.length === 0 || !vesselDiagram?.confirmed) {
      setStatus('먼저 Scope를 만들어야 Report Input으로 이동할 수 있습니다.');
      return;
    }
    setStage(5);
  };

  const focusIssue = (sectionId: string | null) => {
    if (sectionId) focusReportSection(sectionId);
    else setUnmatchedOpen(true);
    setStage(5);
  };

  const selectReportVessel = async (found: (typeof DEMO_VESSELS)[number]) => {
    setVessel(found);
    const baseInfo = reportInfoFromVessel(found);
    setReportInfo(baseInfo);
    setVesselSchedules([]);
    setVesselSchedule(null);
    const schedules = await scheduleLookup(found.name);
    const nextSchedule = schedules[0] ?? null;
    setVesselSchedules(schedules);
    setVesselSchedule(nextSchedule);
    if (nextSchedule) {
      setReportInfo({
        ...baseInfo,
        operation: deriveOperationValues({
          ...baseInfo.operation,
          eta: nextSchedule.eta,
          etd: nextSchedule.etd,
          location: [nextSchedule.port, nextSchedule.terminal, nextSchedule.berth].filter(Boolean).join(' / '),
          berthingSide: nextSchedule.direction,
        }),
      });
      setStatus(`${found.name} 선박 제원과 ChainPortal 입출항 일정을 불러왔습니다.`);
    } else {
      setStatus(`${found.name} 선박 정보를 불러왔습니다. ChainPortal 예정 일정은 직접 입력할 수 있습니다.`);
    }
  };

  const lookupReportVessel = async () => {
    if (isVesselLookupPending) return;
    setIsVesselLookupPending(true);
    try {
      const matches = await vesselLookup(imo);
      setVesselMatches(matches);
      const found = matches[0] ?? null;
      if (found) await selectReportVessel(found);
      else {
        setVessel(null);
        setVesselSchedules([]);
        setVesselSchedule(null);
        setStatus('VesselFinder에서 조회 결과를 찾지 못했습니다. 선박 정보를 직접 입력할 수 있습니다.');
      }
    } finally {
      setIsVesselLookupPending(false);
    }
  };

  const runExport = async () => {
    if (isExporting) return;
    if (!vesselDiagram?.confirmed) {
      setStatus('선박 위치도 설정을 완료한 뒤 Word 보고서를 생성하세요.');
      return;
    }
    setIsExporting(true);
    setDiagramExportError(null);
    setStatus('사진을 순차 처리하여 Word 보고서를 만드는 중입니다…');
    try {
      const result = await exporter({
        vesselName: scopeMeta?.vesselName ?? 'UNDERWATER REPORT',
        sections: report.sections,
        photos: report.photos,
        reportLabels: report.reportLabels,
        workPerformLabels: report.workPerformLabels,
        reportInfo,
        vesselDiagram,
        templateUrl: 'templates/Detail_report_template.docx',
        section14TemplateUrl: 'templates/section1_4_template.docx',
        summaryTemplateUrl: 'templates/summary_template.docx',
        section6TemplateUrl: 'templates/section6_template.docx',
        section8TemplateUrl: 'templates/section8_template.docx',
      });
      setStatus(result.skipped.length
        ? `Word 보고서 완료 · 읽을 수 없어 제외된 사진: ${result.skipped.join(', ')}`
        : 'Word 보고서 다운로드가 완료되었습니다.');
    } catch (error) {
      const diagramFailure = error instanceof Error
        ? /^(VESSEL_MARKER_NOT_FOUND|VESSEL_DIAGRAM_COMPOSITION_FAILED):(.+)$/.exec(error.message)
        : null;
      if (diagramFailure) {
        const section = report.sections.find(({ id }) => id === diagramFailure[2]);
        const sectionLabel = section
          ? `${conciseSectionLabel(section)} · ${section.service} (${section.phases.join(' / ')})`
          : diagramFailure[2];
        const reason = diagramFailure[1] === 'VESSEL_MARKER_NOT_FOUND' ? '필수 표식이 없습니다' : '이미지를 만들지 못했습니다';
        setDiagramExportError(`선박 위치도 — ${sectionLabel}: ${reason}. 선박 위치도 설정에서 이미지와 해당 구역 표식을 확인한 뒤 다시 저장하고 다운로드하세요.`);
      } else {
        setStatus('Word 보고서를 만들지 못했습니다. 사진 형식과 브라우저 다운로드 권한을 확인하세요.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return <main className="app-shell">
    <input {...{ webkitdirectory: '' }} ref={fallbackInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => importFallback(event.target.files)} />
    <input ref={manualInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => { importManualPhotos(event.target.files); event.currentTarget.value = ''; }} />
    <StageRail active={stage} onMove={(next) => {
      const canMove = next === 0
        || (next >= 1 && next <= 3 && report.sections.length > 0)
        || (next >= 4 && vesselDiagram?.confirmed);
      if (!canMove) return;
      if (next === 8 && stage !== 7 && stage !== 8) {
        setStage(7);
        return;
      }
      setStage(next);
    }} />
    <section className="app-main">
      <header className="topbar"><div><p className="eyebrow">UNDERWATER SERVICE REPORT</p><h1>{scopeMeta?.vesselName ?? vessel?.name ?? 'New report'}</h1></div><div className="top-meta"><span>{serviceSummary}</span><span>{report.sections.length} SECTIONS</span><span>{report.photos.length} PHOTOS</span></div></header>

      {stage === 0 && <VesselScope
        imo={imo} setImo={setImo} vessel={vessel} activeService={activeService} setActiveService={selectService}
        generalTargets={generalTargets} generalUndo={generalScope.undo}
        onGeneralToggle={toggleGeneral} onGeneralRemove={removeGeneral}
        onGeneralPreset={applyGeneral} onGeneralClear={clearGeneral}
        onGeneralUndo={() => setGeneralScope((current) => current.undo
          ? { targets: current.undo, undo: null }
          : current)}
        nicheDraft={nicheDraft} setNicheDraft={setNicheDraft} nicheItems={nicheItems}
        includeFinBlade={includeFinBlade} setIncludeFinBlade={setIncludeFinBlade}
        addNiche={addNiche} removeNiche={(id) => setNicheItems((items) => items.filter((item) => item.id !== id))}
        onNicheToggle={(groupId, targetId) => changeNicheTarget(groupId, targetId, (target) => toggleTargetService(target, activeService))}
        onNicheRemove={(groupId, targetId, service) => changeNicheTarget(groupId, targetId, (target) => removeTargetService(target, service))}
        reportInfo={reportInfo} setReportInfo={setReportInfo} vesselMatches={vesselMatches} vesselSchedules={vesselSchedules} vesselSchedule={vesselSchedule}
        onVesselSelect={(next) => { if (isVesselLookupPending) return; setIsVesselLookupPending(true); void selectReportVessel(next).finally(() => setIsVesselLookupPending(false)); }}
        onScheduleSelect={(next) => { setVesselSchedule(next); setReportInfo((current) => ({ ...current, operation: deriveOperationValues({ ...current.operation, eta: next.eta, etd: next.etd, location: [next.port, next.terminal, next.berth].filter(Boolean).join(' / '), berthingSide: next.direction }) })); }}
        onLookup={lookupReportVessel} vesselLookupPending={isVesselLookupPending}
        onBuild={buildScope} onReset={resetScope} sectionCount={report.sections.length} draftSections={draftSections}
        onPhotos={() => setStage(1)}
      />}

      {stage === 1 && <ReportInformation value={reportInfo} onChange={setReportInfo} onBack={() => setStage(0)} onNext={() => setStage(2)} />}

      {stage === 2 && <CoverEditor
        value={coverInfo} onChange={setCoverInfo} reportInfo={reportInfo} sections={report.sections}
        onBack={() => setStage(1)} onNext={() => setStage(3)} onEditReportInfo={() => setStage(1)}
      />}

      {stage === 3 && <div className="workspace diagram-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 04</p><h2>선박 위치도 설정</h2><p>선체 기준과 작업 구역을 확인한 뒤 다음 단계로 이동하세요.</p></div><span className="privacy-chip">LOCAL ONLY</span></div><VesselDiagramEditor
        sections={report.sections} value={vesselDiagram} onChange={setVesselDiagram}
        onBack={() => setStage(2)} onNext={() => setStage(4)}
      /></div>}

      {stage === 4 && <PhotoSource
        photoCount={report.photos.length} matchedCount={report.photos.length - unmatched.length} unmatchedCount={unmatched.length}
        status={status} hasFolder={Boolean(folder)} structureCreated={folderStructureCreated} importComplete={photoImportComplete} standardPathsDetected={standardPathsDetected} folderName={folder?.name ?? null} sections={report.sections}
        onSelect={selectPhotoFolder} onCreate={createFolders} onLoad={reloadFolder}
        onDemo={loadDemo} onBack={() => setStage(3)} onNext={openReportInput}
      />}

      {stage === 5 && activeSection && <ReportInput
        report={report} activeSection={activeSection} activePhotos={activePhotos}
        unmatched={unmatched} unmatchedOpen={unmatchedOpen}
        pages={pages} issues={issues}
        activePhotoTarget={activePhotoTarget}
        onToggleUnmatched={() => setUnmatchedOpen((open) => !open)} onCloseUnmatched={() => setUnmatchedOpen(false)}
        onChooseImported={(target) => { setActivePhotoPhase(target.phase); setUnmatchedOpen(true); }}
        onSelectPhotoTarget={(target) => setActivePhotoPhase(target.phase)} onAssignUnmatched={assignUnmatchedToActivePhase}
        onSection={focusReportSection}
        dispatch={dispatch} onOpen={selectPhotoFolder} onAddPhotos={addPhotosToPhase} onBack={() => setStage(4)} onNext={() => setStage(6)}
      />}

      {stage === 6 && activeSection && vesselDiagram?.confirmed && <CheckPreview
        report={report} activeSection={activeSection} issues={issues}
        vesselDiagram={vesselDiagram}
        vesselName={scopeMeta?.vesselName ?? 'UNDERWATER REPORT'}
        onIssue={focusIssue} onSection={focusReportSection}
        onNext={() => setStage(7)}
      />}

      {stage === 7 && activeSection && <SummaryReview
        vesselName={scopeMeta?.vesselName ?? 'UNDERWATER REPORT'} report={report}
        onBack={() => setStage(6)} onEditDetail={() => setStage(5)} onNext={() => setStage(8)}
      />}

      {stage === 8 && activeSection && <ExportScreen
        vesselName={scopeMeta?.vesselName ?? 'UNDERWATER REPORT'} report={report} status={diagramExportError ?? status}
        onDiagramSetup={diagramExportError ? () => { setDiagramExportError(null); setStage(3); } : undefined}
        onBack={() => setStage(7)} onExport={runExport} busy={isExporting}
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
  onToggle: () => void;
  onRemove: (service: ServiceKind) => void;
}

function TargetCell(props: TargetCellProps) {
  const label = targetLabel(props.target);
  const active = props.target.services.includes(props.activeService);
  const shortLabel = [props.target.side, props.target.unit ? `#${String(props.target.unit).padStart(2, '0')}` : null]
    .filter(Boolean).join(' ') || props.target.component;
  return <div className={props.target.services.length ? 'target-cell assigned' : 'target-cell'}>
    <button type="button" className="target-main" disabled={props.locked} aria-label={`${label} ${active ? '작업 해제' : '작업 배정'}`} aria-pressed={active} onClick={props.onToggle}>
      {props.compact ? (active ? '클릭 해제' : '클릭 배정') : shortLabel}
    </button>
    <div className="target-status" aria-label={`${label} 배정 상태`}>
      {props.target.services.length ? props.target.services.map((service) => <button
        type="button"
        key={service}
        disabled={props.locked}
        className={`service-chip ${service.toLowerCase()}${service === props.activeService ? ' active-service' : ''}`}
        aria-label={`${label} ${service} 제거`}
        onClick={() => props.onRemove(service)}
      >{service}<span>×</span></button>) : <span>—</span>}
    </div>
  </div>;
}

interface VesselScopeProps {
  imo: string; setImo: (value: string) => void; vessel: (typeof DEMO_VESSELS)[number] | null;
  vesselMatches: (typeof DEMO_VESSELS)[number][]; onVesselSelect: (vessel: (typeof DEMO_VESSELS)[number]) => void;
  vesselSchedules: VesselSchedule[]; vesselSchedule: VesselSchedule | null;
  onScheduleSelect: (schedule: VesselSchedule) => void;
  reportInfo: ReportInfo; setReportInfo: React.Dispatch<React.SetStateAction<ReportInfo>>;
  activeService: ServiceKind; setActiveService: (value: ServiceKind) => void;
  generalTargets: ScopeTarget[]; generalUndo: ScopeTarget[] | null;
  onGeneralToggle: (targetId: string) => void;
  onGeneralRemove: (targetId: string, service: ServiceKind) => void;
  onGeneralPreset: (side?: ScopeTarget['side']) => void; onGeneralClear: () => void; onGeneralUndo: () => void;
  nicheDraft: NicheDraft; setNicheDraft: (value: NicheDraft) => void; nicheItems: NicheGroup[];
  includeFinBlade: boolean; setIncludeFinBlade: (value: boolean) => void;
  addNiche: () => void; removeNiche: (id: string) => void;
  onNicheToggle: (groupId: string, targetId: string) => void;
  onNicheRemove: (groupId: string, targetId: string, service: ServiceKind) => void;
  onLookup: () => void; vesselLookupPending: boolean; onBuild: () => void; onReset: () => void;
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
  const activeServiceLabel = SERVICES.find((item) => item.value === props.activeService)?.label
    ?? props.activeService;
  const scopeCombinationLabel = serviceCounts.map((item) => item.label).join(' + ');
  const scopeButtonLabel = scopeCombinationLabel
    ? `${scopeCombinationLabel} Scope 만들기`
    : 'Scope 만들기';
  const totalSections = serviceCounts.reduce((total, item) => total + item.count, 0);
  const unassignedGeneral = props.generalTargets.filter((target) => target.services.length === 0).length;
  const numeric = (value: string, suffix = '') => value ? `${Number(value).toLocaleString('en-US')}${suffix ? ` ${suffix}` : ''}` : '—';
  const scheduleLocation = (schedule: VesselSchedule) => [schedule.port, schedule.terminal, schedule.berth].filter(Boolean).join(' / ') || '—';
  const scheduleTime = (value: string) => value ? value.replace('T', ' ') : '—';
  const setCardVesselField = (field: 'ownerClient' | 'jobNo', value: string) => props.setReportInfo((current) => ({
    ...current,
    vessel: { ...current.vessel, [field]: value },
  }));

  return <div className="workspace wide scope-workspace">
    <div className="page-heading"><div><p className="step-kicker">STEP 01</p><h2>Vessel / Scope</h2><p>Vessel DB는 선박 확인에만 사용됩니다. 보고서와 사진은 이 브라우저 탭에만 있습니다.</p></div><span className="privacy-chip">서버 저장 없음</span></div>
    <div className="scope-grid">
      <section className="panel vessel-panel"><div className="panel-title"><span>01</span><div><h3>Vessel 확인</h3><p>운영부 VesselFinder 조회</p></div></div>
        <label className="field"><span>Vessel name / IMO number / Call Sign</span><div className="input-action"><input aria-label="Vessel name / IMO number / Call Sign" value={props.imo} disabled={locked} onChange={(event) => props.setImo(event.target.value)} /><button type="button" className={props.vesselLookupPending ? 'lookup-pending' : undefined} aria-label={props.vesselLookupPending ? '선박 확인 중' : 'Vessel 확인'} disabled={locked || props.vesselLookupPending} onClick={props.onLookup}>{props.vesselLookupPending && <span className="vessel-lookup-spinner" role="status" aria-label="선박 조회 진행 중" />}<span>{props.vesselLookupPending ? '확인 중…' : 'Vessel 확인'}</span></button></div></label>
        {props.vesselMatches.length > 1 && <select className="vessel-match-select" aria-label="선박 조회 결과" value={props.vessel?.imo ?? ''} onChange={(event) => { const selected = props.vesselMatches.find((item) => item.imo === event.target.value); if (selected) props.onVesselSelect(selected); }}><option value="">선박을 선택하세요</option>{props.vesselMatches.map((item) => <option key={`${item.imo}-${item.name}`} value={item.imo}>{item.name} · IMO {item.imo || '—'}</option>)}</select>}
        {props.vessel ? <section className="vessel-card" aria-label="VesselFinder 선박 제원">
          <div className="vessel-card-main"><div className="vessel-icon">MV</div><div><span>VESSEL NAME</span><strong>{props.vessel.name}</strong><em>{props.vessel.type || '—'}</em></div></div>
          <dl className="vessel-particulars">
            <div><dt>IMO NUMBER</dt><dd>{props.vessel.imo || '—'}</dd></div><div><dt>CALL SIGN</dt><dd>{props.vessel.callSign || '—'}</dd></div>
            <div><dt>LOA (m)</dt><dd>{numeric(props.vessel.loa ?? '', 'm')}</dd></div><div><dt>BREADTH (m)</dt><dd>{numeric(props.vessel.breadth ?? '', 'm')}</dd></div>
            <div><dt>GT</dt><dd>{numeric(props.vessel.gt ?? '')}</dd></div><div><dt>DWT</dt><dd>{numeric(props.vessel.dwt ?? '')}</dd></div><div><dt>YEAR BUILT</dt><dd>{props.vessel.yearBuilt || '—'}</dd></div>
            <div><dt>OWNER / CLIENT</dt><dd><input aria-label="Owner / Client" value={props.reportInfo.vessel.ownerClient} placeholder="입력" onChange={(event) => setCardVesselField('ownerClient', event.target.value)} /></dd></div>
            <div><dt>JOB NO.</dt><dd><input aria-label="Job No" value={props.reportInfo.vessel.jobNo} placeholder="입력" onChange={(event) => setCardVesselField('jobNo', event.target.value)} /></dd></div>
          </dl>
          <section className="vessel-schedule" aria-label="ChainPortal 운항 일정">
            <header><div><span>CHAINPORTAL SCHEDULE</span><strong>{props.vesselSchedule ? '예정 일정 확인' : '예정 일정 없음'}</strong></div><em>{props.vesselSchedule ? '자동 입력됨' : '직접 입력 가능'}</em></header>
            {props.vesselSchedule ? <>
              {props.vesselSchedules.length > 1 && <select aria-label="ChainPortal 일정 선택" value={`${props.vesselSchedule.eta}|${props.vesselSchedule.etd}|${props.vesselSchedule.berth}`} onChange={(event) => { const next = props.vesselSchedules.find((item) => `${item.eta}|${item.etd}|${item.berth}` === event.target.value); if (next) props.onScheduleSelect(next); }}>{props.vesselSchedules.map((item) => <option key={`${item.vessel}-${item.eta}-${item.berth}`} value={`${item.eta}|${item.etd}|${item.berth}`}>{scheduleTime(item.eta)} · {scheduleLocation(item)}</option>)}</select>}
              <dl><div><dt>ETA</dt><dd>{scheduleTime(props.vesselSchedule.eta)}</dd></div><div><dt>ETD</dt><dd>{scheduleTime(props.vesselSchedule.etd)}</dd></div><div><dt>LOCATION</dt><dd>{scheduleLocation(props.vesselSchedule)}</dd></div><div><dt>BERTHING SIDE</dt><dd>{props.vesselSchedule.direction || '—'}</dd></div></dl>
            </> : <p>ChainPortal에 현재 예정된 입출항 일정이 없습니다.</p>}
          </section>
        </section> : <div className="empty-note">VesselFinder에서 선박명 또는 IMO 번호를 조회합니다.</div>}
      </section>
      <section className="panel scope-panel"><div className="panel-title"><span>02</span><div><h3>Service / Scope</h3><p>추가할 작업을 먼저 선택하고 필요한 Section에 배정</p></div></div>
        <div className="service-brush-heading"><b>추가할 작업 선택</b><span>Service를 바꿔도 기존 배정은 유지됩니다.</span></div>
        <div className="service-brush" aria-label="Service 작업 선택">{SERVICES.map((item) => <button
          type="button"
          key={item.value}
          disabled={locked}
          aria-label={`${item.label} 작업 선택`}
          aria-pressed={props.activeService === item.value}
          className={props.activeService === item.value ? `active ${item.value.toLowerCase()}` : ''}
          onClick={() => props.setActiveService(item.value)}
        >{item.label}</button>)}</div>
        <div className={`service-addition-mode ${props.activeService.toLowerCase()}`} aria-label="현재 추가 작업">
          <span>현재 추가 작업</span><strong>{props.activeService}</strong>
          <p>아래 선택과 클릭은 {activeServiceLabel} 작업만 추가·해제합니다. 기존 배정은 유지됩니다.</p>
        </div>
        <div className="phase-rule"><b>{props.activeService === 'INSPECTION' ? 'CURRENT' : 'BEFORE  →  AFTER'}</b><span>{props.activeService === 'INSPECTION' ? 'Inspection 단일 phase' : 'AFTER 기본값 CLEAN / R0'}</span></div>

        <section className={polishingActive ? 'general-builder restricted' : 'general-builder'}><div className="mini-heading"><b>GENERAL</b><span>{polishingActive ? 'Polishing은 Propeller Blade · Fin Blade · Boss Cap 전용입니다.' : `현재 추가 작업: ${props.activeService}`}</span></div>
          <div className="preset-row"><button type="button" disabled={generalLocked} onClick={() => props.onGeneralPreset()}>전체 적용</button>{GENERAL_SIDES.map((side) => <button type="button" disabled={generalLocked} key={side} onClick={() => props.onGeneralPreset(side)}>{side} 적용</button>)}<button type="button" disabled={generalLocked} onClick={props.onGeneralClear}>모두 해제</button><button type="button" disabled={generalLocked || !props.generalUndo} onClick={props.onGeneralUndo}>실행 취소</button></div>
          <div className="general-matrix"><div className="matrix-corner">ZONE</div>{GENERAL_SIDES.map((side) => <b key={side}>{side}</b>)}{GENERAL_ZONES.map((zone) => <div className="general-matrix-row" key={zone}><strong>{zone}</strong>{GENERAL_SIDES.map((side) => { const target = props.generalTargets.find((item) => item.component === zone && item.side === side)!; return <TargetCell key={target.id} target={target} activeService={props.activeService} locked={generalLocked} compact onToggle={() => props.onGeneralToggle(target.id)} onRemove={(service) => props.onGeneralRemove(target.id, service)} />; })}</div>)}</div>
        </section>

        <section className="niche-builder"><div className="mini-heading"><b>NICHE</b><span>현재 추가 작업: {props.activeService}</span></div><div className="niche-controls">
          <select aria-label="Niche component" value={props.nicheDraft.component} disabled={locked} onChange={(event) => { const option = componentOptions.find((item) => item.name === event.target.value)!; props.setIncludeFinBlade(false); props.setNicheDraft({ component: option.name, type: option.defaultType, quantity: option.defaultQuantity }); }}>{componentOptions.map((item) => <option key={item.name}>{item.name}</option>)}</select>
          <select aria-label="Niche type" value={props.nicheDraft.type} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, type: event.target.value as NicheType })}>{['SINGLE', 'SIDE', 'QUANTITY', 'SIDE_QUANTITY'].map((type) => <option key={type}>{type}</option>)}</select>
          <div className="quantity-stepper"><button type="button" aria-label="수량 감소" disabled={locked || props.nicheDraft.quantity <= 1} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.max(1, props.nicheDraft.quantity - 1) })}>−</button><input aria-label="Quantity" type="number" min="1" max="12" value={props.nicheDraft.quantity} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Number(event.target.value) })} onBlur={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /><button type="button" aria-label="수량 증가" disabled={locked || props.nicheDraft.quantity >= 12} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, props.nicheDraft.quantity + 1) })}>＋</button></div>
          <button type="button" className={`scope-add-button ${props.activeService.toLowerCase()}`} aria-label={`${props.activeService} Scope 추가`} disabled={locked} onClick={props.addNiche}><span>＋</span>{props.activeService} Scope 추가</button>
        </div>{polishingActive && props.nicheDraft.component === 'Propeller Blade' && <><div className="polishing-set-note" aria-label="자동 추가 작업"><strong>한 번에 함께 추가</strong><div><span className="service-chip polishing">POLISHING</span><b>Propeller Blade ×{props.nicheDraft.quantity} · {props.includeFinBlade ? `Fin Blade ×${props.nicheDraft.quantity} · ` : ''}Boss Cap</b></div><div><span className="service-chip inspection">INSPECTION</span><b>Rope Guard</b></div></div><label className="fin-blade-option"><input type="checkbox" aria-label="Fin Blade 포함" checked={props.includeFinBlade} disabled={locked} onChange={(event) => props.setIncludeFinBlade(event.target.checked)} /><span><b>Fin Blade 포함</b><small>Propeller Blade와 동일 수량으로 함께 추가</small></span></label></>}{props.nicheItems.map((item) => <article className="niche-group" key={item.id}><header><div><b>{item.component}</b><span>{item.type}{item.type.includes('QUANTITY') ? ` ×${item.quantity}` : ''}</span></div><button type="button" disabled={locked} aria-label={`${item.component} 삭제`} onClick={() => props.removeNiche(item.id)}>×</button></header><div className="niche-targets">{item.targets.map((target) => <TargetCell key={target.id} target={target} activeService={props.activeService} locked={locked} onToggle={() => props.onNicheToggle(item.id, target.id)} onRemove={(service) => props.onNicheRemove(item.id, target.id, service)} />)}</div></article>)}<p className="side-note">Side 없음: Discharge Pipe, Transducer, Stern Frame, Rope Guard, Propeller Blade, Fin Blade, Boss Cap</p></section>

        <div className="scope-summary" aria-label="Scope 배정 요약"><div className="scope-summary-main"><b>생성 예정 Scope</b><div>{serviceCounts.map((item) => <span key={item.value} className={item.value.toLowerCase()}>{item.value} {item.count}</span>)}</div></div><strong>총 {totalSections} Sections</strong><em>GENERAL 미배정 {unassignedGeneral}</em></div>
        <button type="button" className="primary full" disabled={!props.vessel || props.draftSections.length === 0} onClick={props.onBuild}>{scopeButtonLabel}</button>
        {locked && <div className="scope-ready"><b>총 {props.sectionCount} sections</b><em>Condition과 phase가 준비되었습니다.</em><div><button type="button" className="ghost" onClick={props.onPhotos}>Report Information 입력</button><button type="button" className="text-button" onClick={props.onReset}>Scope 초기화</button></div></div>}
      </section>
    </div>
  </div>;
}

interface PhotoSourceProps {
  photoCount: number; matchedCount: number; unmatchedCount: number; status: string; hasFolder: boolean; structureCreated: boolean; importComplete: boolean; standardPathsDetected: boolean; folderName: string | null; sections: ReportSection[];
  onSelect: () => void; onCreate: () => void; onLoad: () => void;
  onDemo: () => void; onBack: () => void; onNext: () => void;
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
    ? `사진 불러오기 완료 · ${props.photoCount}장 · ${props.standardPathsDetected ? '표준 폴더 경로 감지' : '표준 폴더 경로 없음'} · ${props.matchedCount}장 자동 매칭 · 미배정 사진 ${props.unmatchedCount}장`
    : '사진을 아직 불러오지 않음';

  return <div className="workspace wide"><div className="page-heading"><div><p className="step-kicker">STEP 05</p><h2>사진 폴더</h2><p>원본은 로컬 File 참조로만 유지하며 서버로 전송하지 않습니다.</p></div><span className="privacy-chip">{props.photoCount} PHOTOS</span></div>
    <section className="method-card recommended photo-folder-card"><div className="method-top"><span>03</span><em>PHOTO INPUT</em></div><h3>사진 준비</h3><p>사진을 넣기 전 폴더 구조로 분류하거나, 이미 있는 사진을 불러온 뒤 경로로 분류할 수 있습니다.</p>
      <ol className="photo-progress" aria-label="사진 입력 진행 상태"><li className={props.hasFolder ? 'done' : scopeReady ? 'current' : 'pending'}><span>{props.hasFolder ? '✓' : '1'}</span><div><b>사진 폴더 선택</b><small>사진이 저장된 폴더를 선택합니다.</small><strong>{folderResult}</strong><button type="button" className={props.hasFolder ? 'ghost' : 'primary'} disabled={!scopeReady} onClick={props.onSelect}>{props.hasFolder ? '다른 사진 폴더 선택' : '사진 폴더 선택'}</button></div></li><li className={props.structureCreated ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.structureCreated ? '✓' : '2'}</span><div><b>표준 폴더 구조 생성 <i>선분류</i></b><small>선택 폴더 안에 선택된 Scope와 구역의 폴더 구조를 생성합니다.</small><strong>{structureResult}</strong><button type="button" className={props.hasFolder && !props.structureCreated ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onCreate}>{props.structureCreated ? '폴더 구조 다시 생성' : '표준 폴더 구조 생성'}</button></div></li><li className={props.importComplete ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.importComplete ? '✓' : '3'}</span><div><b>사진 불러오기 <i>후분류</i></b><small>기존 폴더도 표준 경로가 있으면 자동 매칭하고, 나머지만 미배정 사진으로 분리합니다.</small><strong>{importResult}</strong><button type="button" className={props.hasFolder && !props.importComplete ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onLoad}>{props.importComplete ? '사진 다시 불러오기' : '사진 불러오기'}</button></div></li></ol>
      <section className="photo-scope-summary" aria-label="현재 작업 범위"><p>현재 작업 범위</p><div className="scope-work-list">{scopeGroups.map((group) => <div key={`${group.service}-${group.label}`}><b>{group.service}</b><span>{group.label} · {group.count}개 구역 · {group.phases.join(' / ')}</span></div>)}</div><small>총 {props.sections.length}개 Section · {phaseFolderCount}개 사진 폴더 · SERVICE 폴더는 같은 위치에 여러 Service가 있을 때만 추가됩니다.</small></section>
      <p className="folder-help"><b>선분류</b>는 사진을 넣기 전 표준 폴더를 만드는 방식이고, <b>후분류</b>는 기존 사진을 불러온 뒤 경로로 자동 분류하는 방식입니다.</p></section>
    <section className={`demo-strip${props.hasFolder || props.importComplete ? ' muted' : ''}`}><div><b>빠른 동작 확인</b><span>선택된 첫 Section에 BEFORE 3장 + AFTER 4장을 생성합니다.</span></div><button type="button" className="ghost" disabled={!scopeReady} onClick={props.onDemo}>샘플 사진 7장 불러오기</button></section>
    <p className="photo-status-detail" aria-label="사진 입력 상세 상태">{props.status}</p><div className="actionbar"><button type="button" className="text-button" onClick={props.onBack}>← 선박 위치도 설정</button><button type="button" className="primary" disabled={!scopeReady} onClick={props.onNext}>Report Input으로</button></div>
  </div>;
}

interface ReportInputProps {
  report: ReportState; activeSection: ReportSection; activePhotos: PhotoData[];
  unmatched: PhotoData[]; unmatchedOpen: boolean; pages: ReturnType<typeof selectedPages>;
  issues: QaIssue[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; onOpen: () => void;
  activePhotoTarget: { sectionId: string; phase: Phase } | null;
  onToggleUnmatched: () => void; onCloseUnmatched: () => void; onAddPhotos: (sectionId: string, phase: Phase) => void;
  onChooseImported: (target: { sectionId: string; phase: Phase }) => void;
  onSelectPhotoTarget: (target: { sectionId: string; phase: Phase }) => void; onAssignUnmatched: (photoId: string) => void; onSection: (sectionId: string) => void; onBack: () => void; onNext: () => void;
}

function ReportInput(props: ReportInputProps) {
  const activeIndex = Math.max(0, props.report.sections.findIndex((section) => section.id === props.activeSection.id));
  const activeSectionButtonRef = useRef<HTMLButtonElement>(null);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [sectionQuery, setSectionQuery] = useState('');
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);
  const visibleSections = sectionWindow(props.report.sections, props.activeSection.id);
  const sectionGroups = groupSections(filterSections(props.report.sections, sectionQuery));
  const labelKey = reportLabelKey(props.activeSection);
  const labels = props.report.reportLabels[labelKey] ?? defaultReportLabels(props.activeSection);
  const defaults = defaultReportLabels(props.activeSection);
  const sectionIssues = props.issues.filter((issue) => issue.sectionId === props.activeSection.id);
  const previewTitle = `${labels.detailTitle}${props.activeSection.unit ? ` ${props.activeSection.unit}` : ''}`;
  const previewBc = `${props.activeSection.area === 'NICHE' ? 'NICHE AREAS & COMPONENTS' : 'GENERAL AREAS'} / ${labels.upperAreaLabel}`;
  const focusSection = (index: number) => {
    const section = props.report.sections[index];
    if (section) {
      setLabelSettingsOpen(false);
      props.onSection(section.id);
    }
  };

  const selectSection = (sectionId: string) => {
    setLabelSettingsOpen(false);
    props.onSection(sectionId);
    setSectionPickerOpen(false);
    setSectionQuery('');
  };

  useEffect(() => {
    activeSectionButtonRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [props.activeSection.id]);

  return <div className={`report-workspace${props.unmatchedOpen && props.unmatched.length > 0 ? ' unmatched-open' : ''}`}>
    <section className="input-canvas"><div className="input-heading"><div className="input-title"><p className="step-kicker">STEP 06 · {props.activeSection.area}</p><h2>Report Input</h2><span>{props.activeSection.id}</span><button type="button" className="report-label-trigger" aria-expanded={labelSettingsOpen} onClick={() => setLabelSettingsOpen((open) => !open)}>보고서 표기 설정</button>{labelSettingsOpen && <div className="report-label-settings" role="dialog" aria-label="보고서 표기 설정"><header><div><b>보고서 표기 설정</b><small>같은 컴포넌트의 모든 Side·Unit에 적용</small></div><button type="button" aria-label="표기 설정 닫기" onClick={() => setLabelSettingsOpen(false)}>×</button></header><label><span>상위 구역명</span><input aria-label="상위 구역명" value={labels.upperAreaLabel} onChange={(event) => props.dispatch({ type: 'UPDATE_REPORT_LABELS', groupKey: labelKey, labels: { upperAreaLabel: event.target.value } })} /></label><label><span>상세 제목</span><input aria-label="상세 제목" value={labels.detailTitle} onChange={(event) => props.dispatch({ type: 'UPDATE_REPORT_LABELS', groupKey: labelKey, labels: { detailTitle: event.target.value } })} /></label><label><span>사진 캡션</span><input aria-label="사진 캡션" value={labels.photoCaption} onChange={(event) => props.dispatch({ type: 'UPDATE_REPORT_LABELS', groupKey: labelKey, labels: { photoCaption: event.target.value } })} /></label><output aria-label="Word 표기 미리보기"><b>{previewBc}</b><span>{previewTitle}</span><small>사진 캡션: {labels.photoCaption}</small></output><button type="button" className="ghost full" onClick={() => props.dispatch({ type: 'UPDATE_REPORT_LABELS', groupKey: labelKey, labels: defaults })}>기본값으로 복원</button></div>}</div><nav className="section-navigator" aria-label="Report Section 바로가기"><button type="button" className="section-arrow" aria-label="이전 Section" disabled={activeIndex === 0} onClick={() => focusSection(activeIndex - 1)}>←</button><div className="section-strip"><div className="section-strip-meta"><span className="section-count">SECTION {activeIndex + 1} / {props.report.sections.length}</span><button type="button" className="section-picker-trigger" aria-label="전체 Section 목록 열기" aria-expanded={sectionPickerOpen} onClick={() => setSectionPickerOpen((open) => !open)}>전체 Section</button></div><div className="section-tabs">{visibleSections.map((section) => {
      const active = section.id === props.activeSection.id;
      return <button
        type="button"
        key={section.id}
        ref={active ? activeSectionButtonRef : undefined}
        className={`section-tab${active ? ' active' : ''}`}
        aria-label={`${section.id} Section 열기`}
        aria-current={active ? 'page' : undefined}
        onClick={() => selectSection(section.id)}
      ><span className={`service-badge ${section.service.toLowerCase()}`}>{section.service}</span><b>{conciseSectionLabel(section)}</b></button>;
    })}</div>{sectionPickerOpen && <div className="section-picker" role="dialog" aria-label="전체 Section"><div className="section-picker-head"><b>전체 Section</b><button type="button" aria-label="전체 Section 닫기" onClick={() => setSectionPickerOpen(false)}>×</button></div><input type="search" aria-label="Section 검색" placeholder="Service, 구역, Side, Unit 검색" value={sectionQuery} onChange={(event) => setSectionQuery(event.target.value)} autoFocus /><div className="section-picker-list">{sectionGroups.length ? sectionGroups.map((group) => <section key={group.key}><header><span className={`service-badge ${group.service.toLowerCase()}`}>{group.service}</span><b>{group.component}</b><em>{group.sections.length}</em></header>{group.sections.map((section) => <button type="button" key={section.id} className={section.id === props.activeSection.id ? 'active' : ''} aria-label={`${section.service} ${conciseSectionLabel(section)} Section 열기`} onClick={() => selectSection(section.id)}><span>{conciseSectionLabel(section)}</span><small>{section.id}</small></button>)}</section>) : <p>검색 결과가 없습니다.</p>}</div></div>}</div><button type="button" className="section-arrow" aria-label="다음 Section" disabled={activeIndex === props.report.sections.length - 1} onClick={() => focusSection(activeIndex + 1)}>→</button></nav><div className="input-metrics"><div className="page-badge"><b>{props.pages.length}P</b><span>{props.activePhotos.filter((photo) => photo.reportUse).length} Report Use</span></div><button type="button" className="unmatched-trigger" aria-label={`미배정 사진 ${props.unmatched.length}`} aria-controls="unmatched" aria-expanded={props.unmatchedOpen && props.unmatched.length > 0} disabled={props.unmatched.length === 0} onClick={props.onToggleUnmatched}><span>미배정 사진</span><b>{props.unmatched.length}</b></button></div></div>
      <p className={`assignment-target ${props.activePhotoTarget?.phase.toLowerCase() ?? ''}`} aria-label="현재 사진 배정 위치" aria-live="polite"><b>{props.activePhotoTarget?.phase ?? '—'} 사진 배정 대상</b><span>{conciseSectionLabel(props.activeSection)}</span><small>{props.activePhotoTarget?.sectionId ?? '—'} · {props.activePhotoTarget?.phase ?? '—'}</small></p>
      <div className="report-input-top-grid">
        <GroupConditionPanel report={props.report} section={props.activeSection} dispatch={props.dispatch} />
        <SectionQaPanel
          section={props.activeSection}
          issues={sectionIssues}
          onFocusPhase={(phase) => props.onSelectPhotoTarget({ sectionId: props.activeSection.id, phase })}
        />
      </div>
      <div className="phase-stack">{props.activeSection.phases.map((phase) => <PhasePanel key={phase} phase={phase} section={props.activeSection} sections={props.report.sections} photos={props.activePhotos.filter((photo) => photo.phase === phase)} dispatch={props.dispatch} source={props.report.conditionSources[props.activeSection.id]?.[phase] ?? 'GROUP'} workPerformLabel={props.report.workPerformLabels[workPerformLabelKey(props.activeSection.id, phase)] ?? { main: defaultWorkPerformed(props.activeSection), phase }} unmatchedCount={props.unmatched.length} onChooseImported={props.onChooseImported} onAddPhotos={props.onAddPhotos} selected={props.activePhotoTarget?.sectionId === props.activeSection.id && props.activePhotoTarget.phase === phase} onSelect={() => props.onSelectPhotoTarget({ sectionId: props.activeSection.id, phase })} />)}</div>
      <p className="photo-delete-note">미배정으로 이동해도 불러온 사진과 편집 내용은 유지됩니다.</p>
    </section>
    {props.unmatchedOpen && props.unmatched.length > 0 && <aside className="unmatched-drawer" id="unmatched" aria-label="미배정 사진 배정"><div className="unmatched-head"><div><p className="eyebrow">MANUAL ASSIGN</p><h3>미배정 사진</h3></div><div><span>{props.unmatched.length}</span><button type="button" aria-label="미배정 사진 닫기" onClick={props.onCloseUnmatched}>×</button></div></div><p className="unmatched-help">확실하지 않은 경로는 추측하지 않습니다. 사진을 클릭하면 현재 선택된 위치에 바로 배정됩니다.</p><div className="unmatched-list">{props.unmatched.map((photo) => <UnmatchedCard key={photo.id} photo={photo} onAssign={() => props.onAssignUnmatched(photo.id)} />)}</div><button type="button" className="ghost full" onClick={props.onOpen}>사진 더 불러오기</button></aside>}
    <div className="input-footer"><button type="button" className="text-button" onClick={props.onBack}>← 사진 입력</button><div><span>Report Check {props.issues.length} issues</span><button type="button" className="primary" onClick={props.onNext}>Check / Preview</button></div></div>
  </div>;
}

function SectionQaPanel({ section, issues, onFocusPhase }: {
  section: ReportSection;
  issues: QaIssue[];
  onFocusPhase: (phase: Phase) => void;
}) {
  const actionLabel = (issue: QaIssue) => {
    if (issue.kind === 'MISSING_PHASE_PHOTO') return `${issue.phase} 사진 없음`;
    if (issue.kind === 'MISSING_CONDITION') return `${issue.phase} Condition 누락`;
    return 'BEFORE / AFTER 사진 수량 차이';
  };
  return <aside className={`section-qa-panel${issues.length ? '' : ' clear'}`} aria-label="현재 Section 점검">
    <header aria-label="현재 Section 점검 요약" aria-live="polite"><div><span>SECTION CHECK</span><b>{issues.length ? `현재 Section 오류 ${issues.length}` : '현재 Section 이상 없음'}</b></div><em>{issues.length}</em></header>
    <p>{section.service} · {conciseSectionLabel(section)}</p>
    {issues.length ? <div className="section-qa-list">{issues.map((issue) => <button
      type="button"
      key={issue.id}
      aria-label={`${actionLabel(issue)}${issue.phase ? ` · ${issue.phase} Phase 확인` : ''}`}
      onClick={() => issue.phase && onFocusPhase(issue.phase)}
    ><span>!</span><span><b>{issue.kind.replaceAll('_', ' ')}</b><small>{issue.message}</small></span>{issue.phase && <em>{issue.phase} →</em>}</button>)}</div> : <div className="section-qa-clear"><span>✓</span><div><b>입력 상태가 정상입니다.</b><small>Condition과 필수 Phase 사진이 모두 준비되었습니다.</small></div></div>}
    <footer>전체 오류는 Check / Preview에서 한 번에 확인합니다.</footer>
  </aside>;
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

function PhasePanel({ phase, section, sections, photos, dispatch, source, workPerformLabel, unmatchedCount, onChooseImported, onAddPhotos, selected, onSelect }: { phase: Phase; section: ReportSection; sections: ReportSection[]; photos: PhotoData[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; source: ConditionSource; workPerformLabel: WorkPerformLabel; unmatchedCount: number; onChooseImported: (target: { sectionId: string; phase: Phase }) => void; onAddPhotos: (sectionId: string, phase: Phase) => void; selected: boolean; onSelect: () => void }) {
  const condition = section.conditions[phase];
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [dropTargetPhotoId, setDropTargetPhotoId] = useState<string | null>(null);
  const [dropAtEnd, setDropAtEnd] = useState(false);
  if (!condition) return null;
  const sortedPhotos = [...photos].sort((left, right) => left.order - right.order);
  const resetDragState = () => {
    setDraggedPhotoId(null);
    setDropTargetPhotoId(null);
    setDropAtEnd(false);
  };
  const reorderFromKeyboard = (photoId: string, command: 'PREVIOUS' | 'NEXT' | 'FIRST' | 'LAST') => {
    const index = sortedPhotos.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;
    if (command === 'PREVIOUS' && index > 0) {
      dispatch({ type: 'REORDER_PHOTO', photoId, beforePhotoId: sortedPhotos[index - 1].id });
    } else if (command === 'NEXT' && index < sortedPhotos.length - 1) {
      dispatch({ type: 'REORDER_PHOTO', photoId, beforePhotoId: sortedPhotos[index + 2]?.id ?? null });
    } else if (command === 'FIRST' && index > 0) {
      dispatch({ type: 'REORDER_PHOTO', photoId, beforePhotoId: sortedPhotos[0].id });
    } else if (command === 'LAST' && index < sortedPhotos.length - 1) {
      dispatch({ type: 'REORDER_PHOTO', photoId, beforePhotoId: null });
    }
  };
  const selectFromPanel = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget && target.closest('button, input, select, textarea, label, output, a, [role="button"], [role="switch"], [contenteditable="true"]')) return;
    onSelect();
  };
  const selectFromKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    onSelect();
  };
  return <section className={`phase-panel ${phase.toLowerCase()}${selected ? ' selected' : ''}`} aria-label={`${phase} 사진 갤러리`} aria-current={selected ? 'true' : undefined} tabIndex={0} onClick={selectFromPanel} onKeyDown={selectFromKeyboard}>
    <div className="phase-head"><div><span>{phase}</span><b>{photos.filter((photo) => photo.reportUse).length} PHOTOS</b><em className={`condition-source ${source.toLowerCase()}`}>{source === 'OVERRIDE' ? '개별 수정' : '기본값 사용'}</em></div><div>{source === 'OVERRIDE' && <button type="button" className="condition-revert" aria-label={`${phase} 기본값으로 되돌리기`} onClick={() => dispatch({ type: 'REVERT_CONDITION_TO_GROUP', sectionId: section.id, phase })}>기본값으로 되돌리기</button>}<button type="button" className="phase-select" aria-label={`${phase} ${selected ? '현재 사진 배정 위치' : '이곳에 사진 배정'}`} aria-pressed={selected} onClick={onSelect}><span>{selected ? '✓ 현재 사진 배정 위치' : '이곳에 사진 배정'}</span></button>{unmatchedCount > 0 && <button type="button" className="ghost phase-import" aria-label={`${phase} 불러온 사진 선택`} onClick={() => onChooseImported({ sectionId: section.id, phase })}>불러온 사진 선택 ({unmatchedCount})</button>}<button type="button" className="ghost phase-add" aria-label={`${phase} 새 사진 추가`} onClick={() => onAddPhotos(section.id, phase)}>새 사진 추가</button></div></div>
    <div className="work-perform-editor"><span>WORK PERFORMED</span>{(['main', 'phase'] as const).map((field) => <label key={field}><span>{field === 'main' ? '작업명' : '단계 문구'}</span><input aria-label={`${phase} ${field === 'main' ? '작업명' : '단계 문구'}`} value={workPerformLabel[field]} onChange={(event) => dispatch({ type: 'UPDATE_WORK_PERFORM_LABEL', sectionId: section.id, phase, field, value: event.target.value })} /></label>)}</div>
    <div className="phase-condition"><ConditionEditor ariaPrefix={phase} condition={condition} onPatch={(patch) => dispatch({ type: 'UPDATE_CONDITION', sectionId: section.id, phase, patch })} /></div>
    <div className="photo-list">{sortedPhotos.length ? sortedPhotos.map((photo) => <PhotoRow
      key={photo.id}
      photo={photo}
      phasePhotos={sortedPhotos}
      section={section}
      phase={phase}
      sections={sections}
      dispatch={dispatch}
      dragging={draggedPhotoId === photo.id}
      dropTarget={dropTargetPhotoId === photo.id}
      onDragStart={() => {
        setDraggedPhotoId(photo.id);
        setDropTargetPhotoId(null);
        setDropAtEnd(false);
      }}
      onDragOver={(event) => {
        if (!draggedPhotoId || draggedPhotoId === photo.id) return;
        event.preventDefault();
        setDropTargetPhotoId(photo.id);
        setDropAtEnd(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggedPhotoId && draggedPhotoId !== photo.id) {
          dispatch({ type: 'REORDER_PHOTO', photoId: draggedPhotoId, beforePhotoId: photo.id });
        }
        resetDragState();
      }}
      onDragEnd={resetDragState}
      onKeyboardReorder={(command) => reorderFromKeyboard(photo.id, command)}
    />) : <div className="phase-empty"><span>＋</span><b>{phase} 사진 없음</b><p>이 Phase에 사진을 추가하거나 폴더에서 불러오세요.</p></div>}{sortedPhotos.length > 1 && <button
      type="button"
      className={`photo-drop-end${dropAtEnd ? ' drop-target' : ''}`}
      aria-label={`${phase} 사진 맨 뒤로 이동`}
      aria-disabled={!draggedPhotoId}
      tabIndex={-1}
      onDragOver={(event) => {
        if (!draggedPhotoId) return;
        event.preventDefault();
        setDropTargetPhotoId(null);
        setDropAtEnd(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggedPhotoId) {
          dispatch({ type: 'REORDER_PHOTO', photoId: draggedPhotoId, beforePhotoId: null });
        }
        resetDragState();
      }}
    ><span aria-hidden="true">↓</span> 맨 뒤에 놓기</button>}</div>
  </section>;
}

function PhotoRow({ photo, phasePhotos, section, phase, sections, dispatch, dragging, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd, onKeyboardReorder }: { photo: PhotoData; phasePhotos: PhotoData[]; section: ReportSection; phase: Phase; sections: ReportSection[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; dragging: boolean; dropTarget: boolean; onDragStart: () => void; onDragOver: (event: React.DragEvent<HTMLElement>) => void; onDrop: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void; onKeyboardReorder: (command: 'PREVIOUS' | 'NEXT' | 'FIRST' | 'LAST') => void }) {
  const [moving, setMoving] = useState(false);
  const orderHelpId = useId();
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

  const baseCaption = createCaption(photo, section, index);
  const captionPreview = photo.captionText.trim()
    ? `${baseCaption} | ${photo.captionText.trim()}`
    : baseCaption;
  const reorderKeys: Record<string, 'PREVIOUS' | 'NEXT' | 'FIRST' | 'LAST'> = {
    ArrowLeft: 'PREVIOUS',
    ArrowUp: 'PREVIOUS',
    ArrowRight: 'NEXT',
    ArrowDown: 'NEXT',
    Home: 'FIRST',
    End: 'LAST',
  };
  const reorderWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const command = reorderKeys[event.key];
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    onKeyboardReorder(command);
  };

  return <article
    className={`photo-row${photo.reportUse ? '' : ' excluded'}${dragging ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}`}
    aria-label={`${photo.file.name} 사진`}
    aria-grabbed={dragging}
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
  >
    <div className="photo-card-top"><button type="button" className="photo-drag-handle" aria-label={`${photo.file.name} 순서 이동`} aria-describedby={orderHelpId} aria-keyshortcuts="ArrowLeft ArrowUp ArrowRight ArrowDown Home End" title="같은 Phase 안에서 드래그하거나 키보드로 순서 변경" onKeyDown={reorderWithKeyboard}>⋮⋮</button><span id={orderHelpId} className="visually-hidden">같은 Phase에서 화살표 키로 이전 또는 다음, Home 키로 처음, End 키로 맨 뒤로 이동합니다.</span><div className="thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /><span>{String(index).padStart(2, '0')}</span></div></div>
    <div className="photo-info"><b>{photo.file.name}</b><span aria-label={`${photo.file.name} 캡션 미리보기`} aria-live="polite">{captionPreview}</span></div>
    <label className="photo-caption-field"><span>추가 캡션</span><input aria-label={`${photo.file.name} 추가 캡션`} value={photo.captionText} placeholder="선택 입력" onChange={(event) => dispatch({ type: 'UPDATE_PHOTO_CAPTION', photoId: photo.id, value: event.target.value })} /></label>
    <div className="photo-actions"><label className="switch"><input type="checkbox" className="switch-input" aria-label={`${photo.file.name} Report Use`} checked={photo.reportUse} onChange={() => dispatch({ type: 'TOGGLE_REPORT_USE', photoId: photo.id })} /><i /><span>REPORT USE</span></label>{moving ? <div className="photo-move"><select aria-label={`${photo.file.name} 이동 Section`} value={sectionId} onChange={(event) => { const next = sections.find((item) => item.id === event.target.value) ?? section; setSectionId(next.id); setTargetPhase(next.phases[0]); }}>{sections.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select><select aria-label={`${photo.file.name} 이동 Phase`} value={targetPhase} onChange={(event) => setTargetPhase(event.target.value as Phase)}>{targetSection.phases.map((item) => <option key={item}>{item}</option>)}</select><button type="button" className="move-confirm" onClick={move}>이동 완료</button><button type="button" className="move-cancel" aria-label="이동 취소" onClick={cancelMove}>취소</button></div> : <div className="photo-action-buttons"><button type="button" className="photo-action-button move" aria-label={`${photo.file.name} 이동`} onClick={startMove}><span aria-hidden="true">↗</span>이동</button><button type="button" className="photo-action-button danger" aria-label={`${photo.file.name} 미배정으로 이동`} onClick={() => dispatch({ type: 'UNASSIGN_PHOTO', photoId: photo.id })}><span aria-hidden="true">×</span>미배정으로 이동</button></div>}</div>
  </article>;
}

function UnmatchedCard({ photo, onAssign }: { photo: PhotoData; onAssign: () => void }) {
  return <button type="button" className="unmatched-card" aria-label={`${photo.file.name} 사진 배정`} onClick={onAssign}><div className="unmatched-thumb"><PhotoThumb file={photo.file} alt={photo.file.name} /></div><b>{photo.file.name}</b><small>{photoFolderContext(photo.relativePath)}</small><span>현재 사진 배정 위치로 넣기 →</span></button>;
}

interface CheckPreviewProps {
  report: ReportState; activeSection: ReportSection; vesselName: string;
  vesselDiagram: VesselDiagramConfig;
  issues: ReturnType<typeof checkReport>;
  onIssue: (sectionId: string | null) => void; onSection: (sectionId: string) => void; onNext: () => void;
}

function CheckPreview(props: CheckPreviewProps) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  const allWordPages = useMemo(() => buildWordPhasePages(
    props.report.sections,
    props.report.photos,
    props.report.reportLabels,
    props.report.workPerformLabels,
  ), [props.report.sections, props.report.photos, props.report.reportLabels, props.report.workPerformLabels]);
  const wordPages = allWordPages.filter((page) => page.section.id === props.activeSection.id);
  return <div className="check-layout"><aside className="qa-panel"><div className="qa-title"><p className="step-kicker">STEP 07</p><h2>Report Check</h2><span>{props.issues.length}</span></div><p>누락과 오류만 확인하고, 필요할 때 목록을 펼쳐 해당 Section으로 이동합니다.</p>{props.issues.length ? <><button type="button" className="qa-summary" aria-expanded={issuesOpen} onClick={() => setIssuesOpen((open) => !open)}>Report Check {props.issues.length} issues <span>{issuesOpen ? '접기' : '목록 보기'}</span></button>{issuesOpen && <div className="qa-list">{props.issues.map((issue) => <button type="button" key={issue.id} onClick={() => props.onIssue(issue.sectionId)}><span className={`issue-icon ${issue.kind.toLowerCase()}`}>!</span><span><b>{issue.kind === 'UNMATCHED' ? '미배정 사진' : issue.kind.replaceAll('_', ' ')}</b><em>{issue.message}</em></span><i>→</i></button>)}</div>}</> : <div className="qa-clear"><b>✓</b><span>확인할 오류가 없습니다.</span></div>}</aside>
    <section className="preview-area"><div className="preview-toolbar"><div><p className="eyebrow">WORD TEMPLATE PREVIEW · ALL PAGES</p><h2>{props.activeSection.id}</h2></div><select aria-label="Preview section" value={props.activeSection.id} onChange={(event) => props.onSection(event.target.value)}>{props.report.sections.map((section) => <option key={section.id}>{section.id}</option>)}</select><b className="preview-count">{wordPages.length} PAGES</b></div>
      <div className="preview-stage" aria-label="전체 Report Preview">{wordPages.length ? wordPages.map((page) => {
        const pageNumber = allWordPages.indexOf(page) + 1;
        return <WordTemplatePreviewPage
          key={`${page.section.id}-${page.phase}-${page.kind}-${pageNumber}`}
          page={page}
          pageNumber={pageNumber}
          totalPages={allWordPages.length}
          vesselName={props.vesselName}
          vesselDiagram={props.vesselDiagram}
        />;
      }) : <div className="preview-empty"><b>0P</b><span>Report Use 사진을 추가하면 Word 템플릿 페이지가 자동 생성됩니다.</span></div>}</div>
      <div className="preview-footer"><span>실제 Word 모델 기준 · Phase별 첫 페이지 4장 · 이후 6장</span><button type="button" className="primary" onClick={props.onNext}>Word 준비</button></div>
    </section>
  </div>;
}

const templateRatingClass = (rating: string) => {
  const value = rating.trim();
  return `template-rating rating-${/^[0-5]$/.test(value) ? value : 'empty'}`;
};

function TemplateConditionTable({
  title,
  rating,
  headings,
  values,
}: {
  title: string;
  rating: string;
  headings: [string, string, string];
  values: [string, string];
}) {
  const fill = ratingFill(rating);
  return <table className="template-condition-table"><caption>{title}</caption><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody><tr><td>{rating && <span className={templateRatingClass(rating)} style={fill ? { backgroundColor: `#${fill}` } : undefined}>{rating}</span>}</td><td>{values[0]}</td><td>{values[1]}</td></tr></tbody></table>;
}

function WordTemplatePreviewPage({
  page,
  pageNumber,
  totalPages,
  vesselName,
  vesselDiagram,
}: {
  page: WordPhasePage;
  pageNumber: number;
  totalPages: number;
  vesselName: string;
  vesselDiagram: VesselDiagramConfig;
}) {
  const slotCount = page.kind === 'first' ? 4 : 6;
  return <article className={`report-page word-template-page ${page.kind}`} aria-label={`Word template preview page ${pageNumber}`}>
    <header className="template-page-header"><div className="template-brand"><div className="template-logo"><b>US</b><span>UNDERWATER<br />SOLUTION</span></div><div><b>Underwater Solution Co.,Ltd</b><strong>UNDERWATER SERVICE REPORT</strong><span>Underwater Inspection &amp; Cleaning</span><span>Photo Documentation</span></div></div><dl><div><dt>Job No</dt><dd>—</dd></div><div><dt>Vessel</dt><dd>{vesselName}</dd></div><div><dt /><dd>Company Confidential</dd></div><div><dt /><dd>PAGE {pageNumber} / {totalPages}</dd></div></dl></header>
    <section className="template-page-body"><h3>7. DETAILED SERVICE RECORD</h3><div className="template-area-title"><b>{page.values.bc}</b>{page.values.sideLabel && <span>{page.values.sideLabel}</span>}</div>
      {page.kind === 'first' && <><div className="template-work-row"><b>{page.values.title}</b><span><small>WORK PERFORMED</small><strong>{page.values.work}</strong>{page.values.workAdditional && <>{page.values.work && <span style={{ position: 'relative', top: '-1pt' }}> | </span>}<em>{page.values.workAdditional}</em></>}</span></div><VesselDiagramPreview config={vesselDiagram} section={page.section} /><div className="template-condition-tables"><TemplateConditionTable title="FOULING CONDITION" rating={page.values.fr} headings={['RATING', 'TYPE', 'COVERAGE']} values={[page.values.ft, page.values.fc]} /><TemplateConditionTable title="OBSERVED CONDITION" rating={page.values.or} headings={['RATING', 'LEVEL', 'TYPE']} values={[page.values.ol, page.values.ot]} /></div></>}
      <div className={`template-photo-grid ${page.kind}`}>{Array.from({ length: slotCount }, (_, index) => {
        const photo = page.photos[index];
        return <figure data-testid="template-photo-slot" className={photo ? 'filled' : 'empty'} key={photo?.id ?? `empty-${index}`}><div>{photo ? <PhotoThumb file={photo.file} alt={photo.file.name} /> : <span>N/A</span>}</div><figcaption>{photo ? composePhotoCaption(page.values.photoCaption, page.phase, photo.captionText).filter((part) => part.trim().length > 0).join(' | ') : 'N/A'}</figcaption></figure>;
      })}</div>
    </section>
    <footer className="template-page-footer"><b>© Underwater Solution Co., Ltd. (US) All rights reserved.</b><span>This document contains proprietary and confidential information intended solely for the use of authorized individuals.</span></footer>
  </article>;
}

function SummaryReview({ vesselName, report, onBack, onEditDetail, onNext }: {
  vesselName: string;
  report: ReportState;
  onBack: () => void;
  onEditDetail: () => void;
  onNext: () => void;
}) {
  const summary = useMemo(() => buildSummaryModel(report.sections), [report.sections]);
  const rows = [...summary.mainHullRows, ...summary.nicheRows];
  return <div className="workspace summary-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 08</p><h2>Summary 확인</h2><p>Detail 입력값에서 자동 작성된 Summary입니다.</p></div><span className="privacy-chip">AUTO SUMMARY</span></div>
    <section className="summary-result-card" aria-label="Overall Result"><span>5.1 OVERALL RESULT</span><h3>{summary.headline}</h3><p>{summary.narrative}</p></section>
    <section className="summary-matrix-card"><header><div><span>5.3 OVERALL FINDINGS MATRIX</span><h3>{vesselName}</h3></div><div><b>{summary.mainHullRows.length}</b> MAIN HULL <b>{summary.nicheRows.length}</b> NICHE</div></header>
      {rows.length ? <div className="summary-table-wrap"><table><thead><tr><th>COMPONENT</th><th>SIDE</th><th>RATING</th><th>TYPE</th><th>COVERAGE</th><th>RATING</th><th>LEVEL</th><th>TYPE</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td>{row.component}</td><td>{row.side ?? '—'}</td><td><i className={templateRatingClass(row.foulingRating)}>{row.foulingRating || '—'}</i></td><td>{row.foulingType || '—'}</td><td>{row.coverage || '—'}</td><td><i className={templateRatingClass(row.observedRating)}>{row.observedRating || '—'}</i></td><td>{row.observedLevel || '—'}</td><td>{row.observedType || '—'}</td></tr>)}</tbody></table></div> : <div className="summary-empty">완료된 Detail Condition이 없습니다.</div>}
    </section>
    <div className="summary-note"><b>자동 반영 기준</b><span>두 단계 작업은 AFTER, Inspection은 CURRENT · Fin Blade는 Detail에만 포함 · 페이지 번호는 현재 생략</span></div>
    <div className="actionbar summary-actions"><button type="button" className="text-button" onClick={onBack}>← Check / Preview</button><div><button type="button" className="ghost" onClick={onEditDetail}>Detail 입력 수정</button><button type="button" className="primary" onClick={onNext}>최종 Word 준비</button></div></div>
  </div>;
}

function ExportScreen({ vesselName, report, status, onBack, onExport, onDiagramSetup, busy }: { vesselName: string; report: ReportState; status: string; onBack: () => void; onExport: () => void; onDiagramSetup?: () => void; busy: boolean }) {
  const wordPageCount = buildWordPhasePages(report.sections, report.photos, report.reportLabels, report.workPerformLabels).length;
  const summaryPageCount = buildSummaryModel(report.sections).pageCount;
  return <div className="workspace export-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 09</p><h2>Word 보고서 다운로드</h2><p>Sections 1–8을 공식 양식 순서로 조립하고 Summary와 Detail 값을 채웁니다.</p></div><span className="privacy-chip">LOCAL EXPORT</span></div><div className="export-card"><div className="export-doc"><span>DOCX</span><div><b>{vesselName}</b><p>전체 보고서 · Summary {summaryPageCount} pages · Detail {wordPageCount} pages · {report.photos.filter((photo) => photo.reportUse && photo.sectionId).length} photos</p></div></div><dl><div><dt>Order</dt><dd>1–4 → 5 → 6 → 7 → 8</dd></div><div><dt>Detail rule</dt><dd>Matrix order · Before → After</dd></div><div><dt>Processing</dt><dd>Sequential local resize</dd></div></dl><button type="button" className="primary export-button" disabled={busy} onClick={onExport}>{busy ? 'Word 생성 중…' : 'Word 보고서 다운로드'}</button><p role={onDiagramSetup ? 'alert' : undefined}>{status}</p>{onDiagramSetup && <button type="button" className="ghost" onClick={onDiagramSetup}>선박 위치도 설정으로 돌아가기</button>}</div><div className="actionbar"><button type="button" className="text-button" onClick={onBack}>← Summary 확인</button></div></div>;
}
