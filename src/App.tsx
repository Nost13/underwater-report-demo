'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { COMPONENT_OPTIONS, DEMO_VESSELS, SERVICES } from './app/demoData';
import { deriveOperationValues, emptyReportInfo, reportInfoForScopes, reportInfoFromVessel, type ReportInfo } from './app/reportInfo';
import { ReportInformation } from './app/ReportInformation';
import { CoverEditor } from './app/CoverEditor';
import { DraftToolbar } from './app/DraftToolbar';
import { parseReportSnapshot, type ReportSnapshot } from './persistence/reportSnapshot';
import { scopeChanges, scopeTargetsFromSections } from './app/scopeRevision';
import { SummaryReview } from './app/SummaryReview';
import { PendingEditsContext, usePendingContext, usePendingEdits } from './app/pendingEdits';
import { PhotoLibraryPicker, type OpenPhotoLibrary } from './app/PhotoLibraryPicker';
import { createCoverInfo, syncGeneratedCoverScope, type CoverInfo } from './app/coverInfo';
import { lookupVesselSchedule, type VesselSchedule } from './app/scheduleLookup';
import { lookupVessel } from './app/vesselLookup';
import { VesselDiagramWorkspace } from './app/VesselDiagramWorkspace';
import { diagramConfirmed, reconcileDiagramMarkers, viewForSection } from './vesselDiagram/layoutLibrary';
import { VesselDiagramPreview } from './app/VesselDiagramPreview';
import { requiredMarkerGroups } from './vesselDiagram/markers';
import type { VesselDiagramConfig } from './vesselDiagram/types';
import { ConditionEditor } from './app/ConditionEditor';
import { ConditionMatrix } from './app/ConditionMatrix';
import { PhotoWorkspace } from './app/PhotoWorkspace';
import {
  cloneCondition,
  conditionGroupKey,
  conditionGroupMembers,
  patchCondition,
  type ConditionPatch,
} from './app/conditionDefaults';
import { initialReportState, reportReducer, selectedPages, type ReportState } from './app/reportState';
import { conciseSectionLabel, defaultReportLabels, reportLabelKey } from './app/reportLabels';
import { filterSections, groupSections, sectionWindow } from './app/sectionNavigator';
import { createSectionTree, folderRelativePath, pickDirectory, scanImages, type DirectoryHandleLike } from './browser/directory';
import { ThumbnailPool, resizeForReportSlot, type ThumbnailLease } from './browser/images';
import { composePhotoCaption, matchPhotoPath, summarizePhotoImport } from './domain/photos';
import { buildWordPhasePages, type WordPhasePage } from './docx/reportModel';
import { ratingFill } from './docx/ratingPalette';
import { buildSummaryModel } from './summary/summaryModel';
import {ScheduleChooser} from './app/ScheduleChooser';
import {FolderContents} from './app/FolderContents';
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
import { writeTemplateReport, buildReportFileName, type WordExportInput, type WordExportResult } from './docx/templateWriter';
import {
  NICHE_TYPE_LABELS,
  type NicheType,
  type Condition,
  type Phase,
  type PhotoData,
  type QaIssue,
  type ReportSection,
  type ScopeTarget,
  type ServiceKind,
} from './domain/types';

