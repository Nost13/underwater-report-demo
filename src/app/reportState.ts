import { paginateSection, type ReportPage } from '../domain/pagination';
import type { Condition, Phase, PhotoData, ReportLabelMap, ReportLabels, ReportSection, WorkPerformLabelMap } from '../domain/types';
import { initializeReportLabels } from './reportLabels';
import { initializeWorkPerformLabels, workPerformLabelKey } from './workPerformLabels';
import {
  cloneCondition,
  conditionGroupKey,
  initializeConditionInheritance,
  patchCondition,
  type ConditionDefaults,
  type ConditionPatch,
  type ConditionSources,
} from './conditionDefaults';

export interface ReportState {
  sections: ReportSection[];
  photos: PhotoData[];
  focusedSectionId: string | null;
  conditionDefaults: ConditionDefaults;
  conditionSources: ConditionSources;
  reportLabels: ReportLabelMap;
  workPerformLabels: WorkPerformLabelMap;
}

export type ReportAction =
  | { type: 'SET_SCOPE'; sections: ReportSection[] }
  | { type: 'IMPORT_PHOTOS'; photos: PhotoData[] }
  | { type: 'ASSIGN_PHOTO'; photoId: string; sectionId: string; phase: Phase }
  | { type: 'UNASSIGN_PHOTO'; photoId: string }
  | { type: 'UPDATE_PHOTO_CAPTION'; photoId: string; value: string }
  | { type: 'REORDER_PHOTO'; photoId: string; beforePhotoId: string | null }
  | { type: 'TOGGLE_REPORT_USE'; photoId: string }
  | { type: 'DELETE_PHOTO'; photoId: string }
  | { type: 'UPDATE_CONDITION'; sectionId: string; phase: Phase; patch: ConditionPatch }
  | { type: 'APPLY_GROUP_CONDITION'; sectionId: string; phase: Phase; condition: Condition }
  | { type: 'REVERT_CONDITION_TO_GROUP'; sectionId: string; phase: Phase }
  | { type: 'UPDATE_REPORT_LABELS'; groupKey: string; labels: Partial<ReportLabels> }
  | { type: 'UPDATE_WORK_PERFORM_LABEL'; sectionId: string; phase: Phase; field: 'main' | 'phase'; value: string }
  | { type: 'FOCUS_SECTION'; sectionId: string };

