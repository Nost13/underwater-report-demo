export type ServiceKind = 'INSPECTION' | 'CLEANING' | 'POLISHING' | 'REPAIR' | 'REMOVAL';
export type Phase = 'CURRENT' | 'BEFORE' | 'AFTER';
export type NicheType = 'SINGLE' | 'SIDE' | 'QUANTITY' | 'SIDE_QUANTITY';
export type Side = 'PORT' | 'STBD' | 'BOTTOM';
export type FoulingCoverage = '' | '0%' | '1-100% / Slime Only' | '1-5%' | '6-25%' | '26-50%' | '51-100%';
export type FoulingType = '' | 'Clean / No Fouling' | 'Micro fouling' | 'Light Macro fouling' | 'Medium Macro Fouling' | 'Heavy Macro fouling' | 'Severe Macro Fouling';
export type ObservedLevel = '' | 'Normal / Trace' | 'Minor Observation' | 'Notable Observation' | 'Significant Observation' | 'Critical Observation';
export type ObservedType = '' | 'Coating' | 'Damage' | 'Scratch' | 'Corrosion' | 'Other';

export interface Condition {
  fouling: {
    type: FoulingType;
    coverage: FoulingCoverage;
  };
  observed: {
    type: ObservedType;
    level: ObservedLevel;
  };
}

export interface ReportSection {
  id: string;
  targetId: string;
  area: 'GENERAL' | 'NICHE';
  component: string;
  side?: Side;
  unit?: number;
  service: ServiceKind;
  phases: Phase[];
  conditions: Partial<Record<Phase, Condition>>;
}

export interface ScopeTarget {
  id: string;
  area: 'GENERAL' | 'NICHE';
  component: string;
  side?: Side;
  unit?: number;
  services: ServiceKind[];
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