const thumbnails = new ThumbnailPool();
const stages = ['Vessel / Scope', 'Report Information', 'Cover', 'Vessel Diagram', '사진 폴더', 'Report Input', 'Check / Preview', 'Summary', 'Word'];

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;


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
      className={index === active ? 'stage-item active' : 'stage-item'}
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
  return writeTemplateReport(input, {
    resizeReadinessPhoto: resizeForReportSlot,
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
  const [stage, setStageState] = useState(0);
  const pending = usePendingEdits();
  const setStage = (next:number) => { if(!pending.entry.current){setStageState(next);return;}void pending.confirm().then((ok)=>{if(ok)setStageState(next);}); };
  const [imo, setImo] = useState('');
  const [vessel, setVessel] = useState<(typeof DEMO_VESSELS)[number] | null>(null);
  const [vesselMatches, setVesselMatches] = useState<(typeof DEMO_VESSELS)[number][]>([]);
  const [vesselSchedules, setVesselSchedules] = useState<VesselSchedule[]>([]);
  const [vesselSchedule, setVesselSchedule] = useState<VesselSchedule | null>(null);
  const [isVesselLookupPending, setIsVesselLookupPending] = useState(false);
  const [reportInfo, setReportInfo] = useState<ReportInfo>(() => emptyReportInfo());
  const [coverEdits, setCoverInfo] = useState<CoverInfo>(() => createCoverInfo());
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
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folderStructureCreated, setFolderStructureCreated] = useState(false);
  const [photoImportComplete, setPhotoImportComplete] = useState(false);
  const [standardPathsDetected, setStandardPathsDetected] = useState(false);
  const [status, setStatus] = useState('사진 폴더를 선택하거나 각 단계에서 사진을 추가하세요.');
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [activePhotoPhase, setActivePhotoPhase] = useState<Phase>('BEFORE');
  const [isExporting, setIsExporting] = useState(false);
  const [diagramExportError, setDiagramExportError] = useState<string | null>(null);
  const fallbackInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const manualTarget = useRef<{ sectionId: string; phase: Phase } | null>(null);
  const lookupGeneration = useRef(0);
  const jobGeneration = useRef(0);
  const [scopeEditing, setScopeEditing] = useState(false);
  const [scopeUndo, setScopeUndo] = useState<ReportSnapshot | null>(null);
  const [library,setLibrary]=useState<{title:string;limit:number;initialFilter?:string;onPick:(photos:PhotoData[])=>void}|null>(null);
  const openLibrary:OpenPhotoLibrary=(title,limit,onPick)=>setLibrary({title,limit,onPick});

  const snapshot = useMemo<ReportSnapshot>(() => ({
    kind: 'uws-job', version: 1, stage, imo, vessel, vesselSchedule, reportInfo, coverEdits,
    activeService, generalScope, nicheDraft, includeFinBlade, nicheItems, scopeMeta, vesselDiagram,
    report, photoImportComplete, activePhotoPhase,
  }), [stage, imo, vessel, vesselSchedule, reportInfo, coverEdits, activeService, generalScope, nicheDraft, includeFinBlade, nicheItems, scopeMeta, vesselDiagram, report, photoImportComplete, activePhotoPhase]);
  const restoreSnapshot = (raw: unknown) => {
    const saved = parseReportSnapshot(raw);
    lookupGeneration.current++; jobGeneration.current++; setIsVesselLookupPending(false); setScopeEditing(false); setScopeUndo(null); setLibrary(null);
    setImo(saved.imo); setVessel(saved.vessel); setVesselSchedule(saved.vesselSchedule);
    setReportInfo(saved.reportInfo); setCoverInfo(saved.coverEdits); setActiveService(saved.activeService);
    setGeneralScope(saved.generalScope); setNicheDraft(saved.nicheDraft); setIncludeFinBlade(saved.includeFinBlade);
    setNicheItems(saved.nicheItems); setScopeMeta(saved.scopeMeta); setVesselDiagram(saved.vesselDiagram);
    dispatch({ type: 'HYDRATE', state: saved.report }); setPhotoImportComplete(saved.photoImportComplete);
    setActivePhotoPhase(saved.activePhotoPhase); setFolder(null); setFolderStructureCreated(false);
    setVesselMatches([]); setVesselSchedules([]); setUnmatchedOpen(false); setDiagramExportError(null);
    setStageState(saved.stage >= 4 && saved.stage <= 6 && !diagramConfirmed(saved.vesselDiagram,saved.report.sections) ? 3 : saved.stage);
    setStandardPathsDetected(false);
    setStatus('사진과 입력 내용을 복원했습니다. 폴더에 다시 저장하려면 폴더를 선택하세요.');
  };
  const startNewReport = () => {
    lookupGeneration.current++; jobGeneration.current++; setIsVesselLookupPending(false); setScopeEditing(false); setScopeUndo(null); setLibrary(null);
    setStage(0); setImo(''); setVessel(null); setVesselSchedule(null); setVesselSchedules([]); setVesselMatches([]);
    setReportInfo(emptyReportInfo()); setCoverInfo(createCoverInfo()); setActiveService('CLEANING');
    setGeneralScope({ targets: createGeneralTargets(), undo: null }); setNicheItems([]); setIncludeFinBlade(false);
    setNicheDraft({ component: 'Sea Chest', type: 'SIDE_QUANTITY', quantity: 2 }); setScopeMeta(null); setVesselDiagram(null);
    dispatch({ type: 'HYDRATE', state: initialReportState }); setFolder(null); setFolderStructureCreated(false);
    setPhotoImportComplete(false); setStandardPathsDetected(false); setActivePhotoPhase('BEFORE'); setUnmatchedOpen(false); setDiagramExportError(null);
  };

  const activeSection = report.sections.find((item) => item.id === report.focusedSectionId) ?? report.sections[0];
  const activePhotoTarget = activeSection ? {
    sectionId: activeSection.id,
    phase: activeSection.phases.includes(activePhotoPhase) ? activePhotoPhase : activeSection.phases[0],
  } : null;
  const activePhotos = activeSection ? report.photos.filter((photo) => photo.sectionId === activeSection.id) : [];
  const unmatched = report.photos.filter((photo) => photo.reportUse && (!photo.sectionId || !photo.phase));
  const pages = selectedPages({ ...report, focusedSectionId: activeSection?.id ?? null });
  const coverInfo = useMemo(() => syncGeneratedCoverScope(coverEdits, report.sections), [coverEdits, report.sections]);
  const issues = useMemo(() => checkReport(report.sections, report.photos, coverInfo, reportInfo, report.conditionReviews??{},report.groupDrafts), [report.sections, report.photos, coverInfo, reportInfo,report.conditionReviews,report.groupDrafts]);
  const generalTargets = generalScope.targets;
  const draftTargets = [...generalTargets, ...nicheItems.flatMap((item) => item.targets)];
  const draftSections = createReportSections(draftTargets);
  const serviceSummary = [...new Set(
    (report.sections.length ? report.sections : draftSections).map((section) => section.service),
  )].join(' + ') || activeService;

  const focusReportSection = (sectionId: string) => {
    void pending.confirm().then((ok) => {
      if(!ok)return;
      const nextSection = report.sections.find((section) => section.id === sectionId);
      if (!nextSection) return;
      dispatch({ type: 'FOCUS_SECTION', sectionId });
      if (report.focusedSectionId !== sectionId) setActivePhotoPhase(nextSection.phases[0]);
    });
  };

  const buildScope = () => {
    const sections = createReportSections(draftTargets);
    if (report.sections.length) {
      const diff = scopeChanges(report.sections, sections);
      const removedIds=new Set(diff.removed.map(section=>section.id));
      const affected=report.photos.filter(photo=>photo.sectionId&&removedIds.has(photo.sectionId)).length;
      if (!window.confirm(`Scope 변경: 유지 ${diff.retained.length} / 추가 ${diff.added.length} / 제거 ${diff.removed.length}\n추가: ${diff.added.map(section=>section.id).join(', ')||'없음'}\n제거: ${diff.removed.map(section=>section.id).join(', ')||'없음'}\n미배정으로 돌아갈 사진: ${affected}장\n기존 구역의 입력은 유지합니다. 적용할까요?`)) return;
    }
    const previousDiagram = vesselDiagram;
    if (previousDiagram) {
      const forView=(items:ReportSection[],view:'SIDE'|'BOTTOM')=>items.filter(section=>viewForSection(previousDiagram,section)===view);
      const update=(config:VesselDiagramConfig,view:'SIDE'|'BOTTOM')=>reconcileDiagramMarkers(config,forView(sections,view),markerRequirementKey(forView(report.sections,view))!==markerRequirementKey(forView(sections,view)));
      setVesselDiagram({...update(previousDiagram,'SIDE'),bottomView:previousDiagram.bottomView?update(previousDiagram.bottomView,'BOTTOM'):undefined});
    }
    jobGeneration.current++;
    setScopeUndo({...snapshot,generalScope:{targets:scopeTargetsFromSections(report.sections).generalTargets,undo:null},nicheItems:scopeTargetsFromSections(report.sections).nicheItems});
    dispatch({ type: 'REVISE_SCOPE', sections });
    setScopeEditing(false);
    setActivePhotoPhase(sections[0]?.phases[0] ?? 'BEFORE');
    setScopeMeta({ vesselName: reportInfo.vessel.name || vessel?.name || 'UNDERWATER REPORT' });
    setReportInfo((current) => reportInfoForScopes(current, [...new Set(sections.map((section) => section.service))]));
    setFolderStructureCreated(false);
    if (!report.sections.length) setPhotoImportComplete(false);
    setStandardPathsDetected(false);
  };

  const resetScope = () => {
    if (!window.confirm('Scope를 비울까요? 사진 원본은 미배정으로 유지하며 실행 취소할 수 있습니다.')) return;
    jobGeneration.current++;
    setScopeUndo({...snapshot,generalScope:{targets:scopeTargetsFromSections(report.sections).generalTargets,undo:null},nicheItems:scopeTargetsFromSections(report.sections).nicheItems}); setScopeEditing(false);
    dispatch({ type: 'REVISE_SCOPE', sections: [] });
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
    const generation=jobGeneration.current;
    if (report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 사진을 불러올 수 있습니다.');
      return;
    }
    const scanned = await scanImages(selected);
    if(generation!==jobGeneration.current)return;
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
    const generation=jobGeneration.current;
    if (report.sections.length === 0) {
      setStatus('먼저 Scope를 만들어야 사진 폴더를 선택할 수 있습니다.');
      return;
    }
    try {
      const selected = await pickDirectory('readwrite');
      if(generation!==jobGeneration.current)return;
      setFolder(selected);
      setFolderStructureCreated(false);
      setPhotoImportComplete(false);
      setStandardPathsDetected(false);
      setStatus(`“${selected.name}” 폴더를 선택했습니다. 사진을 불러오거나 표준 구조를 생성하세요.`);
      await importDirectory(selected,true);
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

  const openReportInput = () => {
    if (report.sections.length === 0 || !diagramConfirmed(vesselDiagram,report.sections)) {
      setStatus('Scope를 만들고 사용하는 선박 위치도를 확정한 뒤 컨디션을 입력하세요.');
      return;
    }
    setStage(5);
  };

  const focusIssue = (issue: QaIssue) => {
    if(issue.stage===5&&!diagramConfirmed(vesselDiagram,report.sections)){setStage(3);return;}
    if(issue.stage!==undefined&&issue.stage!==5){setStage(issue.stage);return;}
    if (issue.kind === 'MISSING_COVER_PHOTO') { setStage(2); return; }
    if (issue.kind === 'MISSING_COVER_METADATA') { setStage(1); return; }
    if(issue.kind==='EXCLUDED_PHOTOS'){setStage(5);setLibrary({title:'보고서 제외 사진 확인 · 선택하면 다시 사용',limit:10000,initialFilter:'EXCLUDED',onPick:(photos)=>photos.filter(photo=>!photo.reportUse).forEach(photo=>dispatch({type:'TOGGLE_REPORT_USE',photoId:photo.id}))});return;}
    if (issue.sectionId) focusReportSection(issue.sectionId);
    else setUnmatchedOpen(true);
    setStage(5);
  };

  const selectReportVessel = async (found: (typeof DEMO_VESSELS)[number]) => {
    const generation = ++lookupGeneration.current;
    setVessel(found);
    const baseInfo = reportInfoFromVessel(found);
    setReportInfo((current) => ({...current, vessel:{...baseInfo.vessel,jobNo:current.vessel.jobNo,ownerClient:current.vessel.ownerClient || baseInfo.vessel.ownerClient}}));
    setVesselSchedules([]);
    setVesselSchedule(null);
    const schedules = await scheduleLookup(found.name);
    if (generation !== lookupGeneration.current) return;
    setVesselSchedules(schedules);
    setStatus(schedules.length ? `${found.name} 일정 ${schedules.length}건입니다. 작업일과 선석을 확인하고 적용할 일정을 선택하세요.` : `${found.name} 선박 정보를 불러왔습니다. 일정은 직접 입력할 수 있습니다.`);
  };

  const lookupReportVessel = async () => {
    if (isVesselLookupPending) return;
    const generation = ++lookupGeneration.current;
    setIsVesselLookupPending(true);
    try {
      const matches = await vesselLookup(imo);
      if (generation !== lookupGeneration.current) return;
      setVesselMatches(matches);
      const found = matches[0] ?? null;
      if (found) await selectReportVessel(found);
      else {
        setVessel(null);
        setVesselSchedules([]);
        setVesselSchedule(null);
        setStatus('VesselFinder에서 조회 결과를 찾지 못했습니다. 선박 정보를 직접 입력할 수 있습니다.');
      }
    } catch { if (generation === lookupGeneration.current) setStatus('조회하지 못했습니다. 직접 입력으로 계속할 수 있습니다.'); }
    finally {
      if (generation === lookupGeneration.current || generation + 1 === lookupGeneration.current) setIsVesselLookupPending(false);
    }
  };

  const runExport = async () => {
    if (isExporting) return;
    const confirmed = diagramConfirmed(vesselDiagram,report.sections);
    if ((issues.length || !confirmed) && !window.confirm(`미완료 또는 확인할 항목이 ${issues.length}개 남아 있습니다. 누락된 내용은 비워두고 현재 입력값으로 Word를 다운로드할까요?${!confirmed ? ' 확정되지 않은 선박 위치도는 빈 프레임으로 출력합니다.' : ''}`)) return;
    setIsExporting(true);
    setDiagramExportError(null);
    setStatus('사진을 순차 처리하여 Word 보고서를 만드는 중입니다…');
    try {
      const result = await exporter({
        vesselName: reportInfo.vessel.name || scopeMeta?.vesselName || 'UNDERWATER REPORT',
        sections: report.sections,
        photos: report.photos,
        reportLabels: report.reportLabels,
        workPerformLabels: report.workPerformLabels,
        reportInfo,
        conditionReviews: report.conditionReviews ?? {},
        coverInfo,
        coverTemplateUrl: 'templates/cover.docx',
        fileName: buildReportFileName(reportInfo.vessel.jobNo, reportInfo.vessel.name),
        vesselDiagram: confirmed ? vesselDiagram : null,
        allowIncomplete: true,
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
        const reason = error instanceof Error ? error.message : String(error);
        setStatus(`Word 생성 실패 · ${reason.slice(0, 240) || '알 수 없는 오류' }`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return <PendingEditsContext.Provider value={pending}><main className="app-shell">
    {pending.dialog}
    {library&&<PhotoLibraryPicker {...library} photos={report.photos} onClose={()=>setLibrary(null)}/>}
    <input {...{ webkitdirectory: '' }} ref={fallbackInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => importFallback(event.target.files)} />
    {folderBrowserOpen && folder && <FolderContents root={folder} onClose={() => setFolderBrowserOpen(false)} />}
    <input aria-label="보고서 사진 추가 파일" ref={manualInput} className="visually-hidden" type="file" multiple accept="image/*" onChange={(event) => { importManualPhotos(event.target.files); event.currentTarget.value = ''; }} />
    <StageRail active={stage} onMove={(next) => {
      const canMove = next === 0
        || (next >= 1 && next <= 3 && report.sections.length > 0)
        || (next >= 7 && report.sections.length > 0)
        || (next >= 4 && next <= 6 && diagramConfirmed(vesselDiagram,report.sections));
      if (!canMove) return;
      if (next === 8 && stage !== 7 && stage !== 8) {
        setStage(7);
        return;
      }
      setStage(next);
    }} />
    <section className="app-main">
      <header className="topbar"><div><p className="eyebrow">UNDERWATER SERVICE REPORT</p><h1>{reportInfo.vessel.name || scopeMeta?.vesselName || vessel?.name || 'New report'}</h1></div><div className="top-meta"><span>{serviceSummary}</span><span>{report.sections.length} SECTIONS</span><span>{report.photos.length} PHOTOS</span></div></header>
      <DraftToolbar snapshot={snapshot} title={[reportInfo.vessel.jobNo, reportInfo.vessel.name].filter(Boolean).join('_')} hasWork={Boolean(Object.values(reportInfo.vessel).some(value=>value.trim()) || vessel || imo || report.sections.length || report.photos.length || nicheItems.length || generalTargets.some((target) => target.services.length) || activeService !== 'CLEANING' || nicheDraft.component !== 'Sea Chest' || nicheDraft.quantity !== 2 || nicheDraft.type !== 'SIDE_QUANTITY' || includeFinBlade)} onRestore={restoreSnapshot} onNew={startNewReport} />
      {stage === 0 && report.sections.length > 0 && <div className="draft-toolbar"><button type="button" onClick={() => setScopeEditing(!scopeEditing)}>{scopeEditing ? 'Scope 편집 잠금' : '기존 입력을 유지하며 Scope 수정'}</button><span>새 구역만 초기값으로 추가합니다.</span></div>}
      {stage === 0 && scopeUndo && <button type="button" onClick={() => { if (window.confirm('마지막 Scope 변경 직전의 사진과 입력으로 되돌릴까요? 이후 입력은 취소됩니다.')) restoreSnapshot(scopeUndo); }}>마지막 Scope 변경 실행 취소</button>}

      {stage === 0 && <VesselScope
        imo={imo} setImo={(value) => { lookupGeneration.current++; setIsVesselLookupPending(false); setImo(value); }} vessel={vessel} activeService={activeService} setActiveService={selectService}
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
        reportInfo={reportInfo} setReportInfo={(next)=>{lookupGeneration.current++;setIsVesselLookupPending(false);setReportInfo(next);}} vesselMatches={vesselMatches} vesselSchedules={vesselSchedules} vesselSchedule={vesselSchedule}
        onVesselSelect={(next) => { if (isVesselLookupPending) return; setIsVesselLookupPending(true); void selectReportVessel(next).finally(() => setIsVesselLookupPending(false)); }}
        onScheduleSelect={(next) => { if ((reportInfo.operation.eta || reportInfo.operation.etd || reportInfo.operation.location) && !window.confirm('선택한 일정의 ETA·ETD·장소·접안 방향을 적용할까요? 수동 계산값은 유지합니다.')) return; setVesselSchedule(next); setReportInfo((current) => ({ ...current, operation: deriveOperationValues({ ...current.operation, eta: next.eta, etd: next.etd, location: [next.port, next.terminal, next.berth].filter(Boolean).join(' / '), berthingSide: next.direction },undefined,current.operationModes) })); }}
        onLookup={lookupReportVessel} vesselLookupPending={isVesselLookupPending}
        onBuild={buildScope} onReset={resetScope} sectionCount={report.sections.length} draftSections={draftSections} editing={scopeEditing}
        onPhotos={() => setStage(1)}
      />}

      {stage === 1 && <ReportInformation value={reportInfo} onChange={setReportInfo} onOpenLibrary={report.photos.length ? openLibrary : undefined} onBack={() => setStage(0)} onNext={() => setStage(2)} />}

      {stage === 2 && <CoverEditor
        onOpenLibrary={report.photos.length ? openLibrary : undefined}
        value={coverInfo} onChange={setCoverInfo} reportInfo={reportInfo} sections={report.sections}
        onBack={() => setStage(1)} onNext={() => setStage(3)} onEditReportInfo={() => setStage(1)}
      />}

      {stage === 3 && <div className="workspace diagram-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 04</p><h2>선박 위치도 설정</h2><p>선체 기준과 작업 구역을 확인한 뒤 다음 단계로 이동하세요.</p></div><span className="privacy-chip">LOCAL ONLY</span></div><VesselDiagramWorkspace
        sections={report.sections} value={vesselDiagram} onChange={setVesselDiagram} info={reportInfo}
        onBack={() => setStage(2)} onNext={() => setStage(4)}
      /></div>}

      {stage === 4 && <>
        {diagramConfirmed(vesselDiagram,report.sections) && <div className="workspace wide matrix-preparation"><ConditionMatrix report={report} dispatch={dispatch}/></div>}
        <PhotoSource
        photoCount={report.photos.length} matchedCount={report.photos.filter(photo=>photo.reportUse&&photo.sectionId&&photo.phase).length} unmatchedCount={unmatched.length}
        status={status} hasFolder={Boolean(folder)} structureCreated={folderStructureCreated} importComplete={photoImportComplete} standardPathsDetected={standardPathsDetected} folderName={folder?.name ?? null} sections={report.sections}
        onSelect={selectPhotoFolder} onCreate={createFolders} onLoad={reloadFolder}
        onOpenFolder={() => setFolderBrowserOpen(true)} onBack={() => setStage(3)} onNext={openReportInput}
      /></>}

      {stage === 5 && activeSection && diagramConfirmed(vesselDiagram,report.sections) && <ReportInput
        onOpenLibrary={openLibrary}
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

      {stage === 6 && activeSection && vesselDiagram && diagramConfirmed(vesselDiagram,report.sections) && <CheckPreview
        jobNo={reportInfo.vessel.jobNo}
        report={report} activeSection={activeSection} issues={issues}
        vesselDiagram={vesselDiagram}
        vesselName={reportInfo.vessel.name || scopeMeta?.vesselName || 'UNDERWATER REPORT'}
        onIssue={focusIssue} onSection={focusReportSection}
        onNext={() => setStage(7)}
      />}

      {stage === 7 && activeSection && <SummaryReview dispatch={dispatch} canEdit={diagramConfirmed(vesselDiagram,report.sections)}
        info={reportInfo} onInfoChange={setReportInfo}
        vesselName={reportInfo.vessel.name || scopeMeta?.vesselName || 'UNDERWATER REPORT'} report={report}
        onBack={() => setStage(diagramConfirmed(vesselDiagram,report.sections)?6:3)} onEditDetail={() => setStage(diagramConfirmed(vesselDiagram,report.sections)?5:3)} onNext={() => setStage(8)}
      />}

      {stage === 8 && activeSection && <ExportScreen
        issues={issues} onIssue={focusIssue}
        vesselName={reportInfo.vessel.name || scopeMeta?.vesselName || 'UNDERWATER REPORT'} report={report} status={diagramExportError ?? status}
        onDiagramSetup={diagramExportError ? () => { setDiagramExportError(null); setStage(3); } : undefined}
        onBack={() => setStage(7)} onExport={runExport} busy={isExporting}
      />}
    </section>
  </main></PendingEditsContext.Provider>;
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
  sectionCount: number; draftSections: ReportSection[]; onPhotos: () => void; editing?: boolean;
}

function VesselScope(props: VesselScopeProps) {
  const locked = props.sectionCount > 0 && !props.editing;
  const [nicheHelpOpen, setNicheHelpOpen] = useState(false);
  const [manualVessel, setManualVessel] = useState(false);
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
  const setCardVesselField = (field: 'ownerClient' | 'jobNo', value: string) => props.setReportInfo((current) => ({
    ...current,
    vessel: { ...current.vessel, [field]: value },
  }));

  return <div className="workspace wide scope-workspace">
    <div className="page-heading"><div><p className="step-kicker">STEP 01</p><h2>Vessel / Scope</h2><p>Vessel DB는 선박 확인에만 사용됩니다. 보고서와 사진은 이 브라우저에 자동 저장되며 서버로 전송되지 않습니다.</p></div><span className="privacy-chip">서버 저장 없음</span></div>
    <div className="scope-grid">
      <section className="panel vessel-panel"><div className="panel-title"><span>01</span><div><h3>Vessel 확인</h3><p>운영부 VesselFinder 조회</p></div></div>
        <button type="button" onClick={() => setManualVessel(!manualVessel)}>조회 없이 선박 정보 직접 입력</button>
{manualVessel && <div className="vessel-manual-grid" aria-label="선박 정보 직접 입력">{(['name','imo','type','loa','breadth'] as const).map((key) => <label className="field" key={key}><span>{({name:'선박명',imo:'IMO',type:'선종',loa:'LOA (m)',breadth:'선폭 (m)'})[key]}</span><input aria-label={`직접 입력 ${key}`} value={props.reportInfo.vessel[key]} onChange={(event) => props.setReportInfo((current) => ({...current,vessel:{...current.vessel,[key]:event.target.value}}))}/></label>)}</div>}
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
          <ScheduleChooser key={`${props.vessel.imo}:${props.vesselSchedules.map(item=>item.eta+'|'+item.etd+'|'+item.berth).join(';')}`} schedules={props.vesselSchedules} selected={props.vesselSchedule} onApply={props.onScheduleSelect}/>
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
          <div className="niche-type-control"><select aria-label="Niche type" value={props.nicheDraft.type} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, type: event.target.value as NicheType })}>{(Object.keys(NICHE_TYPE_LABELS) as NicheType[]).map((type) => <option key={type} value={type}>{NICHE_TYPE_LABELS[type]}</option>)}</select><button type="button" className="niche-type-help-button" aria-label="Niche type 도움말" aria-expanded={nicheHelpOpen} aria-controls="niche-type-help" onClick={() => setNicheHelpOpen((open) => !open)}>?</button></div>
          <div className="quantity-stepper"><button type="button" aria-label="수량 감소" disabled={locked || props.nicheDraft.quantity <= 1} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.max(1, props.nicheDraft.quantity - 1) })}>−</button><input aria-label="Quantity" type="number" min="1" max="12" value={props.nicheDraft.quantity} disabled={locked} onChange={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Number(event.target.value) })} onBlur={(event) => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /><button type="button" aria-label="수량 증가" disabled={locked || props.nicheDraft.quantity >= 12} onClick={() => props.setNicheDraft({ ...props.nicheDraft, quantity: Math.min(12, props.nicheDraft.quantity + 1) })}>＋</button></div>
          <button type="button" className={`scope-add-button ${props.activeService.toLowerCase()}`} aria-label={`${props.activeService} Scope 추가`} disabled={locked} onClick={props.addNiche}><span>＋</span>{props.activeService} Scope 추가</button>
        </div>{nicheHelpOpen && <p id="niche-type-help" className="niche-type-help">단일: 1개 Section · 좌우 구분: PORT/STBD · 수량 구분: 지정 수량 · 좌우+수량 구분: 각 Side별 지정 수량</p>}{polishingActive && props.nicheDraft.component === 'Propeller Blade' && <><div className="polishing-set-note" aria-label="자동 추가 작업"><strong>한 번에 함께 추가</strong><div><span className="service-chip polishing">POLISHING</span><b>Propeller Blade ×{props.nicheDraft.quantity} · {props.includeFinBlade ? `Fin Blade ×${props.nicheDraft.quantity} · ` : ''}Boss Cap</b></div><div><span className="service-chip inspection">INSPECTION</span><b>Rope Guard</b></div></div><label className="fin-blade-option"><input type="checkbox" aria-label="Fin Blade 포함" checked={props.includeFinBlade} disabled={locked} onChange={(event) => props.setIncludeFinBlade(event.target.checked)} /><span><b>Fin Blade 포함</b><small>Propeller Blade와 동일 수량으로 함께 추가</small></span></label></>}{props.nicheItems.map((item) => <article className="niche-group" key={item.id}><header><div><b>{item.component}</b><span>{NICHE_TYPE_LABELS[item.type]}{item.type.includes('QUANTITY') ? ` ×${item.quantity}` : ''}</span></div><button type="button" disabled={locked} aria-label={`${item.component} 삭제`} onClick={() => props.removeNiche(item.id)}>×</button></header><div className="niche-targets">{item.targets.map((target) => <TargetCell key={target.id} target={target} activeService={props.activeService} locked={locked} onToggle={() => props.onNicheToggle(item.id, target.id)} onRemove={(service) => props.onNicheRemove(item.id, target.id, service)} />)}</div></article>)}<p className="side-note">Side 없음: Discharge Pipe, Transducer, Stern Frame, Rope Guard, Propeller Blade, Fin Blade, Boss Cap</p></section>

        <div className="scope-summary" aria-label="Scope 배정 요약"><div className="scope-summary-main"><b>생성 예정 Scope</b><div>{serviceCounts.map((item) => <span key={item.value} className={item.value.toLowerCase()}>{item.value} {item.count}</span>)}</div></div><strong>총 {totalSections} Sections</strong><em>GENERAL 미배정 {unassignedGeneral}</em></div>
        <button type="button" className="primary full" disabled={!props.reportInfo.vessel.name.trim() || props.draftSections.length === 0 || locked} onClick={props.onBuild}>{props.editing ? 'Scope 변경 적용' : scopeButtonLabel}</button>
        {locked && <div className="scope-ready"><b>총 {props.sectionCount} sections</b><em>Condition과 phase가 준비되었습니다.</em><div><button type="button" className="ghost scope-ready-action" onClick={props.onPhotos}>Report Information 입력</button><button type="button" className="text-button scope-ready-action" onClick={props.onReset}>Scope 초기화</button></div></div>}
      </section>
    </div>
  </div>;
}

interface PhotoSourceProps {
  photoCount: number; matchedCount: number; unmatchedCount: number; status: string; hasFolder: boolean; structureCreated: boolean; importComplete: boolean; standardPathsDetected: boolean; folderName: string | null; sections: ReportSection[];
  onSelect: () => void; onCreate: () => void; onLoad: () => void;
  onOpenFolder: () => void; onBack: () => void; onNext: () => void;
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
      <ul className="photo-progress" aria-label="사진 입력 진행 상태"><li className={props.hasFolder ? 'done' : scopeReady ? 'current' : 'pending'}><span>{props.hasFolder ? '✓' : '1'}</span><div><b>기존 사진 불러오기</b><small>사진이 저장된 폴더를 선택합니다.</small><strong>{folderResult}</strong><button type="button" className={props.hasFolder ? 'ghost' : 'primary'} disabled={!scopeReady} onClick={props.onSelect}>{props.hasFolder ? '다른 사진 폴더 선택' : '사진 폴더 선택'}</button></div></li><li className={props.structureCreated ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.structureCreated ? '✓' : '2'}</span><div><b>빈 표준 폴더 만들기 <i>선택 사항</i></b><small>선택 폴더 안에 선택된 Scope와 구역의 폴더 구조를 생성합니다.</small><strong>{structureResult}</strong><button type="button" className={props.hasFolder && !props.structureCreated ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onCreate}>{props.structureCreated ? '폴더 구조 다시 생성' : '표준 폴더 구조 생성'}</button></div></li><li className={props.importComplete ? 'done' : props.hasFolder ? 'current' : 'pending'}><span>{props.importComplete ? '✓' : '3'}</span><div><b>사진 불러오기 <i>후분류</i></b><small>기존 폴더도 표준 경로가 있으면 자동 매칭하고, 나머지만 미배정 사진으로 분리합니다.</small><strong>{importResult}</strong><button type="button" className={props.hasFolder && !props.importComplete ? 'primary' : 'ghost'} disabled={!scopeReady || !props.hasFolder} onClick={props.onLoad}>{props.importComplete ? '사진 다시 불러오기' : '사진 불러오기'}</button></div></li></ul>
      <section className="photo-scope-summary" aria-label="현재 작업 범위"><p>현재 작업 범위</p><div className="scope-work-list">{scopeGroups.map((group) => <div key={`${group.service}-${group.label}`}><b>{group.service}</b><span>{group.label} · {group.count}개 구역 · {group.phases.join(' / ')}</span></div>)}</div><small>총 {props.sections.length}개 Section · {phaseFolderCount}개 사진 폴더 · SERVICE 폴더는 같은 위치에 여러 Service가 있을 때만 추가됩니다.</small></section>
      <p className="folder-help"><b>선분류</b>는 사진을 넣기 전 표준 폴더를 만드는 방식이고, <b>후분류</b>는 기존 사진을 불러온 뒤 경로로 자동 분류하는 방식입니다.</p></section>
    {props.structureCreated && <button type="button" className="primary" onClick={props.onOpenFolder}>생성한 폴더 열기</button>}
    <p className="photo-status-detail" aria-label="사진 입력 상세 상태">{props.status}</p><div className="actionbar"><button type="button" className="text-button" onClick={props.onBack}>← 선박 위치도 설정</button><button type="button" className="primary" disabled={!scopeReady} onClick={props.onNext}>Report Input으로</button></div>
  </div>;
}

interface ReportInputProps {
  onOpenLibrary:OpenPhotoLibrary;
  report: ReportState; activeSection: ReportSection; activePhotos: PhotoData[];
  unmatched: PhotoData[]; unmatchedOpen: boolean; pages: ReturnType<typeof selectedPages>;
  issues: QaIssue[]; dispatch: React.Dispatch<Parameters<typeof reportReducer>[1]>; onOpen: () => void;
  activePhotoTarget: { sectionId: string; phase: Phase } | null;
  onToggleUnmatched: () => void; onCloseUnmatched: () => void; onAddPhotos: (sectionId: string, phase: Phase) => void;
  onChooseImported: (target: { sectionId: string; phase: Phase }) => void;
  onSelectPhotoTarget: (target: { sectionId: string; phase: Phase }) => void; onAssignUnmatched: (photoId: string) => void; onSection: (sectionId: string) => void; onBack: () => void; onNext: () => void;
}

function ReportInput(props: ReportInputProps) {
  const [matrixOpen,setMatrixOpen]=useState(false);
  const matrixPending=usePendingContext();
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

  return <div className="report-workspace photo-workspace-integrated">
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
    })}</div>{sectionPickerOpen && <div className="section-picker" role="dialog" aria-label="전체 Section"><div className="section-picker-head"><b>전체 Section</b><button type="button" aria-label="전체 Section 닫기" onClick={() => setSectionPickerOpen(false)}>×</button></div><input type="search" aria-label="Section 검색" placeholder="Service, 구역, Side, Unit 검색" value={sectionQuery} onChange={(event) => setSectionQuery(event.target.value)} autoFocus /><div className="section-picker-list">{sectionGroups.length ? sectionGroups.map((group) => <section key={group.key}><header><span className={`service-badge ${group.service.toLowerCase()}`}>{group.service}</span><b>{group.component}</b><em>{group.sections.length}</em></header>{group.sections.map((section) => <button type="button" key={section.id} className={section.id === props.activeSection.id ? 'active' : ''} aria-label={`${section.service} ${conciseSectionLabel(section)} Section 열기`} onClick={() => selectSection(section.id)}><span>{conciseSectionLabel(section)}</span><small>{section.id}</small></button>)}</section>) : <p>검색 결과가 없습니다.</p>}</div></div>}</div><button type="button" className="section-arrow" aria-label="다음 Section" disabled={activeIndex === props.report.sections.length - 1} onClick={() => focusSection(activeIndex + 1)}>→</button></nav><div className="input-metrics"><div className="page-badge"><b>{props.pages.length}P</b><span>{props.activePhotos.filter((photo) => photo.reportUse).length} Report Use</span></div><span className="unmatched-trigger" aria-label={`미배정 사진 ${props.report.photos.filter(photo=>!photo.sectionId||!photo.phase).length}`}><span>미배정 사진</span><b>{props.report.photos.filter(photo=>!photo.sectionId||!photo.phase).length}</b></span></div></div>
      <p className={`assignment-target ${props.activePhotoTarget?.phase.toLowerCase() ?? ''}`} aria-label="현재 사진 배정 위치" aria-live="polite"><b>{props.activePhotoTarget?.phase ?? '—'} 사진 배정 대상</b><span>{conciseSectionLabel(props.activeSection)}</span><small>{props.activePhotoTarget?.sectionId ?? '—'} · {props.activePhotoTarget?.phase ?? '—'}</small></p>
      <div className="matrix-detail-toggle"><button type="button" className="primary" aria-expanded={matrixOpen} onClick={()=>{void matrixPending.confirm().then(ok=>{if(ok)setMatrixOpen(open=>!open);});}}>{matrixOpen?'컨디션 매트릭스 닫기':'컨디션 매트릭스 열기'}</button><span>매트릭스와 섹션의 컨디션은 함께 갱신됩니다.</span></div>
      {matrixOpen && <ConditionMatrix report={props.report} dispatch={props.dispatch}/>}
      <details className="photo-workspace-advanced"><summary>구역 기본값 · 현재 구역 점검 ({sectionIssues.length})</summary><div className="report-input-top-grid"><GroupConditionPanel report={props.report} section={props.activeSection} dispatch={props.dispatch}/><SectionQaPanel section={props.activeSection} issues={sectionIssues} onFocusPhase={(phase)=>props.onSelectPhotoTarget({sectionId:props.activeSection.id,phase})}/></div></details>
      <PhotoWorkspace report={props.report} section={props.activeSection} phase={props.activePhotoTarget?.phase??props.activeSection.phases[0]} dispatch={props.dispatch}
        onPhase={(phase)=>props.onSelectPhotoTarget({sectionId:props.activeSection.id,phase})} onSection={props.onSection}
        onAddPhotos={props.onAddPhotos} onOpenLibrary={()=>props.onOpenLibrary('사진 배정',10000,(photos)=>{if(props.activePhotoTarget)props.dispatch({type:'ASSIGN_PHOTOS',photoIds:photos.map(photo=>photo.id),...props.activePhotoTarget});})}
        renderThumb={(photo)=><PhotoThumb file={photo.file} alt={photo.file.name}/>}/>
      <p className="photo-delete-note">미배정으로 이동해도 불러온 사진과 편집 내용은 유지됩니다.</p>
    </section>
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
  const pending=usePendingContext();
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
          onClick={() => {void pending.confirm().then((ok)=>{if(ok)setPhaseChoice(phase);});}}
        >{phase}</button>)}
      </div>
    </header>
    <GroupConditionDraftEditor
      key={`${groupKey}:${selectedPhase}`}
      condition={storedDefault}
      savedDraft={report.groupDrafts?.[`${groupKey}:${selectedPhase}`]}
      onDraft={(condition)=>dispatch({type:'GROUP_DRAFT',key:`${groupKey}:${selectedPhase}`,condition})}
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