export const initialReportState: ReportState = {
  sections: [],
  photos: [],
  focusedSectionId: null,
  conditionDefaults: {},
  conditionSources: {},
  reportLabels: {},
  workPerformLabels: {},
};

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'SET_SCOPE': {
      const inheritance = initializeConditionInheritance(action.sections);
      return {
        sections: action.sections,
        photos: [],
        focusedSectionId: action.sections[0]?.id ?? null,
        reportLabels: initializeReportLabels(action.sections),
        workPerformLabels: initializeWorkPerformLabels(action.sections),
        ...inheritance,
      };
    }
    case 'IMPORT_PHOTOS': {
      const existing = new Set(state.photos.map((photo) => `${photo.relativePath}|${photo.file.size}|${photo.file.lastModified}`));
      const incoming = action.photos.filter((photo) => !existing.has(`${photo.relativePath}|${photo.file.size}|${photo.file.lastModified}`));
      return { ...state, photos: [...state.photos, ...incoming] };
    }
    case 'ASSIGN_PHOTO': {
      const target = state.photos.find((photo) => photo.id === action.photoId);
      if (!target) return state;
      const destinationOrders = state.photos
        .filter((photo) => (
          photo.id !== action.photoId
          && photo.sectionId === action.sectionId
          && photo.phase === action.phase
        ))
        .map((photo) => photo.order);
      const nextOrder = destinationOrders.length > 0 ? Math.max(...destinationOrders) + 1 : 0;
      return {
        ...state,
        photos: state.photos.map((photo) => photo.id === action.photoId ? {
          ...photo,
          sectionId: action.sectionId,
          phase: action.phase,
          order: nextOrder,
        } : photo),
      };
    }
    case 'UNASSIGN_PHOTO':
      return { ...state, photos: state.photos.map((photo) => photo.id === action.photoId ? { ...photo, sectionId: null, phase: null } : photo) };
    case 'UPDATE_PHOTO_CAPTION': {
      const target = state.photos.find((photo) => photo.id === action.photoId);
      if (!target) return state;
      return {
        ...state,
        photos: state.photos.map((photo) => photo.id === action.photoId
          ? { ...photo, captionText: action.value }
          : photo),
      };
    }
    case 'REORDER_PHOTO': {
      const dragged = state.photos.find((photo) => photo.id === action.photoId);
      if (!dragged?.sectionId || !dragged.phase) return state;
      const before = action.beforePhotoId === null
        ? null
        : state.photos.find((photo) => photo.id === action.beforePhotoId);
      if (
        action.beforePhotoId !== null
        && (!before || before.id === dragged.id
          || before.sectionId !== dragged.sectionId
          || before.phase !== dragged.phase)
      ) return state;

      const group = state.photos
        .filter((photo) => photo.sectionId === dragged.sectionId && photo.phase === dragged.phase)
        .sort((left, right) => left.order - right.order)
        .filter((photo) => photo.id !== dragged.id);
      const insertAt = before ? group.findIndex((photo) => photo.id === before.id) : group.length;
      group.splice(insertAt, 0, dragged);
      const normalizedOrders = new Map(group.map((photo, order) => [photo.id, order]));
      return {
        ...state,
        photos: state.photos.map((photo) => normalizedOrders.has(photo.id)
          ? { ...photo, order: normalizedOrders.get(photo.id)! }
          : photo),
      };
    }
    case 'TOGGLE_REPORT_USE':
      return { ...state, photos: state.photos.map((photo) => photo.id === action.photoId ? { ...photo, reportUse: !photo.reportUse } : photo) };
    case 'DELETE_PHOTO':
      return { ...state, photos: state.photos.filter((photo) => photo.id !== action.photoId) };
    case 'UPDATE_CONDITION': {
      const target = state.sections.find((section) => section.id === action.sectionId);
      const current = target?.phases.includes(action.phase)
        ? target.conditions[action.phase]
        : undefined;
      if (!current) return state;
      return {
        ...state,
        sections: state.sections.map((section) => section.id === action.sectionId ? {
          ...section,
          conditions: {
            ...section.conditions,
            [action.phase]: patchCondition(current, action.patch),
          },
        } : section),
        conditionSources: {
          ...state.conditionSources,
          [action.sectionId]: {
            ...state.conditionSources[action.sectionId],
            [action.phase]: 'OVERRIDE',
          },
        },
      };
    }
    case 'APPLY_GROUP_CONDITION': {
      const anchor = state.sections.find((section) => section.id === action.sectionId);
      if (!anchor?.phases.includes(action.phase)) return state;
      const groupKey = conditionGroupKey(anchor);
      const nextDefault = cloneCondition(action.condition);
      return {
        ...state,
        conditionDefaults: {
          ...state.conditionDefaults,
          [groupKey]: {
            ...state.conditionDefaults[groupKey],
            [action.phase]: nextDefault,
          },
        },
        sections: state.sections.map((section) => (
          conditionGroupKey(section) === groupKey
          && section.phases.includes(action.phase)
          && state.conditionSources[section.id]?.[action.phase] !== 'OVERRIDE'
            ? {
              ...section,
              conditions: {
                ...section.conditions,
                [action.phase]: cloneCondition(nextDefault),
              },
            }
            : section
        )),
      };
    }
    case 'REVERT_CONDITION_TO_GROUP': {
      const anchor = state.sections.find((section) => section.id === action.sectionId);
      if (!anchor?.phases.includes(action.phase)) return state;
      const groupDefault = state.conditionDefaults[conditionGroupKey(anchor)]?.[action.phase];
      if (!groupDefault) return state;
      return {
        ...state,
        sections: state.sections.map((section) => section.id === action.sectionId ? {
          ...section,
          conditions: {
            ...section.conditions,
            [action.phase]: cloneCondition(groupDefault),
          },
        } : section),
        conditionSources: {
          ...state.conditionSources,
          [action.sectionId]: {
            ...state.conditionSources[action.sectionId],
            [action.phase]: 'GROUP',
          },
        },
      };
    }
    case 'UPDATE_REPORT_LABELS': {
      const current = state.reportLabels[action.groupKey];
      if (!current) return state;
      return {
        ...state,
        reportLabels: {
          ...state.reportLabels,
          [action.groupKey]: { ...current, ...action.labels },
        },
      };
    }
    case 'UPDATE_WORK_PERFORM_LABEL': {
      const key = workPerformLabelKey(action.sectionId, action.phase);
      const current = state.workPerformLabels[key];
      if (!current) return state;
      return {
        ...state,
        workPerformLabels: {
          ...state.workPerformLabels,
          [key]: { ...current, [action.field]: action.value },
        },
      };
    }
    case 'FOCUS_SECTION':
      return { ...state, focusedSectionId: action.sectionId };
  }
}

export const selectedPages = (state: ReportState): ReportPage[] =>
  state.focusedSectionId ? paginateSection(state.focusedSectionId, state.photos) : [];
