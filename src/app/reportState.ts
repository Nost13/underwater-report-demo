import { paginateSection, type ReportPage } from '../domain/pagination';
import type { Condition, Phase, PhotoData, ReportSection } from '../domain/types';

export interface ReportState {
  sections: ReportSection[];
  photos: PhotoData[];
  focusedSectionId: string | null;
}

export type ReportAction =
  | { type: 'SET_SCOPE'; sections: ReportSection[] }
  | { type: 'IMPORT_PHOTOS'; photos: PhotoData[] }
  | { type: 'ASSIGN_PHOTO'; photoId: string; sectionId: string; phase: Phase }
  | { type: 'UNASSIGN_PHOTO'; photoId: string }
  | { type: 'TOGGLE_REPORT_USE'; photoId: string }
  | { type: 'UPDATE_CONDITION'; sectionId: string; phase: Phase; patch: Partial<Condition> }
  | { type: 'FOCUS_SECTION'; sectionId: string };

export const initialReportState: ReportState = {
  sections: [],
  photos: [],
  focusedSectionId: null,
};

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'SET_SCOPE':
      return { sections: action.sections, photos: [], focusedSectionId: action.sections[0]?.id ?? null };
    case 'IMPORT_PHOTOS': {
      const existing = new Set(state.photos.map((photo) => `${photo.relativePath}|${photo.file.size}|${photo.file.lastModified}`));
      const incoming = action.photos.filter((photo) => !existing.has(`${photo.relativePath}|${photo.file.size}|${photo.file.lastModified}`));
      return { ...state, photos: [...state.photos, ...incoming] };
    }
    case 'ASSIGN_PHOTO':
      return { ...state, photos: state.photos.map((photo) => photo.id === action.photoId ? { ...photo, sectionId: action.sectionId, phase: action.phase } : photo) };
    case 'UNASSIGN_PHOTO':
      return { ...state, photos: state.photos.map((photo) => photo.id === action.photoId ? { ...photo, sectionId: null, phase: null } : photo) };
    case 'TOGGLE_REPORT_USE':
      return { ...state, photos: state.photos.map((photo) => photo.id === action.photoId ? { ...photo, reportUse: !photo.reportUse } : photo) };
    case 'UPDATE_CONDITION':
      return {
        ...state,
        sections: state.sections.map((section) => section.id === action.sectionId ? {
          ...section,
          conditions: {
            ...section.conditions,
            [action.phase]: {
              class: '', rating: '', detail: '',
              ...section.conditions[action.phase],
              ...action.patch,
            },
          },
        } : section),
      };
    case 'FOCUS_SECTION':
      return { ...state, focusedSectionId: action.sectionId };
  }
}

export const selectedPages = (state: ReportState): ReportPage[] =>
  state.focusedSectionId ? paginateSection(state.focusedSectionId, state.photos) : [];
