export type ServiceKind = 'INSPECTION' | 'CLEANING' | 'POLISHING' | 'REPAIR' | 'REMOVAL';
export type Phase = 'CURRENT' | 'BEFORE' | 'AFTER';
export type NicheType = 'SINGLE' | 'SIDE' | 'QUANTITY' | 'SIDE_QUANTITY';
export type Side = 'PORT' | 'STBD' | 'BOTTOM';
export type ConditionClass = '' | 'CLEAN' | 'BIOFOULING' | 'DAMAGE' | 'COATING';
export type ConditionRating = '' | 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export interface Condition {
  class: ConditionClass;
  rating: ConditionRating;
  detail: string;
}

export interface ReportSection {
  id: string;
  area: 'GENERAL' | 'NICHE';
  component: string;
  side?: Side;
  unit?: number;
  service: ServiceKind;
  phases: Phase[];
  conditions: Partial<Record<Phase, Condition>>;
}

export interface PhotoData {
  id: string;
  sectionId: string | null;
  phase: Phase | null;
  file: File;
  reportUse: boolean;
  order: number;
  relativePath: string;
}

export interface NicheInput {
  component: string;
  type: NicheType;
  quantity: number;
  service: ServiceKind;
}

export type QaIssueKind =
  | 'MISSING_PHASE_PHOTO'
  | 'MISSING_CONDITION'
  | 'PHASE_IMBALANCE'
  | 'UNMATCHED';

export interface QaIssue {
  id: string;
  kind: QaIssueKind;
  message: string;
  sectionId: string | null;
}