function GroupConditionDraftEditor({ condition, phase, onApply, savedDraft, onDraft }: {
  savedDraft?:Condition; onDraft:(condition:Condition|null)=>void;
  condition: Condition;
  phase: Phase;
  onApply: (condition: Condition) => void;
}) {
  const [draft, setDraft] = useState<Condition>(() => cloneCondition(savedDraft??condition));
  const {entry:entryRef}=usePendingContext();
  const dirty=JSON.stringify(draft)!==JSON.stringify(condition);
  useEffect(()=>{if(!dirty)return;const item={apply:()=>{onApply(draft);onDraft(null);},discard:()=>{setDraft(cloneCondition(condition));onDraft(null);}};entryRef.current=item;return()=>{if(entryRef.current===item)entryRef.current=null;};},[dirty,draft,condition,onApply,onDraft,entryRef]);
  const changeDraft = (patch: ConditionPatch) => {
    const next=patchCondition(draft,patch);setDraft(next);onDraft(next);
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
      onClick={() => {onApply(draft);onDraft(null);}}
    >{phase} 기본값 적용</button></div>
  </>;
}


interface CheckPreviewProps {
  jobNo:string;
  report: ReportState; activeSection: ReportSection; vesselName: string;
  vesselDiagram: VesselDiagramConfig;
  issues: ReturnType<typeof checkReport>;
  onIssue: (issue: QaIssue) => void; onSection: (sectionId: string) => void; onNext: () => void;
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
  return <div className="check-layout"><aside className="qa-panel"><div className="qa-title"><p className="step-kicker">STEP 07</p><h2>Report Check</h2><span>{props.issues.length}</span></div><p>필수 수정 {props.issues.filter((issue)=>issue.severity==='ERROR').length} · 확인 권장 {props.issues.filter((issue)=>issue.severity==='WARNING').length}. 목록에서 해당 입력으로 이동합니다. 디테일 페이지 수이며 전체 문서 페이지와 다릅니다.</p>{props.issues.length ? <><button type="button" className="qa-summary" aria-expanded={issuesOpen} onClick={() => setIssuesOpen((open) => !open)}>Report Check {props.issues.length} issues <span>{issuesOpen ? '접기' : '목록 보기'}</span></button>{issuesOpen && <div className="qa-list">{props.issues.map((issue) => <button type="button" key={issue.id} onClick={() => props.onIssue(issue)}><span className={`issue-icon ${issue.kind.toLowerCase()}`}>!</span><span><b>{issue.kind === 'UNMATCHED' ? '미배정 사진' : issue.kind.startsWith('MISSING_COVER') ? '커버 확인' : issue.kind.replaceAll('_', ' ')}</b><em>{issue.message}</em></span><i>→</i></button>)}</div>}</> : <div className="qa-clear"><b>✓</b><span>확인할 오류가 없습니다.</span></div>}</aside>
    <section className="preview-area"><div className="preview-toolbar"><div><p className="eyebrow">WORD TEMPLATE PREVIEW · DETAIL PAGES</p><h2>{props.activeSection.id}</h2></div><select aria-label="Preview section" value={props.activeSection.id} onChange={(event) => props.onSection(event.target.value)}>{props.report.sections.map((section) => <option key={section.id}>{section.id}</option>)}</select><b className="preview-count">{wordPages.length} PAGES</b></div>
      <div className="preview-stage" aria-label="전체 Report Preview">{wordPages.length ? wordPages.map((page) => {
        const pageNumber = allWordPages.indexOf(page) + 1;
        return <WordTemplatePreviewPage
          jobNo={props.jobNo}
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
  jobNo,
  page,
  pageNumber,
  totalPages,
  vesselName,
  vesselDiagram,
}: {
  jobNo:string;
  page: WordPhasePage;
  pageNumber: number;
  totalPages: number;
  vesselName: string;
  vesselDiagram: VesselDiagramConfig;
}) {
  const slotCount = page.kind === 'first' ? 4 : 6;
  return <article className={`report-page word-template-page ${page.kind}`} aria-label={`Word template preview page ${pageNumber}`}>
    <header className="template-page-header"><div className="template-brand"><div className="template-logo"><b>US</b><span>UNDERWATER<br />SOLUTION</span></div><div><b>Underwater Solution Co.,Ltd</b><strong>UNDERWATER SERVICE REPORT</strong><span>Underwater Inspection &amp; Cleaning</span><span>Photo Documentation</span></div></div><dl><div><dt>Job No</dt><dd>{jobNo || '—'}</dd></div><div><dt>Vessel</dt><dd>{vesselName}</dd></div><div><dt /><dd>Company Confidential</dd></div><div><dt /><dd>PAGE {pageNumber} / {totalPages}</dd></div></dl></header>
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

function ExportScreen({ vesselName, report, status, onBack, onExport, onDiagramSetup, busy, issues, onIssue }: { vesselName: string; report: ReportState; status: string; onBack: () => void; onExport: () => void; onDiagramSetup?: () => void; busy: boolean; issues:QaIssue[];onIssue:(issue:QaIssue)=>void }) {
  const wordPageCount = buildWordPhasePages(report.sections, report.photos, report.reportLabels, report.workPerformLabels, true).length;
  const summaryPageCount = buildSummaryModel(report.sections).pageCount;
  return <div className="workspace export-workspace"><div className="page-heading"><div><p className="step-kicker">STEP 09</p><h2>Word 보고서 다운로드</h2><p>커버와 Sections 1–8을 공식 양식 순서로 조립하고 Summary와 Detail 값을 채웁니다.</p></div><span className="privacy-chip">LOCAL EXPORT</span></div><div className="export-card"><div className="export-doc"><span>DOCX</span><div><b>{vesselName}</b><p>전체 보고서 · Summary {summaryPageCount} pages · Detail {wordPageCount} pages · {report.photos.filter((photo) => photo.reportUse && photo.sectionId).length} photos</p></div></div><dl><div><dt>Order</dt><dd>COVER → 1–4 → 5 → 6 → 7 → 8</dd></div><div><dt>Detail rule</dt><dd>Matrix order · Before → After</dd></div><div><dt>Processing</dt><dd>Sequential local resize</dd></div></dl><section aria-label="최종 보고서 점검"><h3>미완료 {issues.filter((issue)=>issue.severity==='ERROR').length} · 확인 권장 {issues.filter((issue)=>issue.severity==='WARNING').length}</h3>{issues.map((issue)=><button type="button" key={issue.id} onClick={()=>onIssue(issue)}>{issue.severity==='ERROR'?'미완료':'확인 권장'} · {issue.message}</button>)}<p>전체 구성: 커버 → 1. 선박 정보 → 2. 운영 정보 → 3. 작업 항목 → 4. 안전 기록 → 5. 서머리 → 6. 평가 기준 → 7. 디테일 → 8. 자격자료</p><p>표시된 페이지 수는 해당 부분의 예상치입니다. 전체 문서의 최종 페이지 나눔은 Word에서 확인하세요.</p></section><button type="button" className="primary export-button" disabled={busy} onClick={onExport}>{busy ? 'Word 생성 중…' : 'Word 보고서 다운로드'}</button><p role={onDiagramSetup ? 'alert' : undefined}>{status}</p>{onDiagramSetup && <button type="button" className="ghost" onClick={onDiagramSetup}>선박 위치도 설정으로 돌아가기</button>}</div><div className="actionbar"><button type="button" className="text-button" onClick={onBack}>← Summary 확인</button></div></div>;
}
